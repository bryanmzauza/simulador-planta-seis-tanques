// CONFIGURAÇÃO VISUAL DA PLANTA
/* Posições dos componentes e vértices das tubulações.
Coordenadas normalizadas: x vai da esquerda (0) à direita (1);
y vai do topo (0) à base (1). */

export const PLANT_CONFIG = {
    // Deslocamentos em pixels após a escala, para evitar sobreposição com equipamentos e bordas.
    componentOffsets: {
        levelSensors: { LT2: { x: 55 }, LT4: { x: 30 } },
        flowSensors: { FT2: { y: 15 } },
        relayValves: { X1A: { x: -10 }, X1B: { x: 10 }, X2A: { x: -10 }, X2B: { x: 10 } }
    },
    // Dimensões apenas visuais. Mantém cada componente centralizado na rota existente.
    componentScale: {
        LiquidTank: [1, 1, 1.3],
        Pump: [1.2, 1.2, 1.4],
        LevelSensor: [1.5, 1.5, 1.6],
        FlowSensor: [1.5, 1.5, 1.6],
        ActuatedValve: [1.3, 1.15, 1.4],
        RelayThreeWayValve: [1, 1.25, 1.3],
        ManualValve: [1.4, 1.4, 1.6],
        MainValve: [1.25, 1.25, 1.4]
    },


    // LAYOUT DOS COMPONENTES

    layout: {

        // TANQUES

        tanks: {

            H5: {
                x: 0.08,
                y: 0.06
            },

            H6: {
                x: 0.82,
                y: 0.06
            },

            H3: {
                x: 0.08,
                y: 0.42
            },

            H4: {
                x: 0.82,
                y: 0.42
            },

            H1: {
                x: 0.28,
                y: 0.40
            },

            H2: {
                x: 0.65,
                y: 0.40
            }
        },

        // SENSORES DE NÍVEL

        levelSensors: {

            LT5: {
                x: 0.03,
                y: 0.16
            },

            LT6: {
                x: 0.905,
                y: 0.16
            },

            LT3: {
                x: 0.03,
                y: 0.52
            },

            LT4: {
                x: 0.885,
                y: 0.52
            },

            LT1: {
                x: 0.23,
                y: 0.50
            },

            LT2: {
                x: 0.695,
                y: 0.50
            }
        },

        // SENSORES DE VAZÃO
        /* FT1 -> X2A -> H5
           FT2 -> X1B -> H6
           FT3 -> X1A -> H3
           FT4 -> V3  -> H1
           FT5 -> V4  -> H2
           FT6 -> X2B -> H4
         */

        flowSensors: {

            FT1: {
                x: 0.29,
                y: 0.03
            },

            FT2: {
                x: 0.68,
                y: -0.01
            },

            FT3: {
                x: 0.23,
                y: 0.08
            },

            FT4: {
                x: 0.34,
                y: 0.32
            },

            FT5: {
                x: 0.63,
                y: 0.32
            },

            FT6: {
                x: 0.74,
                y: 0.08
            }
        },

        // BOMBAS

        pumps: {

            P1: {
                x: 0.105,
                y: 0.82
            },

            P2: {
                x: 0.835,
                y: 0.82
            },

            P3: {
                x: 0.484,
                y: 0.86
            }
        },

        // VÁLVULAS DE 3 VIAS / RELÉS

        relayValves: {

            X1A: {
                x: 0.405,
                y: 0.12
            },

            X1B: {
                x: 0.435,
                y: 0.12
            },

            X2A: {
                x: 0.54,
                y: 0.12
            },

            X2B: {
                x: 0.57,
                y: 0.12
            }
        },

        // VÁLVULAS ATUADAS
        /* V1 -> X1
           V2 -> X2
           V3 -> H1
           V4 -> H2
         */

        actuatedValves: {

            V1: {
                x: 0.425,
                y: 0.31
            },

            V2: {
                x: 0.555,
                y: 0.31
            },

            V3: {
                x: 0.38,
                y: 0.55
            },

            V4: {
                x: 0.59,
                y: 0.55
            }
        },

        // VÁLVULAS DE RECIRCULAÇÃO
        /* RV1 e RV2 continuam sendo válvulas próprias da
           recirculação de P1 e P2.
         */

        recycleValves: {

            RV1: {
                x: 0.175,
                y: 0.64
            },

            RV2: {
                x: 0.795,
                y: 0.64
            }
        },

        // NOVAS VÁLVULAS MANUAIS
        /* HV = Hand Valve
           HV3_IN:
           H5 -> H3
           RV1:
           P1 -> H3 diretamente por uma entrada independente
           HV4_IN:
           H6 -> H4
           RV2:
           P2 -> H4 diretamente por uma entrada independente
           HV3_P1:
           H3 -> P1
           HV4_P2:
           H4 -> P2
           HV1_DRAIN:
           H1 -> reservatório
           HV2_DRAIN:
           H2 -> reservatório
         */

        manualValves: {

            HV3_IN: {
                x: 0.115,
                y: 0.35
            },

            HV4_IN: {
                x: 0.823,
                y: 0.35
            },

            HV3_P1: {
                x: 0.07,
                y: 0.70
            },

            HV4_P2: {
                x: 0.87,
                y: 0.70
            },

            HV1_DRAIN: {
                x: 0.2995,
                y: 0.67
            },

            HV2_DRAIN: {
                x: 0.6695,
                y: 0.67
            }
        },

        // VÁLVULA PRINCIPAL

        mainValve: {

            MV: {
                x: 0.485,
                y: 0.78
            }
        },

        // JUNÇÕES HIDRÁULICAS
        /* Não serão desenhadas como equipamentos.
           LEGADO: JH3/JH4 não são mais usados.
           A inspeção da bancada mostrou três entradas separadas:
           H3: FT3, H5 via HV3_IN e RV1
           H4: FT6, H6 via HV4_IN e RV2
         */

        junctions: {

            JH3: {
                x: 0.070,
                y: 0.335
            },

            JH4: {
                x: 0.930,
                y: 0.335
            }
        }
    },

    // RESERVATÓRIO

    reservoir: {

        x:
            0.38,

        y:
            0.955,

        width:
            0.25,

        heightPx:
            38
    },

    // ROTAS DAS TUBULAÇÕES
    /* Cada array contém os vértices intermediários do link.
       O início e o fim são definidos pelo plant-view.js.
     */

    routes: {

        // P3 / RAMO CENTRAL

        RES_P3: [],

        P3_MV: [],

        MV_V1: [
            {
                x: 0.505,
                y: 0.72
            },
            {
                x: 0.44,
                y: 0.72
            }
        ],

        MV_V2: [
            {
                x: 0.505,
                y: 0.72
            },
            {
                x: 0.57,
                y: 0.72
            }
        ],

        // V1 -> X1A / X1B

        V1_X1A: [
            {
                x: 0.44,
                y: 0.22
            },
            {
                x: 0.43,
                y: 0.19
            }
        ],

        V1_X1B: [
            {
                x: 0.44,
                y: 0.22
            },
            {
                x: 0.45,
                y: 0.19
            }
        ],

        // V2 -> X2A / X2B

        V2_X2A: [
            {
                x: 0.57,
                y: 0.22
            },
            {
                x: 0.56,
                y: 0.19
            }
        ],

        V2_X2B: [
            {
                x: 0.57,
                y: 0.22
            },
            {
                x: 0.58,
                y: 0.19
            }
        ],

        // X1A -> FT3 -> H3

        X1A_FT3: [
            {
                x: 0.417,
                y: 0.10
            },
            {
                x: 0.280,
                y: 0.10
            }
        ],

        FT3_H3: [
            {
                x: 0.210,
                y: 0.100
            },
            {
                x: 0.165,
                y: 0.100
            },
            {
                x: 0.165,
                y: 0.33
            },
            {
                x: 0.101,
                y: 0.33
            }
        ],

        // X1B -> FT2 -> H6

        X1B_FT2: [
            {
                x: 0.46,
                y: 0.025
            }
        ],

        FT2_H6: [
            {
                x: 0.855,
                y: 0.025
            }
        ],

        // X2A -> FT1 -> H5

        X2A_FT1: [
            {
                x: 0.553,
                y: 0.05
            }
        ],

        FT1_H5: [
            {
                x: 0.1155,
                y: 0.05
            }
        ],

        // X2B -> FT6 -> H4

        X2B_FT6: [
            {
                x: 0.595,
                y: 0.10
            },
        ],

        FT6_H4: [
            {
                x: 0.815,
                y: 0.1
            },
            {
                x: 0.815,
                y: 0.170
            },
            {
                x: 0.815,
                y: 0.33
            },
            {
                x: 0.869,
                y: 0.33
            }
        ],

        // LADO ESQUERDO
        /* H5 -> HV3_IN -> H3
           RV1 -> H3 diretamente (entrada separada)
         */

        H5_HV3_IN: [
            {
                x: 0.116,
                y: 0.315
            },
            {
                x: 0.123,
                y: 0.315
            }
        ],

        P1_RV1: [
            {
                x: 0.191,
                y: 0.86
            },
            {
                x: 0.191,
                y: 0.690
            }
        ],

        RV1_H3: [
            {
                x: 0.191,
                y: 0.590
            },
            {
                x: 0.191,
                y: 0.41
            },
            {
                x: 0.13,
                y: 0.41
            }
        ],

        HV3_IN_H3: [
            {
                x: 0.123,
                y: 0.4
            },
            {
                x: 0.1154,
                y: 0.4
            }
        ],

        // H3 -> HV3_P1 -> P1

        H3_HV3_P1: [
            {
                x: 0.1153,
                y: 0.72
            },

        ],

        HV3_P1_P1: [
            {
                x: 0.05,
                y: 0.72
            },
            {
                x: 0.05,
                y: 0.860
            }
        ],

        // LADO DIREITO
        /* H6 -> HV4_IN -> H4
           RV2 -> H4 diretamente (entrada separada)
         */

        H6_HV4_IN: [
            {
                x: 0.856,
                y: 0.315
            },
            {
                x: 0.84,
                y: 0.315
            }
        ],

        P2_RV2: [
            {
                x: 0.811,
                y: 0.86
            },

        ],

        RV2_H4: [
            {
                x: 0.811,
                y: 0.590
            },
            {
                x: 0.811,
                y: 0.41
            },
            {
                x: 0.8411,
                y: 0.41
            }
        ],

        HV4_IN_H4: [
            {
                x: 0.84,
                y: 0.4
            },
                        {
                x: 0.8558,
                y: 0.4
            }

        ],

        // H4 -> HV4_P2 -> P2

        H4_HV4_P2: [
            {
                x: 0.8556,
                y: 0.72
            },
        ],

        HV4_P2_P2: [
            {
                x: 0.921,
                y: 0.720
            },
            {
                x: 0.921,
                y: 0.860
            }
        ],

        // P1 -> V3 -> FT4 -> H1

        P1_V3: [
            {
                x: 0.394,
                y: 0.86
            }
        ],

        V3_FT4: [
            {
                x: 0.394,
                y: 0.34
            }
        ],

        FT4_H1: [
            {
                x: 0.3153,
                y: 0.34
            },

        ],

        // P2 -> V4 -> FT5 -> H2

        P2_V4: [
            {
                x: 0.604,
                y: 0.86
            }
        ],

        V4_FT5: [
            {
                x: 0.604,
                y: 0.34
            }
        ],

        FT5_H2: [
            {
                x: 0.685,
                y: 0.34
            },
        ],

        // H1 -> HV1_DRAIN -> RESERVATÓRIO

  

        HV1_DRAIN_RES: [
            {
                x: 0.3155,
                y: 0.92
            },
            {
                x: 0.41,
                y: 0.92
            }
        ],

        // H2 -> HV2_DRAIN -> RESERVATÓRIO



        HV2_DRAIN_RES: [
            {
                x: 0.6855,
                y: 0.92
            },
            {
                x: 0.6,
                y: 0.92
            }
        ]
    }
};
