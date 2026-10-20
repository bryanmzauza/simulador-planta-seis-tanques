// COORDENADOR DA HMI
/* Liga o cliente do backend (real.js) ao sinótico, aos faceplates, à barra
   superior, ao painel de tendências e ao laboratório de código.

   Fonte única de estado: o backend Python pelo WebSocket, seja no modo
   MODELICA (FMU da planta + controladores), MOCK ou HARDWARE (bancada,
   somente leitura). A HMI nunca simula nada localmente. */

import './hmi.css';
import './style.css';

import {
    realPlant,
    connectRealPlant,
    disconnectRealPlant,
    getRealViewRuntime,
    onRealUpdate,
    isModelica,
    isWritable,
    setPump,
    setValveOpening,
    setManualValveOpening,
    setLoop,
    setScenario,
    setThreeWayTiming,
    setSim
} from './real.js';
import { createSynoptic } from './synoptic.js';
import { createFaceplate } from './faceplate.js';
import { createTopbar } from './topbar.js';
import { createTrends } from './trends.js';
import { createSimulationAPI } from './simulation-api.js';
import { createCodePanel } from './code-panel.js';

const MAIN_INTERVAL = 100;

// VIEW

const faceplate = createFaceplate(document.getElementById('faceplate'), {
    setPump: (id, power, command) => setPump(id, power, command),
    setValveOpening: (id, opening) => setValveOpening(id, opening),
    setManualValveOpening: (id, opening) => setManualValveOpening(id, opening),
    setLoop: (tag, changes) => setLoop(tag, changes),
    setThreeWayTiming: (id, tA, tB) => setThreeWayTiming(id, tA, tB),
    setInitialLevel: (id, cm) => setSim({ levels: { [id]: cm } }),
    showTrend: tag => {
        setView('tendencias');
        trends.focusLoop(tag);
    }
});

const synoptic = createSynoptic(document.getElementById('synoptic'), {
    onSelect: selection => {
        const current = faceplate.getSelection();
        if (current && current.kind === selection.kind && current.id === selection.id) {
            faceplate.hide();
            synoptic.setSelected(null);
            return;
        }
        faceplate.show(selection);
        synoptic.setSelected(selection);
    }
});

document.getElementById('faceplate').addEventListener('faceplate-change', event => {
    synoptic.setSelected(event.detail);
    // A seleção fica na URL (#loop:LIC-101, #tank:H1...) para poder ser compartilhada
    if (!event.detail) {
        history.replaceState(null, '', location.pathname + location.search);
        return;
    }
    const { kind, id } = event.detail;
    history.replaceState(null, '', `#${kind}:${id}`);
});

function selectFromHash() {
    if (location.hash === '#tendencias') {
        setView('tendencias');
        return;
    }
    setView('processo');
    const match = /^#(loop|pump|valve|xv|hv|tank|lt|ft):([\w-]+)$/.exec(location.hash);
    if (!match) return;
    faceplate.show({ kind: match[1], id: match[2] });
    synoptic.setSelected({ kind: match[1], id: match[2] });
}
window.addEventListener('hashchange', selectFromHash);

// TELAS: Processo (sinótico + faceplate) e Tendências
/* Uma só página; a tela ativa fica em body[data-view] e na URL (#tendencias). */

let view = 'processo';

function setView(nova) {
    if (nova !== 'processo' && nova !== 'tendencias') return;
    view = nova;
    document.body.dataset.view = view;
    if (view === 'tendencias') {
        trends.show();
        if (location.hash !== '#tendencias') history.replaceState(null, '', '#tendencias');
    } else {
        trends.hide();
        if (location.hash === '#tendencias') {
            const selection = faceplate.getSelection();
            history.replaceState(null, '', selection ? `#${selection.kind}:${selection.id}` : location.pathname + location.search);
        }
    }
    topbar.setView(view);
}

const topbar = createTopbar(document.getElementById('topbar'), document.getElementById('alarm-bar'), {
    connectToggle: async () => {
        const runtime = getRealViewRuntime();
        if (runtime.connected) {
            await disconnectRealPlant();
        } else {
            await connectRealPlant();
        }
        updateView();
    },
    setScenario: id => setScenario(id),
    setAllLoops: mode => {
        for (const tag of Object.keys(getRealViewRuntime().loops ?? {})) setLoop(tag, { mode });
    },
    setRunning: running => setSim({ running }),
    reset: () => setSim({ reset: true }),
    setSpeed: speed => setSim({ speed }),
    setView: nova => setView(nova)
});

function updateView() {
    const runtime = getRealViewRuntime();
    synoptic.update(realPlant, runtime);
    faceplate.update(realPlant, runtime);
    topbar.update(realPlant, runtime);
    trends.update(realPlant, runtime);
}

onRealUpdate(updateView);

// Fecha o faceplate com Esc
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && faceplate.getSelection()) {
        faceplate.hide();
        synoptic.setSelected(null);
    }
});

// TENDÊNCIAS E REGISTRO
/* Tela própria (src/trends.js), alternada com o processo pela barra
   superior. Amostra sempre, mesmo escondida. Só lê o estado. */

const trends = createTrends(document.querySelector('.main-area'), {
    getRuntime: () => getRealViewRuntime()
});

// LABORATÓRIO DE CÓDIGO (API DE SIMULAÇÃO)
/* O código do usuário roda num Worker isolado e só alcança a simulação
   Modelica: no modo HARDWARE nada é enviado (ver real.js#sendCommand). */

const isSimulationMode = () => isModelica() && isWritable();
const simulationAPI = createSimulationAPI(isSimulationMode);

const codePanel = createCodePanel({
    isSimulationMode,
    startSimulation: () => setSim({ running: true }),
    pauseSimulation: () => setSim({ running: false }),
    resetSimulation: () => setSim({ reset: true })
});


let controllerBusy = false;
let lastModeKey = null;

async function controllerTick() {
    const runtime = getRealViewRuntime();
    const modeKey = `${runtime.connected}:${runtime.backendMode}`;
    if (modeKey !== lastModeKey) {
        lastModeKey = modeKey;
        codePanel.updateMode();
    }

    if (controllerBusy || !isSimulationMode()) return;
    const runner = codePanel.runner;
    if (runner.state !== 'running' || !runtime.sim.running) return;

    const dt = 0.1 * (runtime.sim.speed ?? 1);
    controllerBusy = true;
    try {
        const result = await runner.tick(simulationAPI.snapshot(), dt);
        if (!result || runner.state !== 'running' || !isSimulationMode()) return;
        simulationAPI.apply(result.commands);
        for (const message of (result.logs ?? []).slice(0, 20)) {
            codePanel.log(String(message).slice(0, 1000));
        }
    } catch (error) {
        runner.fail(error.message);
    } finally {
        controllerBusy = false;
    }
}

// LAÇO PRINCIPAL
/* O estado chega pelo WebSocket (updateView a cada quadro). Este laço só
   mantém a barra superior viva sem dados e roda o código do usuário. */

setInterval(() => {
    const runtime = getRealViewRuntime();
    if (!runtime.connected) updateView();
    controllerTick();
}, MAIN_INTERVAL);

updateView();
selectFromHash();

// Endereço do backend: ws://localhost:8765, ou ?ws=ws://host:porta na URL
const backendUrl = new URLSearchParams(location.search).get('ws');
connectRealPlant(backendUrl && /^wss?:\/\/[\w.\-]+(:\d+)?\/?$/.test(backendUrl) ? backendUrl : undefined);
