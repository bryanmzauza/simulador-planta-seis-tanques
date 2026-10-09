import {
    createPlantState,
    getTank,
    getPump,
    getActuatedValve,
    getRecycleValve,
    getManualValve,
    getThreeWayValve,
    getFlowSensor
} from './plant-state.js';

import {
    PLANT_MODEL
} from './plant-model.js';

/* SIMULADOR DA PLANTA
Responsabilidades:
- manter o estado da planta simulada
- calcular vazões
- atualizar volumes e alturas
- atualizar sensores simulados
- receber comandos enviados pelo main.js
Não contém JointJS ou manipulação do DOM.

ESTADO SIMULADO*/

export const simulatedPlant =
    createPlantState();

// ESTADO DA SIMULAÇÃO

export const simulationRuntime = {

    running:
        false,

    time:
        0,

    speed:
        1,

    interval:
        100,

    initialLevels: {

        H1: 0,
        H2: 0,
        H3: 0,
        H4: 0,
        H5: 0,
        H6: 0
    },

    flows:
        {},

    /* Água que sai do sistema de seis tanques por transbordamento [L].
       Não se presume um caminho físico de retorno para esse excesso.
     */
    overflowVolumes: Object.fromEntries(
        simulatedPlant.tanks.map(tank => [tank.id, 0])
    )
};

// ACESSO AO MODELO

function getTankModel(id) {

    return PLANT_MODEL
        .tanks[id];
}

function getPumpModel(id) {

    return PLANT_MODEL
        .pumps[id];
}

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

// GEOMETRIA PROVISÓRIA DOS TANQUES PET
/* A área transversal varia com a altura.
   Futuramente esta aproximação será substituída por dados
   experimentais volume x altura.
 */

function smoothstep(x) {

    const value =
        clamp(
            x,
            0,
            1
        );

    return (
        value *
        value *
        (
            3 -
            2 * value
        )
    );
}

function areaShapeFactor(z) {

    z =
        clamp(
            z,
            0,
            1
        );

    // Parte inferior estreita.

    if (
        z <=
        0.10
    ) {

        return 0.15;
    }

    // Transição para o corpo principal.

    if (
        z <=
        0.30
    ) {

        const t =
            (
                z -
                0.10
            ) /
            0.20;

        return (
            0.15 +
            0.85 *
            smoothstep(
                t
            )
        );
    }

    // Corpo aproximadamente cilíndrico.

    return 1;
}

// INTEGRAÇÃO NUMÉRICA DA GEOMETRIA

function integrateShape(
    start,
    end,
    steps = 100
) {

    if (
        end <=
        start
    ) {

        return 0;
    }

    if (
        steps %
        2 !==
        0
    ) {

        steps +=
            1;
    }

    const dx =
        (
            end -
            start
        ) /
        steps;

    let sum =
        areaShapeFactor(
            start
        ) +
        areaShapeFactor(
            end
        );

    for (
        let i = 1;
        i < steps;
        i += 1
    ) {

        const x =
            start +
            i *
            dx;

        sum +=
            (
                i %
                2 ===
                0
                    ? 2
                    : 4
            ) *
            areaShapeFactor(
                x
            );
    }

    return (
        sum *
        dx /
        3
    );
}

const fullShapeIntegral =
    integrateShape(
        0,
        1,
        200
    );

// ALTURA -> VOLUME

function getTankAreaScale(tank) {

    const model =
        getTankModel(
            tank.id
        );

    return (
        model.capacity /
        (
            model.maxHeight *
            fullShapeIntegral
        )
    );
}

export function heightToVolume(
    tank,
    height
) {

    const model =
        getTankModel(
            tank.id
        );

    const boundedHeight =
        clamp(
            height,
            0,
            model.maxHeight
        );

    const normalizedHeight =
        boundedHeight /
        model.maxHeight;

    return (
        getTankAreaScale(
            tank
        ) *
        model.maxHeight *
        integrateShape(
            0,
            normalizedHeight,
            80
        )
    );
}

// VOLUME -> ALTURA

