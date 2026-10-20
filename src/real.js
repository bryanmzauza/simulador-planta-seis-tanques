// CLIENTE DO BACKEND (WEBSOCKET)
/* Única fonte de estado da HMI. O backend Python (python/server.py) publica
   o estado da planta a cada 100 ms, venha ele da FMU Modelica (modo
   MODELICA), do mock (MOCK) ou da bancada (HARDWARE).

   Regras:
   - dado ausente não é zero: campo faltando/inválido vira null e a HMI
     mostra "—"; após desconexão tudo é invalidado;
   - no modo HARDWARE a HMI é somente leitura: nenhum comando é enviado;
   - os IDs internos (H1, P1, V1, X1A, LT1, FT1...) não são traduzidos aqui. */

import { createPlantState } from './plant-state.js';

// ESTADO

export const realPlant = createPlantState();

for (const sensor of realPlant.flowSensors) {
    sensor.flow = null;
    sensor.raw = null;
    sensor.status = 'unavailable';
}

for (const sensor of realPlant.levelSensors) {
    sensor.level = null;
    sensor.heightCm = null;
    sensor.pressure = null;
    sensor.voltage = null;
    sensor.raw = null;
    sensor.status = 'unavailable';
}

for (const tank of realPlant.tanks) {
    tank.level = null;
    tank.height = null;
    tank.heightCm = null;
    tank.volume = null;
}

for (const valve of realPlant.threeWayValves) {
    valve.state = false;
}

export const realRuntime = {
    connected: false,
    connecting: false,
    connectionLabel: 'Desconectado',
    transport: 'WebSocket',
    port: '8765',
    url: 'ws://localhost:8765',
    lastUpdate: null,
    lastError: null,

    // Modo informado pelo backend: 'MODELICA' | 'MOCK' | 'HARDWARE' | null
    backendMode: null,

    // Relógio e controle da simulação (modo MODELICA)
    sim: {
        t: 0,
        running: false,
        speed: 1,
        realtimeRatio: 1,
        cpuMs: 0,
        initialLevels: {},
        tankHeightCm: 25,
        error: null
    },

    scenario: null,
    scenarios: [],
    loops: {},
    xv: {},
    alarms: [],

    // Vazões por trecho do P&ID (L/min) e no formato antigo por segmento
    segments: {},
    flows: {}
};

const TANK_IDS = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

// Trecho do P&ID <- segmento do formato antigo (MOCK/HARDWARE)
const LEGACY_SEGMENTS = {
    B103: 'RES_P3',
    LV101: 'MV_V1',
    LV102: 'MV_V2',
    XV101A: 'V1_X1A',
    XV101B: 'V1_X1B',
    XV102A: 'V2_X2A',
    XV102B: 'V2_X2B',
    HV105: 'H5_HV3_IN',
    HV106: 'H6_HV4_IN',
    B101: 'H3_HV3_P1',
    B102: 'H4_HV4_P2',
    LV103: 'P1_V3',
    LV104: 'P2_V4',
    HV107: 'P1_RV1',
    HV108: 'P2_RV2',
    HV101: 'H1_HV1_DRAIN',
    HV102: 'H2_HV2_DRAIN'
};

let socket = null;
let intentionalClose = false;
let reconnectTimer = null;
let autoReconnect = true;
const listeners = new Set();

// AUXILIARES

