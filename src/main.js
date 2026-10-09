import { createSimulationAPI } from './simulation-api.js';
import { createCodePanel } from './code-panel.js';
import { setupWorkspaceControls } from './workspace-controls.js';
import {
    PlantView
} from './plant-view.js';

import {
    ExperimentDashboard
} from './experiment-dashboard.js';

import {
    simulatedPlant,
    simulationRuntime,
    stepSimulation,
    toggleSimulation,
    resetSimulation,
    setSimulationSpeed,
    setInitialTankLevel,
    setTankCapacity,
    togglePump,
    setPumpCommand,
    setMainValveOpening,
    setActuatedValveOpening,
    setRecycleValveOpening,
    setManualValveOpening,
    toggleThreeWayValve,
    getSimulationViewRuntime
} from './simulator.js';

import {
    realPlant,
    realRuntime,
    toggleRealPump,
    setRealPumpCommand,
    setRealMainValveOpening,
    setRealActuatedValveOpening,
    setRealRecycleValveOpening,
    setRealManualValveOpening,
    toggleRealThreeWayValve,
    updateRealVisualFlows,
    getRealViewRuntime,
    connectRealPlant,
    disconnectRealPlant
} from './real.js';

// MAIN
/* Coordena os modos Simulação e Planta real, os comandos da interface
e o ciclo de atualização da planta. */

// MODO ATUAL

let operatingMode =
    'simulation';

let executionRevision = 0;
let controllerBusy = false;

// INTERVALO PRINCIPAL
/* 100 ms = 10 atualizações por segundo
 */

const MAIN_INTERVAL =
    100;

// AUXILIARES

function isSimulationMode() {

    return (
        operatingMode ===
        'simulation'
    );
}

function isRealMode() {

    return (
        operatingMode ===
        'real'
    );
}

// ESTADO ATIVO

function getActivePlant() {

    if (
        isRealMode()
    ) {

        return realPlant;
    }

    return simulatedPlant;
}

function getActiveRuntime() {

    if (
        isRealMode()
    ) {

        return getRealViewRuntime();
    }

    return getSimulationViewRuntime();
}

// ATUALIZAÇÃO DA INTERFACE

function updateView() {

    plantView.update(
        getActivePlant(),
        getActiveRuntime()
    );
}

// ALTERAÇÃO DO MODO

function changeOperatingMode(
    mode
) {

    if (
        mode !== 'simulation' &&
        mode !== 'real'
    ) {

        return;
    }

    if (
        mode === operatingMode
    ) {

        return;
    }

    // Ao sair da simulação, pausa.

    if (
        operatingMode ===
        'simulation'
    ) {

        simulationRuntime.running =
            false;
    }

    operatingMode =
        mode;

    executionRevision++;
    codePanel.updateMode();

    // Atualiza o mapa visual no modo real.

    if (
        isRealMode()
    ) {

        updateRealVisualFlows();
    }

    updateView();
}

// CONEXÃO COM A PLANTA REAL

async function toggleRealConnection() {

    if (
        !isRealMode()
    ) {

        return;
    }

    // Se já estiver conectada, desconecta.

    if (
        realRuntime.connected
    ) {

        await disconnectRealPlant();

        updateView();

        return;
    }

    // SE JÁ EXISTE UMA TENTATIVA DE CONEXÃO EM ANDAMENTO,
    /* não inicia outra.
     */

    if (
        realRuntime.connecting
    ) {

        return;
    }

    /* O próprio real.js controla:
       realRuntime.connecting
       realRuntime.connectionLabel
       realRuntime.connected
       realRuntime.transport
       realRuntime.port
       Portanto NÃO devemos alterar esses valores aqui antes
       de chamar connectRealPlant().
     */

    try {

        await connectRealPlant();

    } catch (
        error
    ) {

        realRuntime.connected =
            false;

        realRuntime.connecting =
            false;

        realRuntime.lastError =
            error instanceof Error
                ? error.message
                : String(
                    error
                );

        realRuntime.connectionLabel =
            'Erro de conexão';
    }

    updateView();
}

// CRIAÇÃO DA INTERFACE

