// MODELO FÍSICO DA PLANTA DE SEIS TANQUES
/* Parâmetros físicos do simulador. Os valores são provisórios
e devem ser substituídos por medições e calibrações da planta real. */

export const PLANT_MODEL = {

    // TANQUES
    /* capacity:
       volume máximo considerado pelo simulador [L]
       maxHeight:
       altura útil considerada para o líquido [m]
       dischargeCoefficient:
       coeficiente provisório para escoamento gravitacional.
       null significa que esse tanque não usa descarga
       gravitacional diretamente no modelo atual.
     */

    tanks: {

        H1: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: 0.10
        },

        H2: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: 0.10
        },

        H3: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: null
        },

        H4: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: null
        },

        H5: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: 0.10
        },

        H6: {
            capacity: 1.0,
            maxHeight: 1.0,
            dischargeCoefficient: 0.10
        }
    },

    // BOMBAS
    /* maxFlow:
       vazão máxima usada pelo simulador [L/s]
       Esses valores NÃO são ainda a curva real da bomba.
       Futuramente podemos substituir isso por uma função
       vazão x comando/tensão.
     */

    pumps: {

        P1: {
            maxFlow: 0.20
        },

        P2: {
            maxFlow: 0.20
        },

        P3: {
            maxFlow: 0.20
        }
    },

    // SENSORES DE NÍVEL
    /* Os MPX5010 serão calibrados posteriormente.
       pressureMin / pressureMax em kPa.
       voltageMin / voltageMax podem ser preenchidos após
       testes reais.
     */

    levelSensors: {

        LT1: {
            tank: 'H1',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        },

        LT2: {
            tank: 'H2',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        },

        LT3: {
            tank: 'H3',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        },

        LT4: {
            tank: 'H4',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        },

        LT5: {
            tank: 'H5',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        },

        LT6: {
            tank: 'H6',
            pressureMin: 0,
            pressureMax: 10,
            voltageMin: null,
            voltageMax: null
        }
    },

    // SENSORES DE VAZÃO
    /* calibration:
       será preenchida depois de calibrarmos os seis sensores.
       O modelo atual usa as vazões calculadas pelo simulador.
     */

    flowSensors: {

        FT1: {
            calibration: null
        },

        FT2: {
            calibration: null
        },

        FT3: {
            calibration: null
        },

        FT4: {
            calibration: null
        },

        FT5: {
            calibration: null
        },

        FT6: {
            calibration: null
        }
    },

    // CONSTANTES FÍSICAS

    fluid: {

        // Água aproximadamente à temperatura ambiente.

        density: 1000,

        gravity: 9.81
    }
};