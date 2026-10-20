// Executa em um Worker criado por um iframe de origem opaca, restrito por CSP.
let step;
const memory = {};
self.onmessage = async ({ data }) => {
    try {
        if (data.type === 'init') {
            step = new Function('plant', 'dt', 'memory', 'log', '"use strict";\n' + data.code);
            self.postMessage({ type: 'ready' });
            return;
        }
        const commands = [];
        const logs = [];
        const plant = data.plant;
        const push = command => {
            if (commands.length >= 100) throw new Error('Limite de comandos excedido.');
            commands.push(command);
        };
        for (const group of ['pumps', 'valves', 'relays']) {
            for (const [id, item] of Object.entries(plant[group] ?? {})) {
                item.set = value => push({ group, id, value });
            }
        }
        // Malhas de controle do cenário: setSP, setMode('AUTO'|'MAN'), setMV (em MAN)
        for (const [id, loop] of Object.entries(plant.loops ?? {})) {
            loop.setSP = sp => push({ group: 'loops', id, value: { sp } });
            loop.setMode = mode => push({ group: 'loops', id, value: { mode } });
            loop.setMV = mv => push({ group: 'loops', id, value: { mv } });
        }
        const log = (...args) => {
            if (logs.length < 20) logs.push(args.map(v => String(v).slice(0, 500)).join(' '));
        };
        await step(plant, data.dt, memory, log);
        self.postMessage({ type: 'result', commands, logs });
    } catch (error) {
        self.postMessage({ type: 'error', message: String(error.message || error).slice(0, 1000) });
    }
};