export function volumeToHeight(
    tank,
    volume
) {

    const model =
        getTankModel(
            tank.id
        );

    const boundedVolume =
        clamp(
            volume,
            0,
            model.capacity
        );

    if (
        boundedVolume <=
        0
    ) {

        return 0;
    }

    if (
        boundedVolume >=
        model.capacity
    ) {

        return model.maxHeight;
    }

    let low =
        0;

    let high =
        model.maxHeight;

    for (
        let i = 0;
        i < 30;
        i += 1
    ) {

        const middle =
            (
                low +
                high
            ) /
            2;

        const middleVolume =
            heightToVolume(
                tank,
                middle
            );

        if (
            middleVolume <
            boundedVolume
        ) {

            low =
                middle;

        } else {

            high =
                middle;
        }
    }

    return (
        low +
        high
    ) /
    2;
}

// ATUALIZAÇÃO DOS TANQUES

function updateTankHeightFromVolume(
    tank
) {

    tank.height =
        volumeToHeight(
            tank,
            tank.volume
        );
}

function clampTankVolume(
    tank
) {

    const model =
        getTankModel(
            tank.id
        );

    tank.volume =
        clamp(
            tank.volume,
            0,
            model.capacity
        );

    updateTankHeightFromVolume(
        tank
    );
}

// ESCOAMENTO GRAVITACIONAL
/* Modelo provisório:
   Q = k * sqrt(h)
   A abertura de uma válvula em série pode ser aplicada depois
   sobre esse valor.
 */

function calculateGravityDischarge(
    tank
) {

    const model =
        getTankModel(
            tank.id
        );

    const coefficient =
        model
            .dischargeCoefficient;

    if (
        coefficient ===
            null ||
        coefficient ===
            undefined ||
        tank.height <=
            0
    ) {

        return 0;
    }

    return (
        coefficient *
        Math.sqrt(
            tank.height
        )
    );
}

// MODELO PROVISÓRIO DA BOMBA
/* Q = Qmax * comando
   restriction representa uma restrição em série antes da
   entrada da bomba.
   Exemplo:
   H3 -> HV3_P1 -> P1
   Se HV3_P1 = 50%, usamos provisoriamente 50% da vazão que
   seria produzida pela bomba.
   Isso será substituído futuramente por um modelo calibrado.
 */

function calculatePumpFlow(
    pump,
    restriction = 1,
    dt = null
) {

    if (
        !pump.power
    ) {

        return 0;
    }

    restriction =
        clamp(
            restriction,
            0,
            1
        );

    if (
        restriction <=
        0
    ) {

        return 0;
    }

    // P1 depende de água em H3.

    if (
        pump.source ===
            'H3' &&
        getTank(
            simulatedPlant,
            'H3'
        ).volume <=
            0
    ) {

        return 0;
    }

    // P2 depende de água em H4.

    if (
        pump.source ===
            'H4' &&
        getTank(
            simulatedPlant,
            'H4'
        ).volume <=
            0
    ) {

        return 0;
    }

    const model =
        getPumpModel(
            pump.id
        );

    const flow = (
        model.maxFlow *
        clamp(
            pump.command,
            0,
            1
        ) *
        restriction
    );

    const source = getTank(simulatedPlant, pump.source);
    return source ? limitTankOutflow(flow, source, dt) : flow;
}

/* Usa a mesma transferência limitada na origem e no destino.
   Cada origem tem uma retirada neste ponto (P1/P2 dividem a vazão adiante).
 */
function limitTankOutflow(flow, tank, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return flow;
    return Math.min(flow, Math.max(0, tank.volume) / dt);
}

// DIVISÃO DE VAZÃO ENTRE DUAS SAÍDAS
/* A divisão é proporcional às aberturas efetivas.
   Exemplo em P1:
   saída A:
   V3 -> H1
   saída B:
   RV1 -> HV3_IN -> H3
   Logo a abertura efetiva da recirculação é:
   RV1 * HV3_IN
 */

function splitFlowByValves(
    totalFlow,
    openingA,
    openingB
) {

    openingA =
        clamp(
            openingA,
            0,
            1
        );

    openingB =
        clamp(
            openingB,
            0,
            1
        );

    const totalOpening =
        openingA +
        openingB;

    if (
        totalOpening <=
        0
    ) {

        return {

            A:
                0,

            B:
                0
        };
    }

    return {

        A:
            totalFlow *
            openingA /
            totalOpening,

        B:
            totalFlow *
            openingB /
            totalOpening
    };
}

// DIVISÃO ENTRE VÁLVULAS X
/* Modelo ainda provisório:
   ambas ON  -> 50/50
   só A ON   -> 100/0
   só B ON   -> 0/100
   ambas OFF -> sem vazão
 */

