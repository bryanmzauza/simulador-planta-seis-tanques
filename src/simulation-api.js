import * as sim from './simulator.js';

const indexed = items => Object.fromEntries(items.map(item => [item.id, { ...item }]));

/* Somente este adaptador pode converter mensagens dos scripts em comandos do simulador.
   Não há dependência de real.js, por escolha de isolamento.
 */
export function createSimulationAPI(isSimulationMode) {
    function assertMode() {
        if (!isSimulationMode()) throw new Error('Código disponível apenas em Simulação.');
    }
    function targets() {
        const p = sim.simulatedPlant;
        return {
            pumps: indexed(p.pumps),
            valves: indexed([p.mainValve, ...p.actuatedValves, ...p.recycleValves, ...p.manualValves]),
            relays: indexed(p.threeWayValves)
        };
    }
    return {
        snapshot() {
            assertMode();
            const p = sim.simulatedPlant;
            return {
                time: sim.simulationRuntime.time,
                tanks: Object.fromEntries(p.tanks.map(t => [t.id, {
                    ...t, level: (p.levelSensors.find(s => s.tank === t.id)?.level ?? 0) / 100
                }])),
                ...targets(),
                sensors: indexed([...p.levelSensors, ...p.flowSensors])
            };
        },
        apply(commands) {
            assertMode();
            if (!Array.isArray(commands) || commands.length > 100) throw new Error('Limite: 100 comandos por ciclo.');
            const allowed = targets();
            // Valida o lote inteiro antes de alterar qualquer atuador.
            for (const c of commands) {
                if (!c || !Object.hasOwn(allowed, c.group) || !Object.hasOwn(allowed[c.group], c.id)) throw new Error('Atuador desconhecido.');
                if (c.group === 'relays' ? typeof c.value !== 'boolean' : typeof c.value !== 'number' || !Number.isFinite(c.value) || c.value < 0 || c.value > 1) throw new Error('Comando inválido: use 0 a 1; relés usam true/false.');
            }
            for (const { group, id, value } of commands) {
                if (group === 'pumps') {
                    sim.setPumpCommand(id, value);
                    sim.setPumpPower(id, value > 0);
                } else if (group === 'relays') sim.setThreeWayValveState(id, value);
                else if (id === 'MV') sim.setMainValveOpening(value);
                else if (sim.simulatedPlant.actuatedValves.some(v => v.id === id)) sim.setActuatedValveOpening(id, value);
                else if (sim.simulatedPlant.recycleValves.some(v => v.id === id)) sim.setRecycleValveOpening(id, value);
                else sim.setManualValveOpening(id, value);
            }
        }
    };
}
