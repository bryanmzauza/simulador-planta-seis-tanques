"""Cenários de controle do modo MODELICA.

Cada cenário é uma lista de malhas. Uma malha liga uma variável de
processo (PV) a uma variável manipulada (MV) por um controlador do banco
(PID_ISA ou PI). Os IDs usados aqui são os internos do código
(FT1..FT6, H1..H6, P1..P3, V1..V4); as tags ISA ficam na apresentação.

Correspondência com o P&ID (ver cabeçalho de modelica/modelo_6tanques_v13.mo):
    FT101 = FT3   FT102 = FT6   FT103 = FT1   FT104 = FT2   FT105 = FT4   FT106 = FT5
    LV101 = V1    LV102 = V2    LV103 = V3    LV104 = V4
    B101 = P1     B102 = P2     B103 = P3
    TQ101..106 = H1..H6, LT101..106 = LT1..LT6

As sintonias iniciais são provisórias (a planta ainda não foi
identificada); a HMI permite ajustá-las com a simulação rodando.
"""

import copy

# Sintonia padrão de uma malha quando o cenário não diz outra coisa.
SINTONIA_PADRAO = {
    "tipo": "PID_ISA",   # PID_ISA ou PI (PI = PID_ISA com Td = 0)
    "kp": 0.1,
    "ti": 10.0,
    "td": 0.0,
    "b": 1.0,
    "c": 0.0,
    "n": 10.0,
    "ftt": 2.0,
    "u_bias": 0.5,
    "u_min": 0.0,
    "u_max": 1.0,
}


def malha(tag, pv, mv, descricao, unidade, sp, sp_min, sp_max, acao=1, **sintonia):
    base = copy.deepcopy(SINTONIA_PADRAO)
    base.update(sintonia)
    return {
        "tag": tag,
        "descricao": descricao,
        "pv": pv,            # {"tipo": "vazao", "id": "FT3"} | {"tipo": "nivel", "id": "H1"} | {"tipo": "vazao_soma", "ids": [...]}
        "mv": mv,            # {"tipo": "valvula", "id": "V1"} | {"tipo": "bomba", "id": "P1"}
        "unidade": unidade,
        "sp": sp,
        "sp_min": sp_min,
        "sp_max": sp_max,
        "acao": acao,        # +1 direta (MV sobe quando PV < SP), -1 reversa
        "sintonia": base,
    }


def vazao(ft):
    return {"tipo": "vazao", "id": ft}


def vazao_soma(*fts):
    return {"tipo": "vazao_soma", "ids": list(fts)}


def nivel(tanque):
    return {"tipo": "nivel", "id": tanque}


def valvula(v):
    return {"tipo": "valvula", "id": v}


def bomba(p):
    return {"tipo": "bomba", "id": p}


CENARIOS = {
    "vazao_valvula": {
        "nome": "Vazão por válvula",
        "descricao": "Cada FT controlado pela válvula de controle (LV) do seu trecho; bombas fixas em 100 %.",
        "fixos": {"pumps": {"P1": 1.0, "P2": 1.0, "P3": 1.0}},
        "malhas": [
            malha("FIC-101", vazao("FT3"), valvula("V1"), "Vazão antes de LV-101", "L/min", 2.0, 0.0, 6.0, kp=0.08, ti=4.0),
            malha("FIC-102", vazao("FT6"), valvula("V2"), "Vazão antes de LV-102", "L/min", 2.0, 0.0, 6.0, kp=0.08, ti=4.0),
            malha("FIC-105", vazao("FT4"), valvula("V3"), "Vazão de B-101 para TQ-101", "L/min", 1.5, 0.0, 6.0, kp=0.08, ti=4.0),
            malha("FIC-106", vazao("FT5"), valvula("V4"), "Vazão de B-102 para TQ-102", "L/min", 1.5, 0.0, 6.0, kp=0.08, ti=4.0),
        ],
    },
    "vazao_bomba": {
        "nome": "Vazão por bomba",
        "descricao": "Cada FT controlado pela rotação da bomba do seu trecho; válvulas de controle fixas em 100 %.",
        "fixos": {"actuatedValves": {"V1": 1.0, "V2": 1.0, "V3": 1.0, "V4": 1.0}},
        "malhas": [
            malha("FIC-103", vazao_soma("FT3", "FT6"), bomba("P3"), "Vazão total de B-103 (FT-101 + FT-102)", "L/min", 4.0, 0.0, 12.0, kp=0.05, ti=4.0),
            malha("FIC-105", vazao("FT4"), bomba("P1"), "Vazão de B-101 para TQ-101", "L/min", 1.5, 0.0, 6.0, kp=0.08, ti=4.0),
            malha("FIC-106", vazao("FT5"), bomba("P2"), "Vazão de B-102 para TQ-102", "L/min", 1.5, 0.0, 6.0, kp=0.08, ti=4.0),
        ],
    },
    "nivel": {
        "nome": "Nível",
        "descricao": "Níveis de TQ-101..TQ-104 pelas válvulas de controle (pareamento direto); bombas fixas em 100 %.",
        "fixos": {"pumps": {"P1": 1.0, "P2": 1.0, "P3": 1.0}},
        "malhas": [
            malha("LIC-101", nivel("H1"), valvula("V3"), "Nível de TQ-101 por LV-103", "cm", 9.0, 0.0, 25.0, kp=0.062, ti=33.0),
            malha("LIC-102", nivel("H2"), valvula("V4"), "Nível de TQ-102 por LV-104", "cm", 9.0, 0.0, 25.0, kp=0.062, ti=33.0),
            malha("LIC-103", nivel("H3"), valvula("V1"), "Nível de TQ-103 por LV-101", "cm", 12.0, 0.0, 25.0, kp=0.062, ti=33.0),
            malha("LIC-104", nivel("H4"), valvula("V2"), "Nível de TQ-104 por LV-102", "cm", 12.0, 0.0, 25.0, kp=0.062, ti=33.0),
        ],
    },
}

CENARIO_PADRAO = "nivel"


def obter_cenario(nome):
    """Cópia independente do cenário, para o runtime alterar SP/sintonia à vontade."""
    if nome not in CENARIOS:
        raise KeyError(f"Cenário desconhecido: {nome}")
    return copy.deepcopy(CENARIOS[nome])


def resumo_cenarios():
    return [
        {
            "id": nome,
            "nome": c["nome"],
            "descricao": c["descricao"],
            "malhas": [m["tag"] for m in c["malhas"]],
        }
        for nome, c in CENARIOS.items()
    ]
