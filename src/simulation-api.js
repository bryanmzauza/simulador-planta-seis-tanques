// API DE SIMULAÇÃO PARA O CÓDIGO DO USUÁRIO
/* Monta o snapshot que o Worker recebe a cada ciclo e valida/aplica o lote
   de comandos que ele devolve. Os comandos viram mensagens para o backend
   (real.js#sendCommand), que só as aceita no modo MODELICA: no modo
   HARDWARE nada é enviado, por construção. O lote é tudo ou nada. */

import {
    realPlant,
    realRuntime,
    setPump,
    setValveOpening,
    setManualValveOpening,
    setRelayState,
    setLoop
} from './real.js';

const MAX_COMMANDS = 100;
const ACTUATED = new Set(['MV', 'V1', 'V2', 'V3', 'V4']);
const RELAYS = new Set(['X1A', 'X1B', 'X2A', 'X2B']);

function byId(collection) {
    const map = {};
    for (const item of collection) map[item.id] = { ...item };
    return map;
}

function finite01(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function createSimulationAPI(isSimulationMode) {
    const snapshot = () => {
        if (!isSimulationMode()) throw new Error('A API de simulação só está disponível com o backend no modo MODELICA.');
        const tanks = {};
        for (const tank of realPlant.tanks) {
            tanks[tank.id] = {
                id: tank.id,
                level: tank.level === null ? null : tank.level / 100,   // 0 a 1
                height: tank.height,                                  // m
                heightCm: tank.heightCm,                              // cm
                volume: tank.volume                                   // L
            };
        }
        const valves = { MV: { ...realPlant.mainValve } };
        for (const valve of [...realPlant.actuatedValves, ...realPlant.recycleValves, ...realPlant.manualValves]) {
            valves[valve.id] = { ...valve };
        }
        const loops = {};
        for (const [tag, loop] of Object.entries(realRuntime.loops ?? {})) {
            loops[tag] = { tag, pv: loop.pv, sp: loop.sp, mv: loop.mv, mode: loop.effectiveMode ?? loop.mode, unit: loop.unit };
        }
        return {
            time: realRuntime.sim.t,
            scenario: realRuntime.scenario,
            tanks,
            pumps: byId(realPlant.pumps),
            valves,
            relays: byId(realPlant.threeWayValves),
            sensors: { ...byId(realPlant.levelSensors), ...byId(realPlant.flowSensors) },  // FT em L/min
            loops
        };
    };

    const apply = commands => {
        if (!isSimulationMode()) throw new Error('Comandos só são aceitos no modo MODELICA.');
        if (!Array.isArray(commands)) throw new Error('Lote de comandos inválido.');
        if (commands.length > MAX_COMMANDS) throw new Error(`Máximo de ${MAX_COMMANDS} comandos por ciclo.`);

        const pumps = new Set(realPlant.pumps.map(p => p.id));
        const manual = new Set([...realPlant.recycleValves, ...realPlant.manualValves].map(v => v.id));
        const loops = new Set(Object.keys(realRuntime.loops ?? {}));

        // Validação de tudo antes de enviar qualquer coisa
        for (const command of commands) {
            if (!command || typeof command !== 'object') throw new Error('Comando inválido.');
            const { group, id, value } = command;
            if (group === 'pumps') {
                if (!pumps.has(id) || !finite01(value)) throw new Error(`Comando inválido para a bomba ${id}.`);
            } else if (group === 'valves') {
                if (!(ACTUATED.has(id) || manual.has(id)) || !finite01(value)) throw new Error(`Comando inválido para a válvula ${id}.`);
            } else if (group === 'relays') {
                if (!RELAYS.has(id) || typeof value !== 'boolean') throw new Error(`Comando inválido para o relé ${id}.`);
            } else if (group === 'loops') {
                if (!loops.has(id) || !value || typeof value !== 'object') throw new Error(`Comando inválido para a malha ${id}.`);
                if (value.sp !== undefined && !(typeof value.sp === 'number' && Number.isFinite(value.sp))) throw new Error(`SP inválido para ${id}.`);
                if (value.mode !== undefined && value.mode !== 'AUTO' && value.mode !== 'MAN') throw new Error(`Modo inválido para ${id}.`);
                if (value.mv !== undefined && !finite01(value.mv)) throw new Error(`MV inválida para ${id}.`);
            } else {
                throw new Error(`Grupo desconhecido: ${group}.`);
            }
        }

        for (const { group, id, value } of commands) {
            if (group === 'pumps') setPump(id, value > 0, value);
            else if (group === 'valves') (ACTUATED.has(id) ? setValveOpening : setManualValveOpening)(id, value);
            else if (group === 'relays') setRelayState(id, value);
            else if (group === 'loops') setLoop(id, { sp: value.sp, mode: value.mode, mv: value.mv });
        }
    };

    return { snapshot, apply };
}
