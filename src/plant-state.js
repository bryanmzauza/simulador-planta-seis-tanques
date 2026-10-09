// ESTADO COMUM DA PLANTA
/* Estrutura de dados compartilhada pela simulação e pela planta real. */

export function createPlantState() {

    return {

        // TANQUES

        tanks: [

            {
                id: 'H1',
                volume: 0,
                height: 0
            },

            {
                id: 'H2',
                volume: 0,
                height: 0
            },

            {
                id: 'H3',
                volume: 0,
                height: 0
            },

            {
                id: 'H4',
                volume: 0,
                height: 0
            },

            {
                id: 'H5',
                volume: 0,
                height: 0
            },

            {
                id: 'H6',
                volume: 0,
                height: 0
            }
        ],

        // BOMBAS
        /* power:
           0 = desligada
           1 = ligada
           command:
           comando normalizado entre 0 e 1
         */

        pumps: [

            {
                id: 'P1',

                source:
                    'H3',

                power:
                    0,

                command:
                    1
            },

            {
                id: 'P2',

                source:
                    'H4',

                power:
                    0,

                command:
                    1
            },

            {
                id: 'P3',

                source:
                    'RESERVOIR',

                power:
                    0,

                command:
                    1
            }
        ],

        // VÁLVULA PRINCIPAL
        /* P3 -> MV -> V1 / V2
         */

        mainValve: {

            id:
                'MV',

            opening:
                1
        },

        // VÁLVULAS ATUADAS
        /* V1 -> conjunto X1
           V2 -> conjunto X2
           V3 -> H1
           V4 -> H2
         */

        actuatedValves: [

            {
                id: 'V1',
                opening: 1
            },

            {
                id: 'V2',
                opening: 1
            },

            {
                id: 'V3',
                opening: 1
            },

            {
                id: 'V4',
                opening: 1
            }
        ],

        // VÁLVULAS MANUAIS DE RECIRCULAÇÃO
        /* Essas já existiam no modelo.
           P1 -> RV1 -> entrada comum de H3
           P2 -> RV2 -> entrada comum de H4
           RV1 e RV2 continuam existindo independentemente das
           novas válvulas manuais observadas.
         */

        recycleValves: [

            {
                id:
                    'RV1',

                tank:
                    'H3',

                opening:
                    1
            },

            {
                id:
                    'RV2',

                tank:
                    'H4',

                opening:
                    1
            }
        ],

        // OUTRAS VÁLVULAS MANUAIS DA PLANTA
        /* Identificações HV são provisórias:
           HV = Hand Valve
           HV3_IN
           Controla a entrada comum de H3.
           Antes dela se unem:
           H5
           +
           retorno P1 -> RV1
           HV4_IN
           Mesmo papel no lado direito:
           H6
           +
           retorno P2 -> RV2
           HV3_P1
           Entre a saída de H3 e a entrada de P1.
           HV4_P2
           Entre a saída de H4 e a entrada de P2.
           HV1_DRAIN
           Controla a descarga de H1 para o reservatório.
           HV2_DRAIN
           Controla a descarga de H2 para o reservatório.
         */

        manualValves: [

            {
                id:
                    'HV3_IN',

                function:
                    'COMMON_INLET_H3',

                opening:
                    1
            },

            {
                id:
                    'HV4_IN',

                function:
                    'COMMON_INLET_H4',

                opening:
                    1
            },

            {
                id:
                    'HV3_P1',

                function:
                    'H3_TO_P1',

                opening:
                    1
            },

            {
                id:
                    'HV4_P2',

                function:
                    'H4_TO_P2',

                opening:
                    1
            },

            {
                id:
                    'HV1_DRAIN',

                function:
                    'H1_TO_RESERVOIR',

                opening:
                    1
            },

            {
                id:
                    'HV2_DRAIN',

                function:
                    'H2_TO_RESERVOIR',

                opening:
                    1
            }
        ],

        // VÁLVULAS DE 3 VIAS / RELÉS
        /* Mapeamento físico atual:
           X1A -> H3
           X1B -> H6
           X2A -> H5
           X2B -> H4
         */

        threeWayValves: [

            {
                id:
                    'X1A',

                group:
                    'X1',

                target:
                    'H3',

                state:
                    true
            },

            {
                id:
                    'X1B',

                group:
                    'X1',

                target:
                    'H6',

                state:
                    true
            },

            {
                id:
                    'X2A',

                group:
                    'X2',

                target:
                    'H5',

                state:
                    true
            },

            {
                id:
                    'X2B',

                group:
                    'X2',

                target:
                    'H4',

                state:
                    true
            }
        ],

        // SENSORES DE VAZÃO
        /* Mapeamento utilizado atualmente:
           FT1 -> X2A -> H5
           FT2 -> X1B -> H6
           FT3 -> X1A -> H3
           FT4 -> V3  -> H1
           FT5 -> V4  -> H2
           FT6 -> X2B -> H4
           flow é apresentado em L/min.
         */

        flowSensors: [

            {
                id:
                    'FT1',

                flow:
                    0
            },

            {
                id:
                    'FT2',

                flow:
                    0
            },

            {
                id:
                    'FT3',

                flow:
                    0
            },

            {
                id:
                    'FT4',

                flow:
                    0
            },

            {
                id:
                    'FT5',

                flow:
                    0
            },

            {
                id:
                    'FT6',

                flow:
                    0
            }
        ],

        // SENSORES DE NÍVEL
        /* No simulador:
           valores calculados a partir do nível dos tanques.
           Na planta real:
           serão obtidos a partir dos MPX5010.
         */

        levelSensors: [

            {
                id:
                    'LT1',

                tank:
                    'H1',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            },

            {
                id:
                    'LT2',

                tank:
                    'H2',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            },

            {
                id:
                    'LT3',

                tank:
                    'H3',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            },

            {
                id:
                    'LT4',

                tank:
                    'H4',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            },

            {
                id:
                    'LT5',

                tank:
                    'H5',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            },

            {
                id:
                    'LT6',

                tank:
                    'H6',

                level:
                    0,

                pressure:
                    0,

                voltage:
                    null,

                raw:
                    null
            }
        ]
    };
}

