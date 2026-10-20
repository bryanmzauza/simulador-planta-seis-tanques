// BARRA SUPERIOR E BARRA DE ALARMES
/* Modo do backend, conexão, cenário, controle da simulação (rodar/pausar,
   reiniciar, velocidade, relógio) e resumo dos alarmes. Só recebe dados
   por update() e devolve ações pelos callbacks. */

import { fmt } from './synoptic.js';

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10];

function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
    }
    for (const child of children) {
        if (child !== null && child !== undefined) node.append(child instanceof Node ? child : String(child));
    }
    return node;
}

export function createTopbar(header, alarmBar, actions = {}) {
    const act = {
        connectToggle: () => {},
        setScenario: () => {},
        setAllLoops: () => {},
        setRunning: () => {},
        reset: () => {},
        setSpeed: () => {},
        setView: () => {},
        ...actions
    };

    header.innerHTML = '';

    // Marca
    header.append(h('div', { class: 'tb-brand' }, [
        h('h1', { text: 'Planta de Seis Tanques' }),
        h('p', { text: 'Supervisório · UFRGS' })
    ]));

    // Telas: Processo | Tendências
    const viewTabs = h('nav', { class: 'tb-views', 'aria-label': 'Telas' });
    const viewButtons = {};
    for (const [id, rotulo] of [['processo', 'Processo'], ['tendencias', 'Tendências']]) {
        const botao = h('button', { type: 'button', class: 'tb-view', 'aria-pressed': 'false', onclick: () => act.setView(id) }, [rotulo]);
        viewButtons[id] = botao;
        viewTabs.append(botao);
    }
    header.append(viewTabs);

    // Modo
    const modeBadge = h('span', { class: 'tb-mode offline', text: 'SEM CONEXÃO' });
    header.append(h('div', { class: 'tb-group' }, [modeBadge]));

    // Conexão
    const dot = h('span', { class: 'tb-dot' });
    const connLabel = h('span', { text: 'Desconectado' });
    const connButton = h('button', { type: 'button', text: 'Conectar', onclick: () => act.connectToggle() });
    header.append(h('div', { class: 'tb-group' }, [dot, connLabel, connButton]));

    // Cenário
    const scenarioSelect = h('select', { 'aria-label': 'Cenário de controle', onchange: () => act.setScenario(scenarioSelect.value) });
    const allAuto = h('button', { type: 'button', text: 'Todas AUTO', title: 'Põe todas as malhas do cenário em automático', onclick: () => act.setAllLoops('AUTO') });
    const allMan = h('button', { type: 'button', text: 'Todas MAN', title: 'Põe todas as malhas do cenário em manual', onclick: () => act.setAllLoops('MAN') });
    const scenarioGroup = h('div', { class: 'tb-group' }, [h('label', { class: 'tb-sim-label', text: 'Cenário' }), scenarioSelect, allAuto, allMan]);
    scenarioGroup.hidden = true;
    header.append(scenarioGroup);

    // Simulação
    const runButton = h('button', { type: 'button', text: 'Rodar', onclick: () => act.setRunning(!lastRunning) });
    const resetButton = h('button', { type: 'button', text: 'Reiniciar', title: 'Volta aos níveis iniciais e põe as malhas em MAN', onclick: () => act.reset() });
    const speedSelect = h('select', { 'aria-label': 'Velocidade da simulação', onchange: () => act.setSpeed(Number(speedSelect.value)) });
    for (const speed of SPEEDS) speedSelect.append(h('option', { value: String(speed), text: `${String(speed).replace('.', ',')}×` }));
    const timeLabel = h('span', { class: 'tb-time', text: 't = 0,0 s' });
    const ratioLabel = h('span', { class: 'tb-ratio' });
    const simGroup = h('div', { class: 'tb-group' }, [runButton, resetButton, h('label', { class: 'tb-sim-label', text: 'Veloc.' }), speedSelect, timeLabel, ratioLabel]);
    simGroup.hidden = true;
    header.append(simGroup);

    header.append(h('div', { class: 'tb-spacer' }));

    // Alarmes
    const alarmCount = h('span', { class: 'tb-alarm-count', text: '0' });
    header.append(h('div', { class: 'tb-group tb-alarms' }, [h('label', { text: 'Alarmes' }), alarmCount]));

    let lastRunning = false;
    let lastScenarioList = '';

    function update(plant, runtime = {}) {
        const mode = runtime.backendMode;
        const connected = Boolean(runtime.connected);

        // Modo
        modeBadge.className = 'tb-mode';
        if (!connected) {
            modeBadge.textContent = 'SEM CONEXÃO';
            modeBadge.classList.add('offline');
        } else if (mode === 'MODELICA') {
            modeBadge.textContent = 'SIMULAÇÃO · MODELICA';
            modeBadge.classList.add('modelica');
        } else if (mode === 'HARDWARE') {
            modeBadge.textContent = 'PLANTA REAL · SOMENTE LEITURA';
            modeBadge.classList.add('hardware');
        } else {
            modeBadge.textContent = `BACKEND ${mode ?? ''}`.trim();
        }

        // Conexão
        dot.className = `tb-dot ${connected ? 'connected' : runtime.connecting ? 'connecting' : ''}`;
        connLabel.textContent = runtime.connectionLabel ?? (connected ? 'Conectado' : 'Desconectado');
        connButton.textContent = connected ? 'Desconectar' : runtime.connecting ? 'Conectando…' : 'Conectar';
        connButton.disabled = Boolean(runtime.connecting);

        // Cenário
        const isModelica = connected && mode === 'MODELICA';
        scenarioGroup.hidden = !isModelica;
        if (isModelica) {
            const list = runtime.scenarios ?? [];
            const signature = list.map(s => s.id).join('|');
            if (signature !== lastScenarioList) {
                lastScenarioList = signature;
                scenarioSelect.innerHTML = '';
                for (const scenario of list) {
                    scenarioSelect.append(h('option', { value: scenario.id, text: scenario.nome, title: scenario.descricao }));
                }
            }
            if (document.activeElement !== scenarioSelect && runtime.scenario) scenarioSelect.value = runtime.scenario;
            scenarioSelect.disabled = !runtime.writable;
            const loops = Object.values(runtime.loops ?? {});
            allAuto.disabled = !runtime.writable || !loops.length || loops.every(l => l.mode === 'AUTO');
            allMan.disabled = !runtime.writable || !loops.length || loops.every(l => l.mode !== 'AUTO');
        }

        // Simulação
        simGroup.hidden = !isModelica;
        if (isModelica) {
            const sim = runtime.sim ?? {};
            lastRunning = Boolean(sim.running);
            runButton.textContent = lastRunning ? 'Pausar' : 'Rodar';
            runButton.disabled = !runtime.writable;
            resetButton.disabled = !runtime.writable;
            if (document.activeElement !== speedSelect) speedSelect.value = String(sim.speed ?? 1);
            speedSelect.disabled = !runtime.writable;
            timeLabel.textContent = `t = ${fmt(sim.t ?? 0, 1)} s`;
            const ratio = sim.realtimeRatio ?? 1;
            ratioLabel.textContent = lastRunning && ratio < 0.95 ? `atraso: ${fmt(ratio * 100, 0)} % do tempo real` : '';
        }

        // Alarmes
        const alarms = [...(runtime.alarms ?? [])].sort((a, b) => a.priority - b.priority);
        alarmCount.textContent = String(alarms.length);
        alarmCount.className = `tb-alarm-count${alarms.length ? ` prio-${alarms[0].priority}` : ''}`;

        alarmBar.innerHTML = '';
        if (!connected) {
            alarmBar.append(h('span', { class: 'alarm-error', text: runtime.lastError ? `Sem conexão com o backend: ${runtime.lastError}` : 'Sem conexão com o backend (ws://localhost:8765). Inicie rodar_planta_modelica.bat ou rodar_planta_hardware.bat.' }));
            return;
        }
        if (runtime.lastError) {
            alarmBar.append(h('span', { class: 'alarm-error', text: runtime.lastError }));
        }
        if (!alarms.length) {
            alarmBar.append(h('span', { class: 'alarm-empty', text: 'Sem alarmes ativos' }));
            return;
        }
        for (const alarm of alarms) {
            alarmBar.append(h('span', { class: 'alarm-item', title: `prioridade ${alarm.priority}` }, [
                h('span', { class: `alarm-badge prio-${alarm.priority}` }),
                h('strong', { text: alarm.tag }),
                h('span', { text: alarm.text })
            ]));
        }
    }

    function setView(view) {
        for (const [id, botao] of Object.entries(viewButtons)) {
            const ativo = id === view;
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-pressed', String(ativo));
        }
    }

    return { update, setView };
}