function splitRelayFlow(
    totalFlow,
    valveA,
    valveB
) {

    const a =
        valveA.state
            ? 1
            : 0;

    const b =
        valveB.state
            ? 1
            : 0;

    const total =
        a +
        b;

    if (
        total ===
        0
    ) {

        return {

            A:
                0,

            B:
                0
        };
    }

    return {

        A:
            totalFlow *
            a /
            total,

        B:
            totalFlow *
            b /
            total
    };
}

// CÁLCULO DAS VAZÕES

export function calculateSimulationFlows(dt = null) {

    // TANQUES

    const H1 =
        getTank(
            simulatedPlant,
            'H1'
        );

    const H2 =
        getTank(
            simulatedPlant,
            'H2'
        );

    const H5 =
        getTank(
            simulatedPlant,
            'H5'
        );

    const H6 =
        getTank(
            simulatedPlant,
            'H6'
        );

    // VÁLVULAS MANUAIS

    const hv3In =
        getManualValve(
            simulatedPlant,
            'HV3_IN'
        ).opening;

    const hv4In =
        getManualValve(
            simulatedPlant,
            'HV4_IN'
        ).opening;

    const hv3P1 =
        getManualValve(
            simulatedPlant,
            'HV3_P1'
        ).opening;

    const hv4P2 =
        getManualValve(
            simulatedPlant,
            'HV4_P2'
        ).opening;

    const hv1Drain =
        getManualValve(
            simulatedPlant,
            'HV1_DRAIN'
        ).opening;

    const hv2Drain =
        getManualValve(
            simulatedPlant,
            'HV2_DRAIN'
        ).opening;

    // BOMBAS
    /* P1 recebe água de H3 através de HV3_P1.
       P2 recebe água de H4 através de HV4_P2.
       P3 vem diretamente do reservatório.
     */

    const P1 =
        calculatePumpFlow(

            getPump(
                simulatedPlant,
                'P1'
            ),

            hv3P1,
            dt
        );

    const P2 =
        calculatePumpFlow(

            getPump(
                simulatedPlant,
                'P2'
            ),

            hv4P2,
            dt
        );

    const P3 =
        calculatePumpFlow(

            getPump(
                simulatedPlant,
                'P3'
            )
        );

    // V1 - V4

    const v1 =
        getActuatedValve(
            simulatedPlant,
            'V1'
        ).opening;

    const v2 =
        getActuatedValve(
            simulatedPlant,
            'V2'
        ).opening;

    const v3 =
        getActuatedValve(
            simulatedPlant,
            'V3'
        ).opening;

    const v4 =
        getActuatedValve(
            simulatedPlant,
            'V4'
        ).opening;

    // RV1 / RV2

    const rv1 =
        getRecycleValve(
            simulatedPlant,
            'RV1'
        ).opening;

    const rv2 =
        getRecycleValve(
            simulatedPlant,
            'RV2'
        ).opening;

    // RAMO CENTRAL
    /* Reservatório -> P3 -> MV -> V1 / V2
     */

    const centralFlow =
        P3 *
        clamp(
            simulatedPlant
                .mainValve
                .opening,
            0,
            1
        );

    const centralSplit =
        splitFlowByValves(
            centralFlow,
            v1,
            v2
        );

    const branchX1 =
        centralSplit.A;

    const branchX2 =
        centralSplit.B;

    // X1
    /* X1A -> H3
       X1B -> H6
     */

    const x1Split =
        splitRelayFlow(

            branchX1,

            getThreeWayValve(
                simulatedPlant,
                'X1A'
            ),

            getThreeWayValve(
                simulatedPlant,
                'X1B'
            )
        );

    const X1A_H3 =
        x1Split.A;

    const X1B_H6 =
        x1Split.B;

    // X2
    /* X2A -> H5
       X2B -> H4
     */

    const x2Split =
        splitRelayFlow(

            branchX2,

            getThreeWayValve(
                simulatedPlant,
                'X2A'
            ),

            getThreeWayValve(
                simulatedPlant,
                'X2B'
            )
        );

    const X2A_H5 =
        x2Split.A;

    const X2B_H4 =
        x2Split.B;

    // Ramos com relés fechados não retiram água do reservatório.
    const suppliedX1 = X1A_H3 + X1B_H6;
    const suppliedX2 = X2A_H5 + X2B_H4;
    const suppliedP3 = suppliedX1 + suppliedX2;

    // H5 -> ENTRADA COMUM DE H3
    /* A saída gravitacional de H5 passa pela válvula manual
       HV3_IN antes de entrar em H3.
       Modelo provisório:
       Qreal = Qgravidade * abertura
     */

    const H5_RAW =
        calculateGravityDischarge(
            H5
        );

    const H5_H3 =
        limitTankOutflow(H5_RAW *
        clamp(
            hv3In,
            0,
            1
        ), H5, dt);

    // H6 -> ENTRADA COMUM DE H4

    const H6_RAW =
        calculateGravityDischarge(
            H6
        );

    const H6_H4 =
        limitTankOutflow(H6_RAW *
        clamp(
            hv4In,
            0,
            1
        ), H6, dt);

    // P1
    /* H3 -> HV3_P1 -> P1
       Na saída da bomba:
                   ┌-> V3 -> FT4 -> H1
       P1 ---------|
                   └-> RV1 -> H3 (entrada independente)
       Nova inspeção física:
       RV1 NÃO passa por HV3_IN.
     */

    const effectiveRecycle1 =
        clamp(
            rv1,
            0,
            1
        );

    const p1Split =
        splitFlowByValves(
            P1,
            v3,
            effectiveRecycle1
        );

    const V3_H1 =
        p1Split.A;

    const RV1_H3 =
        p1Split.B;

    /* Vazão efetiva realmente retirada de H3 pela P1.
       Se V3 e o caminho de recirculação estiverem ambos
       bloqueados, p1Split.A = 0 e p1Split.B = 0. Nesse caso,
       a bomba pode estar comandada, mas não existe caminho
       hidráulico para escoamento e H3 não deve perder volume.
     */
    const P1_EFFECTIVE =
        V3_H1 +
        RV1_H3;

    /* As entradas de H5 e RV1 agora são independentes.
       Mantemos COMMON_H3 apenas por compatibilidade interna.
     */

    const COMMON_H3 =
        H5_H3 +
        RV1_H3;

    // P2
    /* H4 -> HV4_P2 -> P2
                   ┌-> V4 -> FT5 -> H2
       P2 ---------|
                   └-> RV2 -> junção -> HV4_IN -> H4
     */

    const effectiveRecycle2 =
        clamp(
            rv2,
            0,
            1
        );

    const p2Split =
        splitFlowByValves(
            P2,
            v4,
            effectiveRecycle2
        );

    const V4_H2 =
        p2Split.A;

    const RV2_H4 =
        p2Split.B;

    /* Vazão efetiva realmente retirada de H4 pela P2.
       Se V4 e o caminho de recirculação estiverem ambos
       bloqueados, a P2 não deve retirar água de H4.
     */
    const P2_EFFECTIVE =
        V4_H2 +
        RV2_H4;

    // As entradas de H6 e RV2 agora são independentes.
    const COMMON_H4 =
        H6_H4 +
        RV2_H4;

    // DESCARGAS H1 / H2
    /* Agora existem válvulas manuais entre os tanques e o
       reservatório.
     */

    const H1_RAW =
        calculateGravityDischarge(
            H1
        );

    const H2_RAW =
        calculateGravityDischarge(
            H2
        );

    const H1_RES =
        limitTankOutflow(H1_RAW *
        clamp(
            hv1Drain,
            0,
            1
        ), H1, dt);

    const H2_RES =
        limitTankOutflow(H2_RAW *
        clamp(
            hv2Drain,
            0,
            1
        ), H2, dt);

    // RESULTADOS FÍSICOS

    const physicalFlows = {

        /* Bombas
           Para P1/P2 usamos a vazão efetiva, isto é, somente
           a vazão que realmente encontra uma saída aberta.
           P3 também considera somente os caminhos abertos.
         */

        P1:
            P1_EFFECTIVE,

        P2:
            P2_EFFECTIVE,

        P3: suppliedP3,

        // Ramo central

        centralFlow: suppliedP3,

        branchX1: suppliedX1,
        branchX2: suppliedX2,

        // Alimentação principal dos tanques

        X1A_H3,
        X1B_H6,

        X2A_H5,
        X2B_H4,

        // H5 / H6

        H5_H3,
        H6_H4,

        // P1 / P2

        V3_H1,
        RV1_H3,

        V4_H2,
        RV2_H4,

        // Entradas comuns

        COMMON_H3,
        COMMON_H4,

        // Descargas

        H1_RES,
        H2_RES
    };

    // VAZÕES VISUAIS
    /* Os nomes correspondem às conexões de plant-view.js.
     */

    const visualFlows = {

        // RAMO CENTRAL

        RES_P3:
            suppliedP3,

        P3_MV:
            suppliedP3,

        MV_V1:
            suppliedX1,

        MV_V2:
            suppliedX2,

        // X1A -> H3

        V1_X1A:
            X1A_H3,

        X1A_FT3:
            X1A_H3,

        FT3_H3:
            X1A_H3,

        // X1B -> H6

        V1_X1B:
            X1B_H6,

        X1B_FT2:
            X1B_H6,

        FT2_H6:
            X1B_H6,

        // X2A -> H5

        V2_X2A:
            X2A_H5,

        X2A_FT1:
            X2A_H5,

        FT1_H5:
            X2A_H5,

        // X2B -> H4

        V2_X2B:
            X2B_H4,

        X2B_FT6:
            X2B_H4,

        FT6_H4:
            X2B_H4,

        // TRÊS ENTRADAS INDEPENDENTES DE H3

        H5_HV3_IN:
            H5_H3,

        HV3_IN_H3:
            H5_H3,

        P1_RV1:
            RV1_H3,

        RV1_H3:
            RV1_H3,

        // H3 -> HV3_P1 -> P1

        H3_HV3_P1:
            P1_EFFECTIVE,

        HV3_P1_P1:
            P1_EFFECTIVE,

        // P1 -> V3 -> FT4 -> H1

        P1_V3:
            V3_H1,

        V3_FT4:
            V3_H1,

        FT4_H1:
            V3_H1,

        // TRÊS ENTRADAS INDEPENDENTES DE H4

        H6_HV4_IN:
            H6_H4,

        HV4_IN_H4:
            H6_H4,

        P2_RV2:
            RV2_H4,

        RV2_H4:
            RV2_H4,

        // H4 -> HV4_P2 -> P2

        H4_HV4_P2:
            P2_EFFECTIVE,

        HV4_P2_P2:
            P2_EFFECTIVE,

        // P2 -> V4 -> FT5 -> H2

        P2_V4:
            V4_H2,

        V4_FT5:
            V4_H2,

        FT5_H2:
            V4_H2,

        // H1 -> HV1_DRAIN -> RESERVATÓRIO

        H1_HV1_DRAIN:
            H1_RES,

        HV1_DRAIN_RES:
            H1_RES,

        // H2 -> HV2_DRAIN -> RESERVATÓRIO

        H2_HV2_DRAIN:
            H2_RES,

        HV2_DRAIN_RES:
            H2_RES
    };

    simulationRuntime.flows =
        visualFlows;

    return {

        physical:
            physicalFlows,

        visual:
            visualFlows
    };
}

