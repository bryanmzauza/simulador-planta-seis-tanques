import {
    createPlantState,
    getTank,
    getPump,
    getActuatedValve,
    getRecycleValve,
    getManualValve,
    getThreeWayValve,
    getFlowSensor,
    getLevelSensor
} from './plant-state.js';

// PLANTA REAL
/* Responsabilidades:
   - manter o estado da planta física
   - receber leituras do hardware
   - armazenar estados de bombas e válvulas
   - preparar comandos futuros para o Arduino/backend
   Não possui:
   - JointJS
   - DOM
   - modelo matemático da planta
 */

// ESTADO DA PLANTA REAL

export const realPlant =
    createPlantState();
for (const sensor of realPlant.flowSensors) sensor.flow = null;
for (const sensor of realPlant.levelSensors) {
    for (const key of ['level', 'pressure', 'voltage', 'raw']) sensor[key] = null;
}
for (const tank of realPlant.tanks) tank.level = tank.height = tank.volume = null;


// ESTADO DA CONEXÃO

export const realRuntime = {

    connected:
        false,

    connecting:
        false,

    connectionLabel:
        'Desconectado',

    transport:
        null,

    port:
        null,

    lastUpdate:
        null,

    lastError:
        null,

    flows:
        {}
};

// WEBSOCKET
/* Navegador (HMI) <-> servidor Python
   O Python será criado na próxima etapa. Por enquanto o
   endereço padrão é local, na porta 8765.
 */

const DEFAULT_WEBSOCKET_URL =
    'ws://localhost:8765';

let realSocket =
    null;

let intentionalDisconnect =
    false;

// AUXILIAR

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );
}

// ENVIO DE COMANDOS AO SERVIDOR PYTHON

function sendRealCommand() { return false; }


// RECEBIMENTO DE MENSAGENS DO SERVIDOR PYTHON
//
// Formato principal:
//
// {
//     type: 'state',
//     data: {
//         tanks: {...},
//         levelSensors: {...},
//         flowSensors: {...},
//         pumps: {...},
//         mainValve: {...},
//         actuatedValves: {...},
//         threeWayValves: {...}
//     }
// }
//
// O objeto "data" usa exatamente o formato que applyRealData()
// já aceitava antes da implementação do WebSocket.

function handleRealWebSocketMessage(
    rawMessage
) {

    let message;

    try {

        message =
            JSON.parse(
                rawMessage
            );

    } catch (error) {

        console.warn(
            '[REAL] Mensagem JSON inválida recebida:',
            rawMessage
        );

        return;
    }

    if (
        !message ||
        typeof message !==
            'object'
    ) {

        return;
    }

    if (
        message.type ===
        'state'
    ) {

        const data =
            message.data &&
            typeof message.data ===
                'object'
                ? message.data
                : message;

        applyRealData(
            data
        );

        /* Se o backend não fornecer vazão de cada trecho,
           construímos o mapa visual a partir dos seis FT.
         */
        if (
            !data.flows ||
            typeof data.flows !==
                'object'
        ) {

            updateRealVisualFlows();
        }

        return;
    }

    if (
        message.type ===
        'hello'
    ) {

        console.log(
            '[REAL] Servidor Python conectado:',
            message
        );

        return;
    }

    if (
        message.type ===
        'error'
    ) {

        realRuntime.lastError =
            message.message ??
            'Erro informado pelo servidor Python.';

        console.error(
            '[REAL]',
            realRuntime.lastError
        );

        return;
    }

    console.warn(
        '[REAL] Tipo de mensagem desconhecido:',
        message.type
    );
}

// CONEXÃO

export function setRealConnectionState(
    connected,
    options = {}
) {
    if (!connected) {
        for (const sensor of realPlant.flowSensors) sensor.flow = null;
        for (const sensor of realPlant.levelSensors) {
            for (const key of ['level', 'pressure', 'voltage', 'raw']) sensor[key] = null;
        }
        for (const tank of realPlant.tanks) tank.level = tank.height = tank.volume = null;
        realRuntime.flows = {};
    }

    realRuntime.connected =
        Boolean(
            connected
        );

    realRuntime.connecting =
        false;

    if (
        options.transport !==
        undefined
    ) {

        realRuntime.transport =
            options.transport;
    }

    if (
        options.port !==
        undefined
    ) {

        realRuntime.port =
            options.port;
    }

    if (
        options.label !==
        undefined
    ) {

        realRuntime.connectionLabel =
            options.label;

    } else {

        realRuntime.connectionLabel =
            realRuntime.connected
                ? 'Conectado'
                : 'Desconectado';
    }
}

