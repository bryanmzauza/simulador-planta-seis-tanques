"""Planta de seis tanques executada a partir da FMU do modelo Modelica v13.

Envolve a FMU de co-simulação `SeisTanques_v13.SixTanks` (gerada por
python/build_fmu.py) com PyFMI. Faz a tradução entre os IDs internos do
código (P1..P3, V1..V4, H1..H6, FT1..FT6, X1A..X2B, HV*) e os nomes das
variáveis do modelo (pwm_B101, abertura_LV101, h_TQ101, FT101...).

Unidades: a FMU trabalha em cm, cm³/s e s. Aqui as vazões saem em L/min
e os níveis em cm (a conversão para % e m fica no runtime).
"""

import math
import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FMU_PLANTA = os.path.join(RAIZ, "modelica", "build", "SeisTanques_v13_SixTanks.fmu")

CM3_S_PARA_L_MIN = 0.06

# Bombas: ID do código -> entrada da FMU
BOMBAS = {"P1": "pwm_B101", "P2": "pwm_B102", "P3": "pwm_B103"}

# Válvulas de controle (servos): ID do código -> entrada da FMU
VALVULAS_CONTROLE = {
    "V1": "abertura_LV101",
    "V2": "abertura_LV102",
    "V3": "abertura_LV103",
    "V4": "abertura_LV104",
}

# Válvulas manuais de regulagem: são parâmetros da FMU (só mudam com
# reinicialização, feita com os níveis atuais para não perder o estado).
VALVULAS_MANUAIS = {
    "MV": "abertura_HV109",         # descarga de B-103 (VMC na HMI)
    "RV1": "abertura_HV107",        # recirculação de B-101
    "RV2": "abertura_HV108",        # recirculação de B-102
    "HV3_IN": "abertura_HV105",     # TQ-105 -> TQ-103
    "HV4_IN": "abertura_HV106",     # TQ-106 -> TQ-104
    "HV3_P1": "abertura_HV103",     # sucção de B-101
    "HV4_P2": "abertura_HV104",     # sucção de B-102
    "HV1_DRAIN": "abertura_HV101",  # TQ-101 -> reservatório
    "HV2_DRAIN": "abertura_HV102",  # TQ-102 -> reservatório
}

# Válvulas de 3 vias temporizadas: ID -> (entrada tA, entrada tB)
VALVULAS_3VIAS = {
    "X1": ("tA_XV101", "tB_XV101"),
    "X2": ("tA_XV102", "tB_XV102"),
}

# Tanques: ID do código -> (estado da FMU, saída de nível)
TANQUES = {
    "H1": ("h1", "h_TQ101"),
    "H2": ("h2", "h_TQ102"),
    "H3": ("h3", "h_TQ103"),
    "H4": ("h4", "h_TQ104"),
    "H5": ("h5", "h_TQ105"),
    "H6": ("h6", "h_TQ106"),
}

# Sensores de vazão: ID do código -> saída da FMU (L/min, como o YF-S401 lê)
SENSORES_VAZAO = {
    "FT1": "FT103",   # XV-102 porta A -> TQ-105
    "FT2": "FT104",   # XV-101 porta B -> TQ-106
    "FT3": "FT101",   # antes de LV-101
    "FT4": "FT105",   # LV-103 -> TQ-101
    "FT5": "FT106",   # LV-104 -> TQ-102
    "FT6": "FT102",   # antes de LV-102
}

# Sensores de nível: ID do código -> (saída em kPa, saída em V)
SENSORES_NIVEL = {
    f"LT{i}": (f"LT10{i}", f"LT10{i}_V") for i in range(1, 7)
}

# Relés das solenoides: ID do código -> saída booleana da FMU
RELES = {"X1A": "XY101A", "X1B": "XY101B", "X2A": "XY102A", "X2B": "XY102B"}