// SENSORES DE NÍVEL
/* P = rho * g * h
 */

function updateLevelSensors() {

    simulatedPlant
        .levelSensors
        .forEach(
            sensor => {

                const tank =
                    getTank(
                        simulatedPlant,
                        sensor.tank
                    );

                const tankModel =
                    getTankModel(
                        sensor.tank
                    );

                if (
                    !tank ||
                    !tankModel
                ) {

                    return;
                }

                sensor.level =
                    tankModel.maxHeight >
                    0
                        ? (
                            tank.height /
                            tankModel.maxHeight
                        ) *
                        100
                        : 0;

                const pressurePa =
                    PLANT_MODEL
                        .fluid
                        .density *
                    PLANT_MODEL
                        .fluid
                        .gravity *
                    tank.height;

                sensor.pressure =
                    pressurePa /
                    1000;

                sensor.voltage =
                    null;

                sensor.raw =
                    null;
            }
        );
}

// SENSORES DE VAZÃO
/* Modelo interno: L/s
   Interface: L/min
 */

function updateFlowSensors(
    flows
) {

    // FT1 -> X2A -> H5

    getFlowSensor(
        simulatedPlant,
        'FT1'
    ).flow =
        flows.X2A_H5 *
        60;

    // FT2 -> X1B -> H6

    getFlowSensor(
        simulatedPlant,
        'FT2'
    ).flow =
        flows.X1B_H6 *
        60;

    // FT3 -> X1A -> H3

    getFlowSensor(
        simulatedPlant,
        'FT3'
    ).flow =
        flows.X1A_H3 *
        60;

    // FT4 -> V3 -> H1

    getFlowSensor(
        simulatedPlant,
        'FT4'
    ).flow =
        flows.V3_H1 *
        60;

    // FT5 -> V4 -> H2

    getFlowSensor(
        simulatedPlant,
        'FT5'
    ).flow =
        flows.V4_H2 *
        60;

    // FT6 -> X2B -> H4

    getFlowSensor(
        simulatedPlant,
        'FT6'
    ).flow =
        flows.X2B_H4 *
        60;
}