export function setRealConnecting(
    connecting
) {

    realRuntime.connecting =
        Boolean(
            connecting
        );

    if (
        realRuntime.connecting
    ) {

        realRuntime.connectionLabel =
            'Conectando...';
    }
}

export function setRealConnectionError(
    error
) {

    realRuntime.connected =
        false;

    realRuntime.connecting =
        false;

    realRuntime.lastError =
        error;

    realRuntime.connectionLabel =
        'Erro de conexão';
}

// RECEBIMENTO DE DADOS REAIS
/* Futuramente poderá receber algo como:
   {
       tanks: {
           H1: {
               height: 0.24,
               volume: 0.61
           }
       },
       levelSensors: {
           LT1: {
               level: 42.7,
               pressure: 2.35,
               voltage: 1.31,
               raw: 268
           }
       },
       flowSensors: {
           FT1: {
               flow: 1.84
           }
       },
       manualValves: {
           HV3_IN: {
               opening: 1
           }
       }
   }
 */

export function applyRealData(
    data
) {
    // Frames completos: ausência explícita ou omissão elimina amostras antigas.
    for (const sensor of realPlant.flowSensors) {
        const incoming = data?.flowSensors?.[sensor.id];
        sensor.flow = Number.isFinite(incoming?.flow) ? incoming.flow : null;
        sensor.raw = incoming?.raw ?? null;
        sensor.status = incoming?.status ?? 'unavailable';
    }
    for (const sensor of realPlant.levelSensors) {
        const incoming = data?.levelSensors?.[sensor.id];
        for (const key of ['level', 'pressure', 'voltage', 'raw']) sensor[key] = Number.isFinite(incoming?.[key]) ? incoming[key] : null;
    }
    for (const tank of realPlant.tanks) {
        for (const key of ['level', 'height', 'volume']) tank[key] = Number.isFinite(data?.tanks?.[tank.id]?.[key]) ? data.tanks[tank.id][key] : null;
    }

    if (
        !data ||
        typeof data !==
            'object'
    ) {

        return false;
    }

    // TANQUES

    if (
        data.tanks &&
        typeof data.tanks ===
            'object'
    ) {

        Object.entries(
            data.tanks
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const tank =
                    getTank(
                        realPlant,
                        id
                    );

                if (
                    !tank ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.height
                    )
                ) {

                    tank.height =
                        Math.max(
                            0,
                            values.height
                        );
                }

                if (
                    Number.isFinite(
                        values.volume
                    )
                ) {

                    tank.volume =
                        Math.max(
                            0,
                            values.volume
                        );
                }

                if (
                    Number.isFinite(
                        values.level
                    )
                ) {

                    tank.level =
                        clamp(
                            values.level,
                            0,
                            100
                        );
                }
            }
        );
    }

    // SENSORES DE NÍVEL

    if (
        data.levelSensors &&
        typeof data.levelSensors ===
            'object'
    ) {

        Object.entries(
            data.levelSensors
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const sensor =
                    getLevelSensor(
                        realPlant,
                        id
                    );

                if (
                    !sensor ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.level
                    )
                ) {

                    sensor.level =
                        clamp(
                            values.level,
                            0,
                            100
                        );
                }

                if (
                    Number.isFinite(
                        values.pressure
                    )
                ) {

                    sensor.pressure =
                        Math.max(
                            0,
                            values.pressure
                        );
                }

                if (
                    Number.isFinite(
                        values.voltage
                    )
                ) {

                    sensor.voltage =
                        values.voltage;
                }

                if (
                    values.raw !==
                    undefined
                ) {

                    sensor.raw =
                        values.raw;
                }

                // Atualiza também o tanque correspondente.

                const tank =
                    getTank(
                        realPlant,
                        sensor.tank
                    );

                if (
                    tank &&
                    Number.isFinite(
                        values.level
                    )
                ) {

                    tank.level =
                        clamp(
                            values.level,
                            0,
                            100
                        );
                }

                if (
                    tank &&
                    Number.isFinite(
                        values.height
                    )
                ) {

                    tank.height =
                        Math.max(
                            0,
                            values.height
                        );
                }

                if (
                    tank &&
                    Number.isFinite(
                        values.volume
                    )
                ) {

                    tank.volume =
                        Math.max(
                            0,
                            values.volume
                        );
                }
            }
        );
    }

    // SENSORES DE VAZÃO

    if (
        data.flowSensors &&
        typeof data.flowSensors ===
            'object'
    ) {

        Object.entries(
            data.flowSensors
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const sensor =
                    getFlowSensor(
                        realPlant,
                        id
                    );

                if (
                    !sensor ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.flow
                    )
                ) {

                    sensor.flow =
                        Math.max(
                            0,
                            values.flow
                        );
                }
            }
        );
    }

    // BOMBAS

    if (
        data.pumps &&
        typeof data.pumps ===
            'object'
    ) {

        Object.entries(
            data.pumps
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const pump =
                    getPump(
                        realPlant,
                        id
                    );

                if (
                    !pump ||
                    !values
                ) {

                    return;
                }

                if (
                    values.power !==
                    undefined
                ) {

                    pump.power =
                        values.power
                            ? 1
                            : 0;
                }

                if (
                    Number.isFinite(
                        values.command
                    )
                ) {

                    pump.command =
                        clamp(
                            values.command,
                            0,
                            1
                        );
                }
            }
        );
    }

    // MV

    if (
        data.mainValve &&
        typeof data.mainValve ===
            'object'
    ) {

        if (
            Number.isFinite(
                data.mainValve.opening
            )
        ) {

            realPlant
                .mainValve
                .opening =
                clamp(
                    data.mainValve.opening,
                    0,
                    1
                );
        }
    }

    // V1 - V4

    if (
        data.actuatedValves &&
        typeof data.actuatedValves ===
            'object'
    ) {

        Object.entries(
            data.actuatedValves
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const valve =
                    getActuatedValve(
                        realPlant,
                        id
                    );

                if (
                    !valve ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.opening
                    )
                ) {

                    valve.opening =
                        clamp(
                            values.opening,
                            0,
                            1
                        );
                }
            }
        );
    }

    // RV1 / RV2
    /* Válvulas manuais específicas da recirculação.
     */

    if (
        data.recycleValves &&
        typeof data.recycleValves ===
            'object'
    ) {

        Object.entries(
            data.recycleValves
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const valve =
                    getRecycleValve(
                        realPlant,
                        id
                    );

                if (
                    !valve ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.opening
                    )
                ) {

                    valve.opening =
                        clamp(
                            values.opening,
                            0,
                            1
                        );
                }
            }
        );
    }

    // DEMAIS VÁLVULAS MANUAIS
    /* HV3_IN
       HV4_IN
       HV3_P1
       HV4_P2
       HV1_DRAIN
       HV2_DRAIN
       Como são manuais, esses valores podem futuramente ser
       informados pelo operador ou carregados de uma
       configuração da bancada.
     */

    if (
        data.manualValves &&
        typeof data.manualValves ===
            'object'
    ) {

        Object.entries(
            data.manualValves
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const valve =
                    getManualValve(
                        realPlant,
                        id
                    );

                if (
                    !valve ||
                    !values
                ) {

                    return;
                }

                if (
                    Number.isFinite(
                        values.opening
                    )
                ) {

                    valve.opening =
                        clamp(
                            values.opening,
                            0,
                            1
                        );
                }
            }
        );
    }

    // X1A / X1B / X2A / X2B

    if (
        data.threeWayValves &&
        typeof data.threeWayValves ===
            'object'
    ) {

        Object.entries(
            data.threeWayValves
        ).forEach(
            (
                [
                    id,
                    values
                ]
            ) => {

                const valve =
                    getThreeWayValve(
                        realPlant,
                        id
                    );

                if (
                    !valve ||
                    !values
                ) {

                    return;
                }

                if (
                    values.state !==
                    undefined
                ) {

                    valve.state =
                        Boolean(
                            values.state
                        );
                }
            }
        );
    }

    // VAZÕES VISUAIS
    /* Se futuramente o backend fornecer vazão calculada para
       cada trecho, aceitamos diretamente aqui.
     */

    if (
        data.flows &&
        typeof data.flows ===
            'object'
    ) {

        realRuntime.flows =
            {
                ...realRuntime.flows,
                ...data.flows
            };
    }

    // STATUS

    realRuntime.lastUpdate =
        Date.now();

    realRuntime.lastError =
        null;

    return true;
}