// FUNÇÕES AUXILIARES DE ACESSO
/* Essas funções são compartilhadas por simulator.js,
   real.js e outras partes da aplicação.
 */

// TANQUES

export function getTank(
    plant,
    id
) {

    return plant.tanks.find(
        tank =>
            tank.id === id
    );
}

// BOMBAS

export function getPump(
    plant,
    id
) {

    return plant.pumps.find(
        pump =>
            pump.id === id
    );
}

// VÁLVULAS ATUADAS

export function getActuatedValve(
    plant,
    id
) {

    return plant.actuatedValves.find(
        valve =>
            valve.id === id
    );
}

// VÁLVULAS DE RECIRCULAÇÃO

export function getRecycleValve(
    plant,
    id
) {

    return plant.recycleValves.find(
        valve =>
            valve.id === id
    );
}

// DEMAIS VÁLVULAS MANUAIS

export function getManualValve(
    plant,
    id
) {

    return plant.manualValves.find(
        valve =>
            valve.id === id
    );
}

// VÁLVULAS DE 3 VIAS

export function getThreeWayValve(
    plant,
    id
) {

    return plant.threeWayValves.find(
        valve =>
            valve.id === id
    );
}

// SENSORES DE VAZÃO

export function getFlowSensor(
    plant,
    id
) {

    return plant.flowSensors.find(
        sensor =>
            sensor.id === id
    );
}

// SENSORES DE NÍVEL

export function getLevelSensor(
    plant,
    id
) {

    return plant.levelSensors.find(
        sensor =>
            sensor.id === id
    );
}