// PASSO DA SIMULAÇÃO

export function stepSimulation(dt) {

    if (
        !Number.isFinite(
            dt
        ) ||
        dt <=
        0
    ) {

        return;
    }

    const H1 =
        getTank(
            simulatedPlant,
            'H1'
        );

    const H2 =
        getTank(
            simulatedPlant,
            'H2'
        );

    const H3 =
        getTank(
            simulatedPlant,
            'H3'
        );

    const H4 =
        getTank(
            simulatedPlant,
            'H4'
        );

    const H5 =
        getTank(
            simulatedPlant,
            'H5'
        );

    const H6 =
        getTank(
            simulatedPlant,
            'H6'
        );

    const result =
        calculateSimulationFlows(dt);

    const flows =
        result.physical;

    // H5
    /* Entrada:
       X2A
       Saída:
       ramo gravitacional para H3
     */

    H5.volume +=
        (
            flows.X2A_H5 -
            flows.H5_H3
        ) *
        dt;

    // H6

    H6.volume +=
        (
            flows.X1B_H6 -
            flows.H6_H4
        ) *
        dt;

    // H3
    /* Entradas:
       X1A
       +
       fluxo comum:
       H5 + retorno RV1
       através de HV3_IN
       Saída:
       H3 -> HV3_P1 -> P1
     */

    H3.volume +=
        (
            flows.X1A_H3 +
            flows.H5_H3 +
            flows.RV1_H3 -
            flows.P1
        ) *
        dt;

    // H4

    H4.volume +=
        (
            flows.X2B_H4 +
            flows.H6_H4 +
            flows.RV2_H4 -
            flows.P2
        ) *
        dt;

    // H1
    /* Entrada:
       V3 / FT4
       Saída:
       HV1_DRAIN -> reservatório
     */

    H1.volume +=
        (
            flows.V3_H1 -
            flows.H1_RES
        ) *
        dt;

    // H2

    H2.volume +=
        (
            flows.V4_H2 -
            flows.H2_RES
        ) *
        dt;

    // LIMITES FÍSICOS

    simulatedPlant
        .tanks
        .forEach(
            tank => {
                const capacity = getTankModel(tank.id).capacity;
                simulationRuntime.overflowVolumes[tank.id] +=
                    Math.max(0, tank.volume - capacity);
                clampTankVolume(tank);
            }
        );

    // SENSORES

    updateFlowSensors(
        flows
    );

    updateLevelSensors();

    // TEMPO

    simulationRuntime.time +=
        dt;
}

