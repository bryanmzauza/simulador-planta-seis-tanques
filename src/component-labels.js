// RÓTULOS DOS COMPONENTES
/* Os IDs internos (H1, P1, V1, X1A, HV3_IN, LT1, FT1...) valem no modelo,
   na API, na telemetria e no backend. Aqui ficam só as traduções para a
   apresentação: nomes curtos da HMI antiga (T1, B1, VM1...) e tags ISA do
   P&ID (TQ-101, B-101, LV-101...). Nunca renomear os IDs internos. */

// ID interno -> nome curto (HMI antiga)
const SHORT_LABELS = {
    HV1_DRAIN: 'VM1',
    HV2_DRAIN: 'VM2',
    HV3_P1: 'VM3',
    HV4_P2: 'VM4',
    HV3_IN: 'VM5',
    HV4_IN: 'VM6',
    RV1: 'VR3',
    RV2: 'VR4',
    MV: 'VMC',
    H1: 'T1', H2: 'T2', H3: 'T3', H4: 'T4', H5: 'T5', H6: 'T6',
    P1: 'B1', P2: 'B2', P3: 'B3'
};

// ID interno -> tag ISA (P&ID, modelo v13)
const ISA_TAGS = {
    H1: 'TQ-101', H2: 'TQ-102', H3: 'TQ-103', H4: 'TQ-104', H5: 'TQ-105', H6: 'TQ-106',
    P1: 'B-101', P2: 'B-102', P3: 'B-103',
    V1: 'LV-101', V2: 'LV-102', V3: 'LV-103', V4: 'LV-104',
    X1: 'XV-101', X2: 'XV-102',
    X1A: 'XY-101A', X1B: 'XY-101B', X2A: 'XY-102A', X2B: 'XY-102B',
    HV1_DRAIN: 'HV-101', HV2_DRAIN: 'HV-102',
    HV3_P1: 'HV-103', HV4_P2: 'HV-104',
    HV3_IN: 'HV-105', HV4_IN: 'HV-106',
    RV1: 'HV-107', RV2: 'HV-108',
    MV: 'HV-109',
    LT1: 'LT-101', LT2: 'LT-102', LT3: 'LT-103', LT4: 'LT-104', LT5: 'LT-105', LT6: 'LT-106',
    // FT: a numeração do P&ID segue a posição no processo, não o número do canal
    FT3: 'FT-101', FT6: 'FT-102', FT1: 'FT-103', FT2: 'FT-104', FT4: 'FT-105', FT5: 'FT-106'
};

// Descrição curta em português, para tooltips e faceplates
const DESCRIPTIONS = {
    H1: 'Tanque inferior esquerdo (alimentado por LV-103)',
    H2: 'Tanque inferior direito (alimentado por LV-104)',
    H3: 'Tanque intermediário esquerdo (sucção de B-101)',
    H4: 'Tanque intermediário direito (sucção de B-102)',
    H5: 'Tanque superior esquerdo (descarga por gravidade em TQ-103)',
    H6: 'Tanque superior direito (descarga por gravidade em TQ-104)',
    P1: 'Bomba de TQ-103 para TQ-101',
    P2: 'Bomba de TQ-104 para TQ-102',
    P3: 'Bomba de alimentação (reservatório)',
    V1: 'Válvula de controle, servo 1 (alimenta XV-101)',
    V2: 'Válvula de controle, servo 2 (alimenta XV-102)',
    V3: 'Válvula de controle, servo 3 (B-101 → TQ-101)',
    V4: 'Válvula de controle, servo 4 (B-102 → TQ-102)',
    X1: 'Válvula de 3 vias temporizada: A → TQ-103, B → TQ-106',
    X2: 'Válvula de 3 vias temporizada: A → TQ-105, B → TQ-104',
    HV1_DRAIN: 'Descarga de TQ-101 para o reservatório',
    HV2_DRAIN: 'Descarga de TQ-102 para o reservatório',
    HV3_P1: 'Sucção de B-101',
    HV4_P2: 'Sucção de B-102',
    HV3_IN: 'TQ-105 → TQ-103 (gravidade)',
    HV4_IN: 'TQ-106 → TQ-104 (gravidade)',
    RV1: 'Recirculação de B-101',
    RV2: 'Recirculação de B-102',
    MV: 'Descarga de B-103',
    LT1: 'Nível de TQ-101', LT2: 'Nível de TQ-102', LT3: 'Nível de TQ-103',
    LT4: 'Nível de TQ-104', LT5: 'Nível de TQ-105', LT6: 'Nível de TQ-106',
    FT3: 'Vazão antes de LV-101', FT6: 'Vazão antes de LV-102',
    FT1: 'Vazão XV-102 porta A → TQ-105', FT2: 'Vazão XV-101 porta B → TQ-106',
    FT4: 'Vazão LV-103 → TQ-101', FT5: 'Vazão LV-104 → TQ-102'
};

// Nome curto (compatível com a HMI antiga)
export function componentLabel(value) {
    const text = String(value ?? '');
    return text.replace(
        /HV1_DRAIN|HV2_DRAIN|HV3_P1|HV4_P2|HV3_IN|HV4_IN|RV1|RV2|\bMV\b|\bH[1-6]\b|\bP[1-3]\b/g,
        match => SHORT_LABELS[match] ?? match
    );
}

// Tag ISA do P&ID
export function isaTag(id) {
    return ISA_TAGS[id] ?? String(id ?? '');
}

export function componentDescription(id) {
    return DESCRIPTIONS[id] ?? '';
}

// Tag ISA -> ID interno (para tabelas do backend que usam tags)
export function idFromIsaTag(tag) {
    for (const [id, isa] of Object.entries(ISA_TAGS)) {
        if (isa === tag) return id;
    }
    return null;
}