function finite(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function byId(collection, id) {
    return collection.find(item => item.id === id) ?? null;
}

export function isWritable() {
    return realRuntime.connected && realRuntime.backendMode !== 'HARDWARE' && realRuntime.backendMode !== null;
}

export function isModelica() {
    return realRuntime.backendMode === 'MODELICA';
}

export function onRealUpdate(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notify() {
    for (const listener of listeners) {
        try {
            listener();
        } catch (error) {
            console.error('[REAL] listener', error);
        }
    }
}

// INVALIDAÇÃO
/* Chamada em cada quadro antes de aplicar os dados e na desconexão:
   nada do quadro anterior sobrevive. */

function clearMeasurements() {
    for (const sensor of realPlant.flowSensors) {
        sensor.flow = null;
        sensor.raw = null;
        sensor.status = 'unavailable';
    }
    for (const sensor of realPlant.levelSensors) {
        sensor.level = null;
        sensor.heightCm = null;
        sensor.pressure = null;
        sensor.voltage = null;
        sensor.raw = null;
        sensor.status = 'unavailable';
    }
    for (const tank of realPlant.tanks) {
        tank.level = null;
        tank.height = null;
        tank.heightCm = null;
        tank.volume = null;
    }
}

// APLICAÇÃO DO ESTADO

export function applyRealData(data) {
    clearMeasurements();

    if (!data || typeof data !== 'object') {
        return false;
    }

    // TANQUES
    if (data.tanks && typeof data.tanks === 'object') {
        for (const tank of realPlant.tanks) {
            const source = data.tanks[tank.id];
            if (!source || typeof source !== 'object') continue;
            const level = finite(source.level);
            tank.level = level === null ? null : Math.max(0, Math.min(100, level));
            const height = finite(source.height);
            tank.height = height === null ? null : Math.max(0, height);
            const heightCm = finite(source.heightCm);
            tank.heightCm = heightCm === null ? null : Math.max(0, heightCm);
            const volume = finite(source.volume);
            tank.volume = volume === null ? null : Math.max(0, volume);
        }
    }

    // SENSORES DE NÍVEL
    if (data.levelSensors && typeof data.levelSensors === 'object') {
        for (const sensor of realPlant.levelSensors) {
            const source = data.levelSensors[sensor.id];
            if (!source || typeof source !== 'object') continue;
            const level = finite(source.level);
            sensor.level = level === null ? null : Math.max(0, Math.min(100, level));
            sensor.heightCm = finite(source.heightCm);
            const pressure = finite(source.pressure);
            sensor.pressure = pressure === null ? null : Math.max(0, pressure);
            sensor.voltage = finite(source.voltage);
            sensor.raw = source.raw ?? null;
            sensor.status = source.status ?? (sensor.level === null ? 'unavailable' : 'available');

            const tank = byId(realPlant.tanks, sensor.tank);
            if (tank && sensor.level !== null) {
                tank.level = sensor.level;
                if (tank.heightCm === null && sensor.heightCm !== null) tank.heightCm = sensor.heightCm;
            }
        }
    }

    // SENSORES DE VAZÃO
    if (data.flowSensors && typeof data.flowSensors === 'object') {
        for (const sensor of realPlant.flowSensors) {
            const source = data.flowSensors[sensor.id];
            if (!source || typeof source !== 'object') continue;
            const flow = finite(source.flow);
            sensor.flow = flow === null ? null : Math.max(0, flow);
            sensor.raw = source.raw ?? null;
            sensor.status = source.status ?? (sensor.flow === null ? 'unavailable' : 'available');
        }
    }

    // BOMBAS
    if (data.pumps && typeof data.pumps === 'object') {
        for (const pump of realPlant.pumps) {
            const source = data.pumps[pump.id];
            if (!source || typeof source !== 'object') continue;
            if ('power' in source) pump.power = source.power ? 1 : 0;
            const command = finite(source.command);
            if (command !== null) pump.command = clamp01(command);
        }
    }

    // VÁLVULAS
    if (data.mainValve && typeof data.mainValve === 'object') {
        const opening = finite(data.mainValve.opening);
        if (opening !== null) realPlant.mainValve.opening = clamp01(opening);
    }

    const valveGroups = [
        ['actuatedValves', realPlant.actuatedValves],
        ['recycleValves', realPlant.recycleValves],
        ['manualValves', realPlant.manualValves]
    ];

    for (const [key, collection] of valveGroups) {
        const group = data[key];
        if (!group || typeof group !== 'object') continue;
        for (const valve of collection) {
            const source = group[valve.id];
            if (!source || typeof source !== 'object') continue;
            const opening = finite(source.opening);
            if (opening !== null) valve.opening = clamp01(opening);
        }
    }

    if (data.threeWayValves && typeof data.threeWayValves === 'object') {
        for (const valve of realPlant.threeWayValves) {
            const source = data.threeWayValves[valve.id];
            if (!source || typeof source !== 'object') continue;
            valve.state = Boolean(source.state);
        }
    }

    // MODO E SIMULAÇÃO
    realRuntime.backendMode = typeof data.mode === 'string' ? data.mode : realRuntime.backendMode ?? 'MOCK';

    if (data.sim && typeof data.sim === 'object') {
        realRuntime.sim = {
            t: finite(data.sim.t) ?? 0,
            running: Boolean(data.sim.running),
            speed: finite(data.sim.speed) ?? 1,
            realtimeRatio: finite(data.sim.realtimeRatio) ?? 1,
            cpuMs: finite(data.sim.cpuMs) ?? 0,
            initialLevels: data.sim.initialLevels && typeof data.sim.initialLevels === 'object' ? { ...data.sim.initialLevels } : {},
            tankHeightCm: finite(data.sim.tankHeightCm) ?? 25,
            error: typeof data.sim.error === 'string' ? data.sim.error : null
        };
    } else {
        realRuntime.sim = { ...realRuntime.sim, running: false, error: null };
    }

    realRuntime.scenario = typeof data.scenario === 'string' ? data.scenario : null;
    realRuntime.scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
    realRuntime.loops = data.loops && typeof data.loops === 'object' ? data.loops : {};
    realRuntime.xv = data.xv && typeof data.xv === 'object' ? data.xv : {};
    realRuntime.alarms = Array.isArray(data.alarms) ? data.alarms : [];

    // VAZÕES POR TRECHO
    if (data.segments && typeof data.segments === 'object') {
        realRuntime.segments = data.segments;
    } else if (data.flows && typeof data.flows === 'object') {
        const segments = {};
        for (const [segment, legacy] of Object.entries(LEGACY_SEGMENTS)) {
            segments[segment] = finite(data.flows[legacy]);
        }
        realRuntime.segments = segments;
    } else {
        realRuntime.segments = deriveSegmentsFromSensors();
    }
    realRuntime.flows = data.flows && typeof data.flows === 'object' ? data.flows : {};

    realRuntime.lastUpdate = Date.now();
    realRuntime.lastError = null;
    return true;
}

/* Sem vazões por trecho (bancada sem backend de vazões), monta o que os
   FT permitem; o resto fica desconhecido (null), nunca zero. */
function deriveSegmentsFromSensors() {
    const ft = id => byId(realPlant.flowSensors, id)?.flow ?? null;
    const sum = (a, b) => (a === null || b === null ? null : a + b);
    return {
        LV101: ft('FT3'),
        LV102: ft('FT6'),
        XV102A: ft('FT1'),
        XV101B: ft('FT2'),
        LV103: ft('FT4'),
        LV104: ft('FT5'),
        B103: sum(ft('FT3'), ft('FT6')),
        XV101A: null, XV102B: null,
        HV105: null, HV106: null, HV107: null, HV108: null,
        B101: null, B102: null, HV101: null, HV102: null
    };
}

// MENSAGENS

function handleMessage(raw) {
    let message;
    try {
        message = JSON.parse(raw);
    } catch {
        console.warn('[REAL] Mensagem JSON inválida recebida');
        return;
    }
    if (!message || typeof message !== 'object') return;

    if (message.type === 'state') {
        const data = message.data && typeof message.data === 'object' ? message.data : message;
        applyRealData(data);
        notify();
        return;
    }
    if (message.type === 'hello') {
        console.log('[REAL] Servidor Python conectado:', message.server ?? message);
        return;
    }
    if (message.type === 'error') {
        realRuntime.lastError = message.message ?? 'Erro informado pelo servidor Python.';
        console.warn('[REAL]', realRuntime.lastError);
        notify();
        return;
    }
    console.warn('[REAL] Tipo de mensagem desconhecido:', message.type);
}

// CONEXÃO

export function setRealConnectionState(connected, options = {}) {
    realRuntime.connected = Boolean(connected);
    realRuntime.connecting = false;
    realRuntime.connectionLabel = options.label ?? (connected ? 'Conectado' : 'Desconectado');
    if (!connected) {
        clearMeasurements();
        realRuntime.backendMode = null;
        realRuntime.sim = { ...realRuntime.sim, running: false, error: null };
        realRuntime.loops = {};
        realRuntime.alarms = [];
        realRuntime.segments = {};
        realRuntime.flows = {};
    }
    notify();
}

function scheduleReconnect() {
    if (!autoReconnect || intentionalClose || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!realRuntime.connected && !realRuntime.connecting) connectRealPlant(realRuntime.url);
    }, 2000);
}