// COMANDOS DAS BOMBAS

export function toggleRealPump(
    id
) {
    return false; // Aquisição somente leitura.
}

export function setRealPumpPower(
    id,
    power
) {
    return false; // Aquisição somente leitura.
}

export function setRealPumpCommand(
    id,
    command
) {
    return false; // Aquisição somente leitura.
}

// MV

export function setRealMainValveOpening(
    opening
) {
    return false; // Aquisição somente leitura.
}

// V1 - V4

export function setRealActuatedValveOpening(
    id,
    opening
) {
    return false; // Aquisição somente leitura.
}

// RV1 / RV2
/* São válvulas manuais.
   Esta função serve apenas para registrar no software a
   posição informada pelo operador.
 */

export function setRealRecycleValveOpening(
    id,
    opening
) {
    return false; // Aquisição somente leitura.
}

// NOVAS VÁLVULAS MANUAIS
/* Também não enviamos nenhum comando ao hardware.
   Esta função apenas registra a posição conhecida da válvula.
 */

export function setRealManualValveOpening(
    id,
    opening
) {
    return false; // Aquisição somente leitura.
}

// X1A / X1B / X2A / X2B

export function toggleRealThreeWayValve(
    id
) {
    return false; // Aquisição somente leitura.
}

export function setRealThreeWayValveState(
    id,
    state
) {
    return false; // Aquisição somente leitura.
}

