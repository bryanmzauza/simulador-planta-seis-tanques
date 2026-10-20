"""Banco de controladores PID_ISA / PI executado a partir da FMU
`SeisTanques_Controle.Banco` (modelica/modelo_6tanques_controle.mo).

O banco tem N posições. Cada malha de um cenário ocupa uma posição e é
identificada pela tag (FIC-101, LIC-103...). Quem decide de onde vem a PV
e para onde vai a MV é o runtime; aqui só entram números.

Regras:
- toda malha começa em MAN, com MV manual igual ao valor atual do atuador;
- PV ausente (None) força MAN com a última MV, qualidade "bad", e o modo
  pedido pelo operador é retomado quando a PV volta;
- PI é o PID_ISA com Td = 0.
"""

import os

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FMU_CONTROLE = os.path.join(RAIZ, "modelica", "build", "SeisTanques_Controle_Banco.fmu")

N_POSICOES = 8

CAMPOS_SINTONIA = {
    "kp": "Kp",
    "ti": "Ti",
    "td": "Td",
    "b": "b",
    "c": "c",
    "n": "N",
    "ftt": "FTt",
    "u_bias": "U_bias",
    "u_min": "Umin",
    "u_max": "Umax",
}


class Malha:
    def __init__(self, posicao, definicao, mv_inicial):
        self.posicao = posicao
        self.tag = definicao["tag"]
        self.definicao = definicao
        self.sp = float(definicao["sp"])
        self.modo = "MAN"                      # modo pedido pelo operador
        self.mv_manual = float(mv_inicial)
        self.sintonia = dict(definicao["sintonia"])
        if self.sintonia.get("tipo") == "PI":
            self.sintonia["td"] = 0.0
        self.acao = 1 if definicao.get("acao", 1) >= 0 else -1
        self.pv = None
        self.mv = float(mv_inicial)
        self.qualidade = "bad"
        self.parcelas = {"uop": self.mv, "e": 0.0, "up": 0.0, "ui": 0.0, "ud": 0.0}

    def modo_efetivo(self):
        return self.modo if self.qualidade == "good" else "MAN"