export function setAutoReconnect(enabled) {
    autoReconnect = Boolean(enabled);
    if (!autoReconnect && reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

export function connectRealPlant(url = realRuntime.url) {
    return new Promise(resolve => {
        if (realRuntime.connected || realRuntime.connecting) {
            resolve(false);
            return;
        }
        realRuntime.url = url;
        realRuntime.port = String(url.split(':').pop() ?? '');
        realRuntime.connecting = true;
        realRuntime.connectionLabel = 'Conectando...';
        intentionalClose = false;
        notify();

        let ws;
        try {
            ws = new WebSocket(url);
        } catch (error) {
            realRuntime.connecting = false;
            realRuntime.lastError = error.message;
            realRuntime.connectionLabel = 'Erro de conexão';
            notify();
            scheduleReconnect();
            resolve(false);
            return;
        }
        socket = ws;

        ws.addEventListener('open', () => {
            // Sem "hello": no modo HARDWARE o servidor responde erro a qualquer mensagem.
            setRealConnectionState(true, { label: 'Conectado' });
            resolve(true);
        });

        ws.addEventListener('message', event => handleMessage(event.data));

        ws.addEventListener('error', () => {
            realRuntime.lastError = 'Falha na conexão WebSocket.';
        });

        ws.addEventListener('close', event => {
            if (socket === ws) socket = null;
            const wasConnecting = realRuntime.connecting;
            if (intentionalClose) {
                setRealConnectionState(false, { label: 'Desconectado' });
            } else if (event.code === 1000) {
                setRealConnectionState(false, { label: 'Desconectado' });
            } else {
                realRuntime.lastError = realRuntime.lastError ?? `Conexão encerrada (código ${event.code})`;
                setRealConnectionState(false, { label: 'Sem conexão com o backend' });
            }
            if (wasConnecting) resolve(false);
            scheduleReconnect();
        });
    });
}

export function disconnectRealPlant() {
    intentionalClose = true;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        try {
            socket.close(1000, 'Desconexão solicitada pela HMI');
        } catch { /* já fechado */ }
        socket = null;
    }
    setRealConnectionState(false, { label: 'Desconectado' });
    return Promise.resolve(true);
}

// COMANDOS
/* Somente leitura no modo HARDWARE: nada é enviado, por construção. */

export function sendCommand(message) {
    if (!isWritable()) return false;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
        socket.send(JSON.stringify(message));
        return true;
    } catch (error) {
        realRuntime.lastError = error.message;
        return false;
    }
}