// VAZÕES VISUAIS NO MODO REAL
/* Temos atualmente seis sensores FT:
   FT1 -> X2A -> H5
   FT2 -> X1B -> H6
   FT3 -> X1A -> H3
   FT4 -> V3  -> H1
   FT5 -> V4  -> H2
   FT6 -> X2B -> H4
   Portanto algumas vazões são conhecidas diretamente.
   Outras NÃO possuem sensor dedicado:
   H5 -> H3
   retorno RV1
   H6 -> H4
   retorno RV2
   H3 -> P1
   H4 -> P2
   H1 -> reservatório
   H2 -> reservatório
   Não vamos inventar valores para essas linhas.
 */

export function updateRealVisualFlows() {

    const FT1 =
        getFlowSensor(
            realPlant,
            'FT1'
        )?.flow ??
        0;

    const FT2 =
        getFlowSensor(
            realPlant,
            'FT2'
        )?.flow ??
        0;

    const FT3 =
        getFlowSensor(
            realPlant,
            'FT3'
        )?.flow ??
        0;

    const FT4 =
        getFlowSensor(
            realPlant,
            'FT4'
        )?.flow ??
        0;

    const FT5 =
        getFlowSensor(
            realPlant,
            'FT5'
        )?.flow ??
        0;

    const FT6 =
        getFlowSensor(
            realPlant,
            'FT6'
        )?.flow ??
        0;

    // RAMO CENTRAL
    /* Como temos FT1, FT2, FT3 e FT6 após a divisão, podemos
       inferir a vazão total do ramo central pela soma.
     */

    const branchX1 =
        FT2 +
        FT3;

    const branchX2 =
        FT1 +
        FT6;

    const centralFlow =
        branchX1 +
        branchX2;

    // MAPA VISUAL

    realRuntime.flows =
        {

            // P3 / RAMO CENTRAL

            RES_P3:
                centralFlow,

            P3_MV:
                centralFlow,

            MV_V1:
                branchX1,

            MV_V2:
                branchX2,

            // X1A -> FT3 -> H3

            V1_X1A:
                FT3,

            X1A_FT3:
                FT3,

            FT3_H3:
                FT3,

            // X1B -> FT2 -> H6

            V1_X1B:
                FT2,

            X1B_FT2:
                FT2,

            FT2_H6:
                FT2,

            // X2A -> FT1 -> H5

            V2_X2A:
                FT1,

            X2A_FT1:
                FT1,

            FT1_H5:
                FT1,

            // X2B -> FT6 -> H4

            V2_X2B:
                FT6,

            X2B_FT6:
                FT6,

            FT6_H4:
                FT6,

            // P1 -> V3 -> FT4 -> H1
            /* FT4 confirma apenas este ramo.
             */

            P1_V3:
                FT4,

            V3_FT4:
                FT4,

            FT4_H1:
                FT4,

            // P2 -> V4 -> FT5 -> H2

            P2_V4:
                FT5,

            V4_FT5:
                FT5,

            FT5_H2:
                FT5,

            // TRECHOS NÃO MEDIDOS DIRETAMENTE
            /* Deixamos 0 até termos informação suficiente.
             */

            H5_HV3_IN:
                0,

            HV3_IN_H3:
                0,

            P1_RV1:
                0,

            RV1_H3:
                0,

            H3_HV3_P1:
                0,

            HV3_P1_P1:
                0,

            H6_HV4_IN:
                0,

            HV4_IN_H4:
                0,

            P2_RV2:
                0,

            RV2_H4:
                0,

            H4_HV4_P2:
                0,

            HV4_P2_P2:
                0,

            H1_HV1_DRAIN:
                0,

            HV1_DRAIN_RES:
                0,

            H2_HV2_DRAIN:
                0,

            HV2_DRAIN_RES:
                0
        };

    return realRuntime.flows;
}