const plantView =
    new PlantView({

        // MODO

        onModeChange:
            mode => {

                changeOperatingMode(
                    mode
                );
            },

        // CONECTAR / DESCONECTAR

        onRealConnectToggle:
            async () => {

                await toggleRealConnection();
            },

        // SIMULAÇÃO

        onStartPause:
            () => {

                if (
                    !isSimulationMode()
                ) {

                    return;
                }

                toggleSimulation();

                executionRevision++;
                if (!simulationRuntime.running) codePanel.runner.pause();
                else codePanel.runner.resume();

                updateView();
            },

        onReset:
            () => {

                if (
                    !isSimulationMode()
                ) {

                    return;
                }

                resetSimulation();

                executionRevision++;
                codePanel.runner.stop();

                updateView();
            },

        onSimulationSpeedChange:
            speed => {

                if (
                    !isSimulationMode()
                ) {

                    return;
                }

                setSimulationSpeed(
                    speed
                );

                updateView();
            },

        // NÍVEIS INICIAIS

        onInitialLevelChange:
            (
                id,
                normalizedLevel
            ) => {

                if (
                    !isSimulationMode()
                ) {

                    return;
                }

                setInitialTankLevel(
                    id,
                    normalizedLevel
                );

                updateView();
            },

        // CAPACIDADE DOS TANQUES

        onTankCapacityChange:
            (
                id,
                capacity
            ) => {

                if (
                    !isSimulationMode()
                ) {

                    return;
                }

                setTankCapacity(
                    id,
                    capacity
                );

                updateView();
            },

        // BOMBAS

        onPumpToggle:
            id => {

                if (
                    isSimulationMode()
                ) {

                    togglePump(
                        id
                    );

                } else {

                    if (
                        !realRuntime.connected
                    ) {

                        return;
                    }

                    toggleRealPump(
                        id
                    );
                }

                updateView();
            },

        onPumpCommandChange:
            (
                id,
                command
            ) => {

                if (
                    isSimulationMode()
                ) {

                    setPumpCommand(
                        id,
                        command
                    );

                } else {

                    if (
                        !realRuntime.connected
                    ) {

                        return;
                    }

                    setRealPumpCommand(
                        id,
                        command
                    );
                }

                updateView();
            },

        // MV

        onMainValveChange:
            opening => {

                if (
                    isSimulationMode()
                ) {

                    setMainValveOpening(
                        opening
                    );

                } else {

                    if (
                        !realRuntime.connected
                    ) {

                        return;
                    }

                    setRealMainValveOpening(
                        opening
                    );
                }

                updateView();
            },

        // V1 - V4

        onActuatedValveChange:
            (
                id,
                opening
            ) => {

                if (
                    isSimulationMode()
                ) {

                    setActuatedValveOpening(
                        id,
                        opening
                    );

                } else {

                    if (
                        !realRuntime.connected
                    ) {

                        return;
                    }

                    setRealActuatedValveOpening(
                        id,
                        opening
                    );
                }

                updateView();
            },

        // RV1 / RV2
        /* São válvulas manuais de recirculação.
         */

        onRecycleValveChange:
            (
                id,
                opening
            ) => {

                if (
                    isSimulationMode()
                ) {

                    setRecycleValveOpening(
                        id,
                        opening
                    );

                } else {

                    setRealRecycleValveOpening(
                        id,
                        opening
                    );
                }

                updateView();
            },

        // VÁLVULAS MANUAIS
        /* HV3_IN
           HV4_IN
           HV3_P1
           HV4_P2
           HV1_DRAIN
           HV2_DRAIN
           Na simulação:
           alteram diretamente o modelo hidráulico.
           Na planta real:
           apenas registramos a posição informada pelo operador.
           Não há comando eletrônico.
         */

        onManualValveChange:
            (
                id,
                opening
            ) => {

                if (
                    isSimulationMode()
                ) {

                    setManualValveOpening(
                        id,
                        opening
                    );

                } else {

                    setRealManualValveOpening(
                        id,
                        opening
                    );
                }

                updateView();
            },

        // X1A / X1B / X2A / X2B

        onThreeWayValveToggle:
            id => {

                if (
                    isSimulationMode()
                ) {

                    toggleThreeWayValve(
                        id
                    );

                } else {

                    if (
                        !realRuntime.connected
                    ) {

                        return;
                    }

                    toggleRealThreeWayValve(
                        id
                    );
                }

                updateView();
            }
    });

// DASHBOARD CIENTÍFICO
/* Mantém tendências temporais e registro/exportação CSV sem
   interferir no modelo, nos comandos ou na comunicação.
 */

const experimentDashboard =
    new ExperimentDashboard({

        getPlant:
            () => getActivePlant(),

        getRuntime:
            () => getActiveRuntime(),

        getMode:
            () => operatingMode
    });

// Mantemos a referência explícita durante toda a execução.
void experimentDashboard;

const simulationAPI = createSimulationAPI(isSimulationMode);
const codePanel = createCodePanel({
    isSimulationMode,
    startSimulation: () => { executionRevision++; simulationRuntime.running = true; updateView(); },
    pauseSimulation: () => { executionRevision++; simulationRuntime.running = false; updateView(); },
    resetSimulation: () => { executionRevision++; resetSimulation(); updateView(); }
});
setupWorkspaceControls();

// LOOP PRINCIPAL

async function mainLoop() {

    if (controllerBusy) return;

    // SIMULAÇÃO

    if (
        isSimulationMode()
    ) {

        if (
            simulationRuntime.running
        ) {

            const dt =
                (
                    MAIN_INTERVAL /
                    1000
                ) *
                simulationRuntime.speed;

            const runner = codePanel.runner;
            if (runner.state === 'starting' || runner.state === 'paused') return;
            if (runner.state === 'running') {
                const revision = executionRevision;
                controllerBusy = true;
                try {
                    const result = await runner.tick(simulationAPI.snapshot(), dt);
                    if (!result || revision !== executionRevision || !isSimulationMode() || !simulationRuntime.running || runner.state !== 'running') return;
                    simulationAPI.apply(result.commands);
                    for (const message of (result.logs ?? []).slice(0, 20)) codePanel.log(String(message).slice(0, 1000));
                    stepSimulation(dt);
                } catch (error) {
                    runner.fail(error.message);
                } finally {
                    controllerBusy = false;
                }
            } else {
                stepSimulation(dt);
            }
        }

        updateView();

        return;
    }

    // PLANTA REAL

    if (
        isRealMode()
    ) {

        updateRealVisualFlows();

        updateView();
    }
}

// INICIALIZAÇÃO

updateView();

// LOOP

setInterval(
    mainLoop,
    MAIN_INTERVAL
);
