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


def malha(tag, pv, mv, descricao, unidade, sp, sp_min, sp_max, acao=1, modo_inicial="AUTO", **sintonia):
    base = copy.deepcopy(SINTONIA_PADRAO)
    base.update(sintonia)
    return {
        "tag": tag,
        "modo_inicial": modo_inicial,   # modo ao carregar o cenário e no reset
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


# ESTIMATIVAS DE OPERAÇÃO DA PLANTA
# Aplicadas por cima dos padrões da FMU (modelo v13) ao iniciar o modo
# MODELICA. NÃO são medições: existem só para a simulação ter um ponto de
# operação utilizável enquanto a bancada não é caracterizada. Trocar pelos
# valores medidos (ensaio de esvaziamento e abertura real das HV) quando houver.
#
# CV_HV: condutância da válvula manual toda aberta (cm³/s por raiz de cm.c.a.).
# No v13 o padrão é 1000 ("perda desprezível"); com isso a abertura da HV
# não tem efeito acima de ~2 % e as descargas (mangueira de 10 mm, Cd 0,6)
# escoam ~66 cm³/s com 10 cm de coluna, quase toda a vazão da B-103: os
# tanques não passam de 4 cm. Com 10 (cerca de metade da condutância da
# mangueira) TQ-101/102 ficam em ~15 cm com as válvulas a 50 %.
PARAMETROS_PLANTA = {f"CV_HV10{i}": 10.0 for i in range(1, 10)}

# Aberturas de operação das válvulas manuais (o operador ajusta na bancada).
# HV-101/102 sempre abertas, como na bancada; HV-105/106 parcialmente
# fechadas para TQ-105/106 segurarem nível; recirculações a 30 %.
VALVULAS_MANUAIS_OPERACAO = {
    "MV": 1.0,          # HV-109, descarga de B-103
    "HV1_DRAIN": 1.0,   # HV-101
    "HV2_DRAIN": 1.0,   # HV-102
    "HV3_P1": 1.0,      # HV-103, sucção de B-101
    "HV4_P2": 1.0,      # HV-104, sucção de B-102
    "HV3_IN": 0.4,      # HV-105, TQ-105 -> TQ-103
    "HV4_IN": 0.4,      # HV-106, TQ-106 -> TQ-104
    "RV1": 0.3,         # HV-107, recirculação de B-101
    "RV2": 0.3,         # HV-108, recirculação de B-102
}

# SINTONIAS (SIMC, PI) a partir de degraus em malha aberta no ponto de operação,
# com as outras malhas em AUTO (modelo + PARAMETROS_PLANTA acima):
#   LIC-101/102 por LV-103/104: K = 63 cm, tau = 70 s, sem atraso; tau_c = 20 s
#   LIC-103/104 por LV-101/102: integrador, 0,33 cm/s, atraso 2 s; tau_c = 20 s
#   LIC-103/104 por LV-103/104: integrador, -0,72 cm/s; tau_c = 20 s
#   LIC-103/104 por B-101/102:  integrador, -0,48 cm/s; tau_c = 20 s
#   FIC-101/102 por LV-101/102: estático, 3,6 L/min; FIC-103 por B-103: 4,2 L/min
# Nível: b = 0,6 (peso do SP; tira o sobressinal do degrau de SP) e FTt = 10
# (anti-windup mais rápido na partida com os tanques vazios). As vazões do
# dente de serra das XV (3 s / 2 s) aparecem como ±0,3 cm em TQ-103/104.
NIVEL = {"b": 0.6, "ftt": 10.0}

# TQ-103 e TQ-104 não têm descarga por gravidade (só as bombas os esvaziam):
# são integradores e só ficam estáveis com uma malha de nível. Por isso os
# dois cenários de vazão também seguram o nível deles, pelo atuador de saída.

CENARIOS = {
    "nivel": {
        "nome": "Nível",
        "descricao": "Níveis de TQ-101..TQ-104 pelas válvulas de controle (pareamento direto); bombas fixas em 100 %.",
        "fixos": {
            "pumps": {"P1": 1.0, "P2": 1.0, "P3": 1.0},
            "valvulas_manuais": VALVULAS_MANUAIS_OPERACAO,
        },
        "malhas": [
            malha("LIC-101", nivel("H1"), valvula("V3"), "Nível de TQ-101 por LV-103", "cm", 12.0, 0.0, 25.0, kp=0.056, ti=70.0, **NIVEL),
            malha("LIC-102", nivel("H2"), valvula("V4"), "Nível de TQ-102 por LV-104", "cm", 12.0, 0.0, 25.0, kp=0.056, ti=70.0, **NIVEL),
            malha("LIC-103", nivel("H3"), valvula("V1"), "Nível de TQ-103 por LV-101", "cm", 10.0, 0.0, 25.0, kp=0.138, ti=88.0, **NIVEL),
            malha("LIC-104", nivel("H4"), valvula("V2"), "Nível de TQ-104 por LV-102", "cm", 10.0, 0.0, 25.0, kp=0.138, ti=88.0, **NIVEL),
        ],
    },
    "vazao_valvula": {
        "nome": "Vazão por válvula",
        "descricao": "Vazões de alimentação pelas LV-101/102; TQ-103/104 seguram nível pelas LV-103/104. Bombas fixas em 100 %.",
        "fixos": {
            "pumps": {"P1": 1.0, "P2": 1.0, "P3": 1.0},
            "valvulas_manuais": VALVULAS_MANUAIS_OPERACAO,
        },
        "malhas": [
            malha("FIC-101", vazao("FT3"), valvula("V1"), "Vazão antes de LV-101", "L/min", 1.6, 0.0, 6.0, kp=0.12, ti=1.5),
            malha("FIC-102", vazao("FT6"), valvula("V2"), "Vazão antes de LV-102", "L/min", 1.6, 0.0, 6.0, kp=0.12, ti=1.5),
            malha("LIC-103", nivel("H3"), valvula("V3"), "Nível de TQ-103 por LV-103", "cm", 10.0, 0.0, 25.0, acao=-1, kp=0.069, ti=80.0, **NIVEL),
            malha("LIC-104", nivel("H4"), valvula("V4"), "Nível de TQ-104 por LV-104", "cm", 10.0, 0.0, 25.0, acao=-1, kp=0.069, ti=80.0, **NIVEL),
        ],
    },
    "vazao_bomba": {
        "nome": "Vazão por bomba",
        "descricao": "Vazão total de alimentação pela B-103; TQ-103/104 seguram nível pelas B-101/102. Válvulas de controle fixas em 100 %.",
        "fixos": {
            "actuatedValves": {"V1": 1.0, "V2": 1.0, "V3": 1.0, "V4": 1.0},
            "valvulas_manuais": VALVULAS_MANUAIS_OPERACAO,
        },
        "malhas": [
            malha("FIC-103", vazao_soma("FT3", "FT6"), bomba("P3"), "Vazão total de B-103 (FT-101 + FT-102)", "L/min", 3.0, 0.0, 12.0, kp=0.1, ti=2.0),
            malha("LIC-103", nivel("H3"), bomba("P1"), "Nível de TQ-103 por B-101", "cm", 10.0, 0.0, 25.0, acao=-1, kp=0.104, ti=80.0, **NIVEL),
            malha("LIC-104", nivel("H4"), bomba("P2"), "Nível de TQ-104 por B-102", "cm", 10.0, 0.0, 25.0, acao=-1, kp=0.104, ti=80.0, **NIVEL),
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