// ATUALIZAÇÃO SEM AVANÇAR TEMPO

export function refreshSimulationState() {

    simulatedPlant
        .tanks
        .forEach(
            clampTankVolume
        );

    const result =
        calculateSimulationFlows();

    updateFlowSensors(
        result.physical
    );

    updateLevelSensors();

    return result;
}

// SIMULAÇÃO

export function toggleSimulation() {

    simulationRuntime.running =
        !simulationRuntime.running;

    return simulationRuntime.running;
}

export function startSimulation() {

    simulationRuntime.running =
        true;
}

export function pauseSimulation() {

    simulationRuntime.running =
        false;
}

// VELOCIDADE

export function setSimulationSpeed(
    speed
) {

    if (
        !Number.isFinite(
            speed
        ) ||
        speed <=
        0
    ) {

        return;
    }

    simulationRuntime.speed =
        speed;
}

// NÍVEL INICIAL

export function setInitialTankLevel(
    id,
    normalizedLevel
) {

    const tank =
        getTank(
            simulatedPlant,
            id
        );

    const model =
        getTankModel(
            id
        );

    if (
        !tank ||
        !model
    ) {

        return;
    }

    const level =
        clamp(
            normalizedLevel,
            0,
            1
        );

    simulationRuntime
        .initialLevels[id] =
        level;

    if (
        !simulationRuntime.running
    ) {

        const height =
            model.maxHeight *
            level;

        tank.volume =
            heightToVolume(
                tank,
                height
            );

        tank.height =
            height;

        refreshSimulationState();
    }
}

