// Somente apresentação: os identificadores do modelo, da API e da telemetria permanecem iguais.
const names = {
    HV1_DRAIN: 'VM1', HV2_DRAIN: 'VM2',
    HV3_P1: 'VM3', HV4_P2: 'VM4',
    HV3_IN: 'VM5', HV4_IN: 'VM6',
    RV1: 'VR3', RV2: 'VR4', MV: 'VMC',
    H1: 'T1', H2: 'T2', H3: 'T3', H4: 'T4', H5: 'T5', H6: 'T6',
    P1: 'B1', P2: 'B2', P3: 'B3'
};

export function componentLabel(value) {
    return String(value ?? '').replace(/\b(?:HV[1-6]_(?:DRAIN|P[12]|IN)|RV[12]|MV|H[1-6]|P[1-3])\b/g,
        id => names[id] ?? id);
}