# Vazões internas (cm³/s) usadas na animação, por trecho do P&ID
TRECHOS = {
    "B103": "F_B103",
    "LV101": "F_LV101",
    "LV102": "F_LV102",
    "XV101A": "F_XV101A",
    "XV101B": "F_XV101B",
    "XV102A": "F_XV102A",
    "XV102B": "F_XV102B",
    "HV105": "q_TQ105",
    "HV106": "q_TQ106",
    "B101": "F_B101",
    "B102": "F_B102",
    "LV103": "F_LV103",
    "LV104": "F_LV104",
    "HV107": "F_HV107",
    "HV108": "F_HV108",
    "HV101": "q_TQ101",
    "HV102": "q_TQ102",
}

PARAMETROS_PERFIL = ("h_perfil", "d_perfil", "h_max")


class PlantaModelica:
    """Uma instância da FMU da planta, com passo fixo e entradas por ID do código."""

    def __init__(self, caminho=FMU_PLANTA, log_level=2):
        if not os.path.isfile(caminho):
            raise FileNotFoundError(
                f"FMU da planta não encontrada: {caminho}. Gere com python/build_fmu.py."
            )
        from pyfmi import load_fmu

        self.caminho = caminho
        self.fmu = load_fmu(
            caminho,
            kind="CS",
            log_level=log_level,
            log_file_name=os.path.join(os.path.dirname(caminho), "planta_log.txt"),
        )
        self.t = 0.0
        self.inicializada = False

        # Parâmetros atuais (os que a HMI pode alterar); None = padrão da FMU
        self.parametros = {nome: None for nome in VALVULAS_MANUAIS.values()}

        # Últimas entradas aplicadas (para reaplicar após reinicialização)
        self.entradas = {nome: 0.0 for nome in BOMBAS.values()}
        self.entradas.update({nome: 0.0 for nome in VALVULAS_CONTROLE.values()})
        self.entradas.update({"tA_XV101": 3.0, "tB_XV101": 2.0, "tA_XV102": 2.0, "tB_XV102": 3.0})

        self._perfil = None
        self._saidas = {}

    # ---------------------------------------------------------------- ciclo
    def iniciar(self, niveis_cm=None, t0=0.0):
        """(Re)inicializa a FMU com os níveis dados (cm) e os parâmetros atuais."""
        if self.inicializada:
            self.fmu.reset()
        self.fmu.setup_experiment(start_time=t0)
        for tanque, (estado, _) in TANQUES.items():
            h = 0.0
            if niveis_cm and niveis_cm.get(tanque) is not None:
                h = max(0.0, float(niveis_cm[tanque]))
            self.fmu.set(estado, h)
        for nome, valor in self.parametros.items():
            if valor is not None:
                self.fmu.set(nome, float(valor))
        for nome, valor in self.entradas.items():
            self.fmu.set(nome, float(valor))
        self.fmu.initialize()
        self.inicializada = True
        self.t = t0
        self._perfil = None
        self._ler_saidas()

    def reiniciar_mantendo_niveis(self):
        """Reaplica parâmetros (válvulas manuais) sem perder os níveis atuais."""
        niveis = self.niveis_cm()
        self.iniciar(niveis, t0=self.t)

    def passo(self, dt):
        status = self.fmu.do_step(self.t, dt, True)
        if status != 0:
            raise RuntimeError(f"A FMU da planta falhou no passo em t = {self.t:.2f} s (status {status}).")
        self.t += dt
        self._ler_saidas()

    # ------------------------------------------------------------- entradas
    def definir_bomba(self, bomba, ligada, comando):
        self.entradas[BOMBAS[bomba]] = _clamp(float(comando)) if ligada else 0.0
        self._aplicar(BOMBAS[bomba])

    def definir_valvula_controle(self, valvula, abertura):
        self.entradas[VALVULAS_CONTROLE[valvula]] = _clamp(float(abertura))
        self._aplicar(VALVULAS_CONTROLE[valvula])

    def definir_3vias(self, valvula, t_a, t_b):
        nome_a, nome_b = VALVULAS_3VIAS[valvula]
        self.entradas[nome_a] = max(0.0, float(t_a))
        self.entradas[nome_b] = max(0.0, float(t_b))
        self._aplicar(nome_a)
        self._aplicar(nome_b)

    def definir_valvula_manual(self, valvula, abertura):
        """Parâmetro da FMU: exige reinicialização (mantendo os níveis)."""
        nome = VALVULAS_MANUAIS[valvula]
        novo = _clamp(float(abertura))
        if self.parametros.get(nome) == novo:
            return
        self.parametros[nome] = novo
        if self.inicializada:
            self.reiniciar_mantendo_niveis()

    def _aplicar(self, nome):
        if self.inicializada:
            self.fmu.set(nome, float(self.entradas[nome]))

    # --------------------------------------------------------------- saídas
    def _ler_saidas(self):
        nomes = (
            [s for _, s in TANQUES.values()]
            + list(SENSORES_VAZAO.values())
            + [n for par in SENSORES_NIVEL.values() for n in par]
            + list(RELES.values())
            + list(TRECHOS.values())
        )
        valores = self.fmu.get(nomes)
        self._saidas = {nome: _escalar(valor) for nome, valor in zip(nomes, valores)}

    def niveis_cm(self):
        return {t: max(0.0, float(self._saidas[s])) for t, (_, s) in TANQUES.items()}

    def vazoes_l_min(self):
        return {ft: float(self._saidas[s]) for ft, s in SENSORES_VAZAO.items()}

    def sensores_nivel(self):
        return {
            lt: {"pressure": float(self._saidas[kpa]), "voltage": float(self._saidas[volt])}
            for lt, (kpa, volt) in SENSORES_NIVEL.items()
        }

    def reles(self):
        return {r: bool(self._saidas[s]) for r, s in RELES.items()}

    def trechos_l_min(self):
        return {t: max(0.0, float(self._saidas[s])) * CM3_S_PARA_L_MIN for t, s in TRECHOS.items()}

    # ----------------------------------------------------------- geometria
    def perfil(self):
        """(h_tab, d_tab, h_max) da garrafa, lidos da FMU."""
        if self._perfil is None:
            h_tab = [_escalar(v) for v in self.fmu.get([f"h_perfil[{i}]" for i in range(1, 5)])]
            d_tab = [_escalar(v) for v in self.fmu.get([f"d_perfil[{i}]" for i in range(1, 5)])]
            h_max = _escalar(self.fmu.get("h_max"))
            self._perfil = (h_tab, d_tab, h_max)
        return self._perfil

    def altura_util_cm(self):
        return self.perfil()[2]

    def volume_litros(self, h_cm):
        """Volume até o nível h integrando a área da seção da garrafa."""
        h_tab, d_tab, _ = self.perfil()
        h_cm = max(0.0, float(h_cm))
        n = max(1, int(math.ceil(h_cm / 0.1)))
        passo = h_cm / n
        total = 0.0
        for k in range(n):
            a = _area(h_tab, d_tab, k * passo)
            b = _area(h_tab, d_tab, (k + 1) * passo)
            total += 0.5 * (a + b) * passo
        return total / 1000.0


def _clamp(valor, minimo=0.0, maximo=1.0):
    return max(minimo, min(maximo, valor))


def _escalar(valor):
    """PyFMI devolve arrays de um elemento; aqui vira float/bool do Python."""
    try:
        return valor.item()
    except AttributeError:
        return valor


def _area(h_tab, d_tab, h):
    if h <= h_tab[0]:
        d = d_tab[0]
    elif h >= h_tab[-1]:
        d = d_tab[-1]
    else:
        d = d_tab[-1]
        for i in range(len(h_tab) - 1):
            if h <= h_tab[i + 1]:
                d = d_tab[i] + (d_tab[i + 1] - d_tab[i]) * (h - h_tab[i]) / (h_tab[i + 1] - h_tab[i])
                break
    return math.pi * d * d / 4.0