export function setPumpPower(id, power) {
    return sendCommand({ type: 'pump', id, power: Boolean(power) });
}

export function setPumpCommand(id, command) {
    return sendCommand({ type: 'pump', id, command: clamp01(Number(command)) });
}

export function setPump(id, power, command) {
    return sendCommand({ type: 'pump', id, power: Boolean(power), command: clamp01(Number(command)) });
}

export function setValveOpening(id, opening) {
    // MV (HV-109) e V1..V4 (LV-101..104)
    return sendCommand({ type: 'valve', id, opening: clamp01(Number(opening)) });
}

export function setManualValveOpening(id, opening) {
    // RV1/RV2 e HV*
    return sendCommand({ type: 'manual_valve', id, opening: clamp01(Number(opening)) });
}

export function setRelayState(id, state) {
    return sendCommand({ type: 'relay', id, state: Boolean(state) });
}

export function setLoop(tag, changes = {}) {
    const message = { type: 'loop', id: tag };
    if (changes.sp !== undefined) message.sp = Number(changes.sp);
    if (changes.mode !== undefined) message.mode = changes.mode;
    if (changes.mv !== undefined) message.mv = clamp01(Number(changes.mv));
    if (changes.tuning && typeof changes.tuning === 'object') message.tuning = changes.tuning;
    return sendCommand(message);
}

export function setScenario(id) {
    return sendCommand({ type: 'scenario', id });
}

export function setThreeWayTiming(id, tA, tB) {
    return sendCommand({ type: 'xv', id, tA: Math.max(0, Number(tA)), tB: Math.max(0, Number(tB)) });
}

export function setSim(changes = {}) {
    const message = { type: 'sim' };
    if (changes.running !== undefined) message.running = Boolean(changes.running);
    if (changes.speed !== undefined) message.speed = Number(changes.speed);
    if (changes.reset) message.reset = true;
    if (changes.levels && typeof changes.levels === 'object') message.levels = changes.levels;
    return sendCommand(message);
}

// RUNTIME PARA A VIEW E O PAINEL DE ENSAIOS

export function getRealViewRuntime() {
    const sim = realRuntime.sim;
    return {
        mode: realRuntime.backendMode === 'HARDWARE' ? 'real' : 'simulation',
        backendMode: realRuntime.backendMode,
        running: realRuntime.connected && (realRuntime.backendMode === 'HARDWARE' ? true : sim.running),
        time: sim.t,
        speed: sim.speed,
        connected: realRuntime.connected,
        connecting: realRuntime.connecting,
        connectionLabel: realRuntime.connectionLabel,
        transport: realRuntime.transport,
        port: realRuntime.port,
        lastUpdate: realRuntime.lastUpdate,
        lastError: realRuntime.lastError,
        writable: isWritable(),
        sim,
        scenario: realRuntime.scenario,
        scenarios: realRuntime.scenarios,
        loops: realRuntime.loops,
        xv: realRuntime.xv,
        alarms: realRuntime.alarms,
        segments: realRuntime.segments,
        flows: realRuntime.flows
    };
}