class BancoControladores:
    def __init__(self, caminho=FMU_CONTROLE, n=N_POSICOES, log_level=2):
        if not os.path.isfile(caminho):
            raise FileNotFoundError(
                f"FMU de controle não encontrada: {caminho}. Gere com python/build_fmu.py."
            )
        from pyfmi import load_fmu

        self.fmu = load_fmu(
            caminho,
            kind="CS",
            log_level=log_level,
            log_file_name=os.path.join(os.path.dirname(caminho), "controle_log.txt"),
        )
        self.n = n
        self.t = 0.0
        self.inicializada = False
        self.malhas = {}          # tag -> Malha

    # ---------------------------------------------------------------- ciclo
    def configurar(self, definicoes, mv_iniciais):
        """Monta o banco para um cenário. mv_iniciais: tag -> valor atual do atuador."""
        if len(definicoes) > self.n:
            raise ValueError(f"O banco tem {self.n} posições; o cenário pede {len(definicoes)}.")
        self.malhas = {}
        for posicao, definicao in enumerate(definicoes, start=1):
            tag = definicao["tag"]
            self.malhas[tag] = Malha(posicao, definicao, mv_iniciais.get(tag, 0.0))
        self._inicializar()

    def _inicializar(self):
        if self.inicializada:
            self.fmu.reset()
        self.fmu.setup_experiment(start_time=0.0)
        self.t = 0.0
        for i in range(1, self.n + 1):
            self._set(i, "SP", 0.0)
            self._set(i, "PV", 0.0)
            self._set(i, "modo", 0.0)
            self._set(i, "MV_manual", 0.0)
            self._set(i, "acao", 1.0)
            self._set(i, "Kp", 1.0)
            self._set(i, "Ti", 10.0)
            self._set(i, "Td", 0.0)
            self._set(i, "b", 1.0)
            self._set(i, "c", 0.0)
            self._set(i, "N", 10.0)
            self._set(i, "FTt", 2.0)
            self._set(i, "U_bias", 0.5)
            self._set(i, "Umin", 0.0)
            self._set(i, "Umax", 1.0)
        for malha in self.malhas.values():
            self._escrever_malha(malha)
        self.fmu.initialize()
        self.inicializada = True

    def reiniciar(self):
        """Volta todas as malhas para MAN com a MV atual e zera as integrais."""
        for malha in self.malhas.values():
            malha.modo = "MAN"
            malha.mv_manual = malha.mv
        self._inicializar()

    def atualizar_pvs(self, pvs):
        """Atualiza PV e qualidade sem avançar o banco (simulação parada, troca de cenário, reset)."""
        for malha in self.malhas.values():
            pv = pvs.get(malha.tag)
            if pv is None:
                if malha.qualidade == "good":
                    malha.mv_manual = malha.mv
                malha.qualidade = "bad"
                malha.pv = None
            else:
                malha.qualidade = "good"
                malha.pv = float(pv)
            if self.inicializada:
                self._escrever_malha(malha)

    def passo(self, pvs, dt):
        """pvs: tag -> valor da PV (None = ausente). Avança o banco em dt segundos."""
        if not self.inicializada:
            return {}
        for malha in self.malhas.values():
            pv = pvs.get(malha.tag)
            if pv is None:
                if malha.qualidade == "good":
                    malha.mv_manual = malha.mv      # congela na última saída
                malha.qualidade = "bad"
                malha.pv = None
            else:
                malha.qualidade = "good"
                malha.pv = float(pv)
            self._escrever_malha(malha)
        status = self.fmu.do_step(self.t, dt, True)
        if status != 0:
            raise RuntimeError(f"A FMU de controle falhou no passo em t = {self.t:.2f} s (status {status}).")
        self.t += dt
        self._ler_saidas()
        return {tag: m.mv for tag, m in self.malhas.items()}

    # ------------------------------------------------------------ operador
    def ajustar(self, tag, sp=None, modo=None, mv_manual=None, sintonia=None):
        malha = self.malhas.get(tag)
        if malha is None:
            return False
        if sp is not None:
            sp_min = malha.definicao.get("sp_min")
            sp_max = malha.definicao.get("sp_max")
            sp = float(sp)
            if sp_min is not None:
                sp = max(float(sp_min), sp)
            if sp_max is not None:
                sp = min(float(sp_max), sp)
            malha.sp = sp
        if modo is not None:
            modo = str(modo).upper()
            if modo not in ("AUTO", "MAN"):
                return False
            if modo == "MAN" and malha.modo != "MAN":
                malha.mv_manual = malha.mv          # MAN parte da MV atual
            malha.modo = modo
        if mv_manual is not None:
            malha.mv_manual = max(malha.sintonia["u_min"], min(malha.sintonia["u_max"], float(mv_manual)))
        if sintonia:
            for chave, valor in sintonia.items():
                if chave == "tipo":
                    if valor in ("PID_ISA", "PI"):
                        malha.sintonia["tipo"] = valor
                        if valor == "PI":
                            malha.sintonia["td"] = 0.0
                elif chave in CAMPOS_SINTONIA and valor is not None:
                    valor = float(valor)
                    if chave in ("kp",) and valor < 0:
                        valor = 0.0
                    if chave in ("ti", "td", "n") and valor < 0:
                        valor = 0.0
                    malha.sintonia[chave] = valor
            if malha.sintonia.get("tipo") == "PI":
                malha.sintonia["td"] = 0.0
            if malha.sintonia["u_max"] < malha.sintonia["u_min"]:
                malha.sintonia["u_max"] = malha.sintonia["u_min"]
        if self.inicializada:
            self._escrever_malha(malha)
        return True

    def malha_do_atuador(self, tipo, id_atuador):
        for malha in self.malhas.values():
            mv = malha.definicao["mv"]
            if mv["tipo"] == tipo and mv["id"] == id_atuador:
                return malha
        return None

    # --------------------------------------------------------------- estado
    def estado(self):
        saida = {}
        for tag, m in self.malhas.items():
            saida[tag] = {
                "tag": tag,
                "descricao": m.definicao["descricao"],
                "pv": m.pv,
                "sp": m.sp,
                "mv": m.mv,
                "mode": m.modo,
                "effectiveMode": m.modo_efetivo(),
                "quality": m.qualidade,
                "unit": m.definicao["unidade"],
                "spMin": m.definicao.get("sp_min"),
                "spMax": m.definicao.get("sp_max"),
                "action": "direct" if m.acao > 0 else "reverse",
                "pvSource": m.definicao["pv"],
                "mvTarget": m.definicao["mv"],
                "type": m.sintonia.get("tipo", "PID_ISA"),
                "kp": m.sintonia["kp"],
                "ti": m.sintonia["ti"],
                "td": m.sintonia["td"],
                "b": m.sintonia["b"],
                "c": m.sintonia["c"],
                "n": m.sintonia["n"],
                "ftt": m.sintonia["ftt"],
                "uBias": m.sintonia["u_bias"],
                "uMin": m.sintonia["u_min"],
                "uMax": m.sintonia["u_max"],
                "terms": dict(m.parcelas),
            }
        return saida

    # ------------------------------------------------------------- interno
    def _set(self, i, nome, valor):
        self.fmu.set(f"{nome}[{i}]", float(valor))

    def _escrever_malha(self, m):
        i = m.posicao
        self._set(i, "SP", m.sp)
        self._set(i, "PV", m.pv if m.pv is not None else m.sp)
        self._set(i, "modo", 1.0 if m.modo_efetivo() == "AUTO" else 0.0)
        self._set(i, "MV_manual", m.mv_manual)
        self._set(i, "acao", float(m.acao))
        for chave, nome in CAMPOS_SINTONIA.items():
            self._set(i, nome, m.sintonia[chave])

    def _ler_saidas(self):
        if not self.malhas:
            return
        nomes = []
        for m in self.malhas.values():
            i = m.posicao
            nomes += [f"MV[{i}]", f"Uop[{i}]", f"e[{i}]", f"Up[{i}]", f"Ui[{i}]", f"Ud[{i}]"]
        valores = [float(v.item() if hasattr(v, "item") else v) for v in self.fmu.get(nomes)]
        for k, m in enumerate(self.malhas.values()):
            mv, uop, e, up, ui, ud = valores[6 * k: 6 * k + 6]
            m.mv = mv
            m.parcelas = {"uop": uop, "e": e, "up": up, "ui": ui, "ud": ud}