// CAPACIDADE

export function setTankCapacity(
    id,
    capacity
) {

    if (
        !Number.isFinite(
            capacity
        ) ||
        capacity <=
        0
    ) {

        return;
    }

    const model =
        getTankModel(
            id
        );

    const tank =
        getTank(
            simulatedPlant,
            id
        );

    if (
        !model ||
        !tank
    ) {

        return;
    }

    model.capacity =
        capacity;

    clampTankVolume(
        tank
    );

    refreshSimulationState();
}

// BOMBAS

export function togglePump(id) {

    const pump =
        getPump(
            simulatedPlant,
            id
        );

    if (!pump) {

        return;
    }

    pump.power =
        pump.power
            ? 0
            : 1;

    refreshSimulationState();
}

export function setPumpPower(
    id,
    power
) {

    const pump =
        getPump(
            simulatedPlant,
            id
        );

    if (!pump) {

        return;
    }

    pump.power =
        power
            ? 1
            : 0;

    refreshSimulationState();
}

export function setPumpCommand(
    id,
    command
) {

    const pump =
        getPump(
            simulatedPlant,
            id
        );

    if (!pump) {

        return;
    }

    pump.command =
        clamp(
            command,
            0,
            1
        );

    refreshSimulationState();
}

// MV

export function setMainValveOpening(
    opening
) {

    simulatedPlant
        .mainValve
        .opening =
        clamp(
            opening,
            0,
            1
        );

    refreshSimulationState();
}

// V1 - V4

export function setActuatedValveOpening(
    id,
    opening
) {

    const valve =
        getActuatedValve(
            simulatedPlant,
            id
        );

    if (!valve) {

        return;
    }

    valve.opening =
        clamp(
            opening,
            0,
            1
        );

    refreshSimulationState();
}

// RV1 / RV2

export function setRecycleValveOpening(
    id,
    opening
) {

    const valve =
        getRecycleValve(
            simulatedPlant,
            id
        );

    if (!valve) {

        return;
    }

    valve.opening =
        clamp(
            opening,
            0,
            1
        );

    refreshSimulationState();
}

// NOVAS VÁLVULAS MANUAIS
/* HV3_IN
   HV4_IN
   HV3_P1
   HV4_P2
   HV1_DRAIN
   HV2_DRAIN
 */

export function setManualValveOpening(
    id,
    opening
) {

    const valve =
        getManualValve(
            simulatedPlant,
            id
        );

    if (!valve) {

        return;
    }

    valve.opening =
        clamp(
            opening,
            0,
            1
        );

    refreshSimulationState();
}

// X1A / X1B / X2A / X2B

export function toggleThreeWayValve(id) {

    const valve =
        getThreeWayValve(
            simulatedPlant,
            id
        );

    if (!valve) {

        return;
    }

    valve.state =
        !valve.state;

    refreshSimulationState();
}

export function setThreeWayValveState(
    id,
    state
) {

    const valve =
        getThreeWayValve(
            simulatedPlant,
            id
        );

    if (!valve) {

        return;
    }

    valve.state =
        Boolean(
            state
        );

    refreshSimulationState();
}

// RESET

export function resetSimulation() {

    for (const id of Object.keys(simulationRuntime.overflowVolumes)) {
        simulationRuntime.overflowVolumes[id] = 0;
    }

    simulationRuntime.running =
        false;

    simulationRuntime.time =
        0;

    simulatedPlant
        .tanks
        .forEach(
            tank => {

                const model =
                    getTankModel(
                        tank.id
                    );

                const normalizedLevel =
                    simulationRuntime
                        .initialLevels[
                            tank.id
                        ] ??
                    0;

                const height =
                    model.maxHeight *
                    normalizedLevel;

                tank.volume =
                    heightToVolume(
                        tank,
                        height
                    );

                tank.height =
                    height;
            }
        );

    refreshSimulationState();
}

// RUNTIME ENVIADO PARA PLANT-VIEW

export function getSimulationViewRuntime() {

    return {

        mode:
            'simulation',

        running:
            simulationRuntime.running,

        time:
            simulationRuntime.time,

        speed:
            simulationRuntime.speed,

        connected:
            false,

        connectionLabel:
            'Simulação',

        flows:
            simulationRuntime.flows,

        overflowVolumes:
            { ...simulationRuntime.overflowVolumes }
    };
}

// INICIALIZAÇÃO

refreshSimulationState();