// RUNTIME ENVIADO PARA PLANT-VIEW

export function getRealViewRuntime() {

    return {

        mode:
            'real',

        running:
            false,

        time:
            0,

        speed:
            1,

        connected:
            realRuntime.connected,

        connecting:
            realRuntime.connecting,

        connectionLabel:
            realRuntime.connectionLabel,

        transport:
            realRuntime.transport,

        port:
            realRuntime.port,

        lastUpdate:
            realRuntime.lastUpdate,

        lastError:
            realRuntime.lastError,

        flows:
            realRuntime.flows
    };
}

// CONEXÃO WEBSOCKET

export async function connectRealPlant(
    url = DEFAULT_WEBSOCKET_URL
) {

    if (
        realRuntime.connected ||
        realRuntime.connecting
    ) {

        return false;
    }

    if (
        realSocket &&
        (
            realSocket.readyState ===
                WebSocket.OPEN ||
            realSocket.readyState ===
                WebSocket.CONNECTING
        )
    ) {

        return false;
    }

    intentionalDisconnect =
        false;

    realRuntime.lastError =
        null;

    realRuntime.transport =
        'WebSocket';

    realRuntime.port =
        '8765';

    setRealConnecting(
        true
    );

    try {

        realSocket =
            new WebSocket(
                url
            );

    } catch (error) {

        realSocket =
            null;

        setRealConnectionError(
            `Não foi possível criar a conexão WebSocket: ${error.message}`
        );

        return false;
    }

    realSocket.addEventListener(
        'open',
        () => {

            setRealConnectionState(
                true,
                {
                    transport:
                        'WebSocket',

                    port:
                        '8765',

                    label:
                        'Conectado'
                }
            );

            realRuntime.lastError =
                null;

            sendRealCommand(
                {
                    type:
                        'hello',

                    client:
                        'hmi',

                    application:
                        'six-tank-supervisor'
                }
            );

            console.log(
                `[REAL] Conectado a ${url}`
            );
        }
    );

    realSocket.addEventListener(
        'message',
        event => {

            handleRealWebSocketMessage(
                event.data
            );
        }
    );

    realSocket.addEventListener(
        'error',
        () => {

            if (
                intentionalDisconnect
            ) {

                return;
            }

            realRuntime.lastError =
                `Não foi possível comunicar com ${url}.`;
        }
    );

    realSocket.addEventListener(
        'close',
        event => {

            realSocket =
                null;

            if (
                intentionalDisconnect
            ) {

                setRealConnectionState(
                    false,
                    {
                        transport:
                            'WebSocket',

                        port:
                            '8765',

                        label:
                            'Desconectado'
                    }
                );

                realRuntime.lastError =
                    null;

                return;
            }

            realRuntime.connected =
                false;

            realRuntime.connecting =
                false;

            if (
                event.code === 1000
            ) {

                realRuntime.connectionLabel =
                    'Desconectado';

            } else {

                realRuntime.connectionLabel =
                    'Erro de conexão';

                if (
                    !realRuntime.lastError
                ) {

                    realRuntime.lastError =
                        `Conexão encerrada inesperadamente (código ${event.code}).`;
                }
            }

            console.log(
                '[REAL] WebSocket desconectado.'
            );
        }
    );

    return true;
}

// DESCONECTAR

export async function disconnectRealPlant() {

    intentionalDisconnect =
        true;

    const socketToClose =
        realSocket;

    realSocket =
        null;

    if (
        socketToClose &&
        (
            socketToClose.readyState ===
                WebSocket.OPEN ||
            socketToClose.readyState ===
                WebSocket.CONNECTING
        )
    ) {

        try {

            socketToClose.close(
                1000,
                'Desconexão solicitada pela HMI'
            );

        } catch (error) {

            console.warn(
                '[REAL] Erro ao fechar WebSocket:',
                error
            );
        }
    }

    setRealConnectionState(
        false,
        {
            transport:
                'WebSocket',

            port:
                '8765',

            label:
                'Desconectado'
        }
    );

    realRuntime.lastError =
        null;

    return true;
}
