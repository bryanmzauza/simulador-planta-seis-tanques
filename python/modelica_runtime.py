"""Modo MODELICA do backend: planta (FMU v13) + banco de controladores (FMU)
executados em tempo real (ou acelerado) e publicados no mesmo `state` que
os modos MOCK e HARDWARE usam.

Laço (chamado pelo server.py a cada 100 ms de relógio):
    para cada subpasso de 0,1 s de simulação (speed subpassos por chamada):
        PV  <- últimas saídas da planta
        MV  <- banco.passo(PV)
        atuadores <- MV das malhas em AUTO (as em MAN seguem o operador)
        planta.passo(0,1 s)
    state <- saídas da planta, malhas, alarmes, relógio

Comandos aceitos (além de pump/valve/manual_valve/relay dos outros modos):
    {"type": "scenario", "id": "nivel"}
    {"type": "loop", "id": "LIC-101", "sp": 9, "mode": "AUTO"|"MAN", "mv": 0.4,
                     "tuning": {"type": "PI"|"PID_ISA", "kp":..., "ti":..., "td":..., ...}}
    {"type": "xv", "id": "X1"|"X2", "tA": 3, "tB": 2}
    {"type": "sim", "running": true|false, "speed": 1|2|5|10, "reset": true,
                    "levels": {"H1": 0, ...}}   # níveis iniciais (cm) usados no reset
"""

import time

import cenarios
from controle import BancoControladores
from modelica_plant import PlantaModelica, VALVULAS_CONTROLE, VALVULAS_MANUAIS, VALVULAS_3VIAS, BOMBAS

PASSO_S = 0.1
VELOCIDADES = (0.25, 0.5, 1, 2, 5, 10)

# Limites de alarme de nível, em fração da altura útil
NIVEL_ALTO = 0.90
NIVEL_MUITO_ALTO = 0.99
NIVEL_BAIXO_SUCCAO_CM = 0.5


class RuntimeModelica:
    def __init__(self, state, cenario=cenarios.CENARIO_PADRAO):
        self.state = state
        self.planta = PlantaModelica()
        self.banco = BancoControladores()
        self.running = False
        self.speed = 1
        self.niveis_iniciais = {t: 0.0 for t in ("H1", "H2", "H3", "H4", "H5", "H6")}
        self.xv = {"X1": {"tA": 3.0, "tB": 2.0}, "X2": {"tA": 2.0, "tB": 3.0}}
        self.cenario_id = None
        self.cenario = None
        self.razao_tempo_real = 1.0
        self._cpu_por_tick = 0.0
        self.ultimo_erro = None

        self._preparar_estado_inicial()
        self.planta.iniciar(self.niveis_iniciais)
        self._aplicar_atuadores_na_planta()
        self.definir_cenario(cenario)
        self._publicar()

    # ------------------------------------------------------------- estado
    def _preparar_estado_inicial(self):
        s = self.state
        for p in s["pumps"].values():
            p["power"] = False
            p["command"] = 1.0
        s["mainValve"]["opening"] = 1.0
        # Válvulas de controle meio abertas: com tudo em MAN a água já circula
        for v in s["actuatedValves"].values():
            v["opening"] = 0.5
        for v in s["recycleValves"].values():
            v["opening"] = 1.0
        for v in s["manualValves"].values():
            v["opening"] = 1.0
        for sensor in s["levelSensors"].values():
            sensor.update(raw=None, status="available")
        for sensor in s["flowSensors"].values():
            sensor.update(raw=None, frequency=None, status="available")
        s["mode"] = "MODELICA"
        s["scenarios"] = cenarios.resumo_cenarios()
        s["loops"] = {}
        s["alarms"] = []
        for sid, opening in (("MV", 1.0),):
            self.planta.definir_valvula_manual(sid, opening)
        for sid, v in s["recycleValves"].items():
            self.planta.definir_valvula_manual(sid, v["opening"])
        for sid, v in s["manualValves"].items():
            self.planta.definir_valvula_manual(sid, v["opening"])

    def _aplicar_atuadores_na_planta(self):
        s = self.state
        for pid in BOMBAS:
            p = s["pumps"][pid]
            self.planta.definir_bomba(pid, bool(p["power"]), float(p["command"]))
        for vid in VALVULAS_CONTROLE:
            self.planta.definir_valvula_controle(vid, float(s["actuatedValves"][vid]["opening"]))
        for xid, t in self.xv.items():
            self.planta.definir_3vias(xid, t["tA"], t["tB"])

    # ----------------------------------------------------------- cenários
    def definir_cenario(self, cenario_id):
        cenario = cenarios.obter_cenario(cenario_id)
        s = self.state
        fixos = cenario.get("fixos", {})
        for pid, comando in fixos.get("pumps", {}).items():
            s["pumps"][pid]["power"] = True
            s["pumps"][pid]["command"] = float(comando)
        for vid, abertura in fixos.get("actuatedValves", {}).items():
            s["actuatedValves"][vid]["opening"] = float(abertura)
        # Cada atuador de malha parte do U bias da malha (MAN, sem salto ao ir para AUTO)
        for m in cenario["malhas"]:
            self._escrever_atuador(m["mv"], float(m["sintonia"]["u_bias"]))
        self._aplicar_atuadores_na_planta()

        mv_iniciais = {}
        for m in cenario["malhas"]:
            mv_iniciais[m["tag"]] = self._valor_atuador(m["mv"])
        self.banco.configurar(cenario["malhas"], mv_iniciais)
        self.cenario_id = cenario_id
        self.cenario = cenario
        s["scenario"] = cenario_id
        self._atualizar_pvs()
        self._publicar()
        return True

    def _pvs(self):
        return {tag: self._ler_pv(m.definicao["pv"]) for tag, m in self.banco.malhas.items()}

    def _atualizar_pvs(self):
        self.banco.atualizar_pvs(self._pvs())

    def _valor_atuador(self, mv):
        s = self.state
        if mv["tipo"] == "valvula":
            return float(s["actuatedValves"][mv["id"]]["opening"])
        if mv["tipo"] == "bomba":
            p = s["pumps"][mv["id"]]
            return float(p["command"]) if p["power"] else 0.0
        return 0.0

    def _ler_pv(self, pv):
        niveis = self.planta.niveis_cm()
        vazoes = self.planta.vazoes_l_min()
        if pv["tipo"] == "nivel":
            return niveis.get(pv["id"])
        if pv["tipo"] == "vazao":
            return vazoes.get(pv["id"])
        if pv["tipo"] == "vazao_soma":
            valores = [vazoes.get(i) for i in pv["ids"]]
            if any(v is None for v in valores):
                return None
            return sum(valores)
        return None

    # ---------------------------------------------------------------- laço
    def tick(self):
        """Avança a simulação o equivalente a 100 ms de relógio vezes a velocidade."""
        if not self.running:
            self._atualizar_pvs()
            self._publicar()
            return
        inicio = time.perf_counter()
        subpassos = max(1, int(round(self.speed)))
        passo = PASSO_S if self.speed >= 1 else PASSO_S * self.speed
        try:
            for _ in range(subpassos):
                mvs = self.banco.passo(self._pvs(), passo)
                self._aplicar_mvs(mvs)
                self.planta.passo(passo)
            self.ultimo_erro = None
        except RuntimeError as exc:
            self.ultimo_erro = str(exc)
            self.running = False
        self._cpu_por_tick = time.perf_counter() - inicio
        if self._cpu_por_tick > 0:
            self.razao_tempo_real = min(99.0, 0.1 / self._cpu_por_tick)
        self._publicar()

    def _aplicar_mvs(self, mvs):
        """MV das malhas em AUTO vão para os atuadores; em MAN o atuador segue a HMI
        (e o banco acompanha para a transferência ser sem salto)."""
        s = self.state
        for tag, mv in mvs.items():
            malha = self.banco.malhas[tag]
            alvo = malha.definicao["mv"]
            if malha.modo_efetivo() == "AUTO":
                if alvo["tipo"] == "valvula":
                    s["actuatedValves"][alvo["id"]]["opening"] = mv
                    self.planta.definir_valvula_controle(alvo["id"], mv)
                elif alvo["tipo"] == "bomba":
                    p = s["pumps"][alvo["id"]]
                    p["power"] = True
                    p["command"] = mv
                    self.planta.definir_bomba(alvo["id"], True, mv)
            else:
                valor = self._valor_atuador(alvo)
                if abs(valor - malha.mv_manual) > 1e-9:
                    self.banco.ajustar(tag, mv_manual=valor)

    # ------------------------------------------------------------ comandos
    def handle_command(self, message):
        tipo = message.get("type")
        s = self.state
        try:
            if tipo == "hello":
                return True

            if tipo == "pump":
                pid = message.get("id")
                if pid not in s["pumps"]:
                    return False
                malha = self.banco.malha_do_atuador("bomba", pid)
                if malha is not None and malha.modo_efetivo() == "AUTO":
                    return False            # em AUTO o controlador manda
                p = s["pumps"][pid]
                if "power" in message:
                    p["power"] = bool(message["power"])
                if "command" in message:
                    p["command"] = _clamp(float(message["command"]))
                self.planta.definir_bomba(pid, p["power"], p["command"])
                return True

            if tipo == "valve":
                vid = message.get("id")
                abertura = _clamp(float(message.get("opening", 0.0)))
                if vid == "MV":
                    s["mainValve"]["opening"] = abertura
                    self.planta.definir_valvula_manual("MV", abertura)
                    return True
                if vid in s["actuatedValves"]:
                    malha = self.banco.malha_do_atuador("valvula", vid)
                    if malha is not None and malha.modo_efetivo() == "AUTO":
                        return False
                    s["actuatedValves"][vid]["opening"] = abertura
                    self.planta.definir_valvula_controle(vid, abertura)
                    return True
                return False

            if tipo == "manual_valve":
                vid = message.get("id")
                abertura = _clamp(float(message.get("opening", 0.0)))
                if vid in s["recycleValves"]:
                    s["recycleValves"][vid]["opening"] = abertura
                elif vid in s["manualValves"]:
                    s["manualValves"][vid]["opening"] = abertura
                else:
                    return False
                self.planta.definir_valvula_manual(vid, abertura)
                return True

            if tipo == "relay":
                # No modelo as XV são temporizadas; fixar um relé = deixar só aquela porta.
                rid = message.get("id")
                if rid not in s["threeWayValves"]:
                    return False
                grupo = "X1" if rid.startswith("X1") else "X2"
                porta = rid[-1]
                if bool(message.get("state", False)):
                    if porta == "A":
                        self.xv[grupo] = {"tA": max(self.xv[grupo]["tA"], 1.0), "tB": 0.0}
                    else:
                        self.xv[grupo] = {"tA": 0.0, "tB": max(self.xv[grupo]["tB"], 1.0)}
                    self.planta.definir_3vias(grupo, self.xv[grupo]["tA"], self.xv[grupo]["tB"])
                return True

            if tipo == "xv":
                xid = message.get("id")
                if xid not in VALVULAS_3VIAS:
                    return False
                t_a = max(0.0, float(message.get("tA", self.xv[xid]["tA"])))
                t_b = max(0.0, float(message.get("tB", self.xv[xid]["tB"])))
                self.xv[xid] = {"tA": t_a, "tB": t_b}
                self.planta.definir_3vias(xid, t_a, t_b)
                return True

            if tipo == "scenario":
                return self.definir_cenario(str(message.get("id")))

            if tipo == "loop":
                sintonia = message.get("tuning")
                if isinstance(sintonia, dict):
                    sintonia = {("tipo" if k == "type" else k): v for k, v in sintonia.items()}
                ok = self.banco.ajustar(
                    str(message.get("id")),
                    sp=message.get("sp"),
                    modo=message.get("mode"),
                    mv_manual=message.get("mv"),
                    sintonia=sintonia,
                )
                if ok and message.get("mv") is not None:
                    malha = self.banco.malhas[str(message.get("id"))]
                    if malha.modo_efetivo() == "MAN":
                        self._escrever_atuador(malha.definicao["mv"], malha.mv_manual)
                return ok

            if tipo == "sim":
                if "speed" in message:
                    velocidade = float(message["speed"])
                    if velocidade in VELOCIDADES:
                        self.speed = velocidade
                if isinstance(message.get("levels"), dict):
                    for tid, valor in message["levels"].items():
                        if tid in self.niveis_iniciais and valor is not None:
                            self.niveis_iniciais[tid] = max(0.0, min(self.planta.altura_util_cm(), float(valor)))
                if message.get("reset"):
                    self.reset()
                if "running" in message:
                    self.running = bool(message["running"])
                return True

            return False
        except (TypeError, ValueError):
            return False
        finally:
            self._publicar()

    def _escrever_atuador(self, alvo, valor):
        s = self.state
        if alvo["tipo"] == "valvula":
            s["actuatedValves"][alvo["id"]]["opening"] = valor
            self.planta.definir_valvula_controle(alvo["id"], valor)
        elif alvo["tipo"] == "bomba":
            p = s["pumps"][alvo["id"]]
            p["power"] = valor > 0
            p["command"] = valor
            self.planta.definir_bomba(alvo["id"], p["power"], valor)

    def reset(self):
        self.running = False
        self.planta.iniciar(self.niveis_iniciais)
        self._aplicar_atuadores_na_planta()
        self.banco.reiniciar()
        self._atualizar_pvs()
        self.ultimo_erro = None

    # ------------------------------------------------------------ publicar
    def _publicar(self):
        s = self.state
        niveis = self.planta.niveis_cm()
        h_max = self.planta.altura_util_cm()
        sensores = self.planta.sensores_nivel()
        for i in range(1, 7):
            tid = f"H{i}"
            lid = f"LT{i}"
            h = niveis[tid]
            pct = max(0.0, min(100.0, h / h_max * 100.0)) if h_max > 0 else 0.0
            s["tanks"][tid].update(
                level=pct,
                height=h / 100.0,
                heightCm=h,
                volume=self.planta.volume_litros(h),
            )
            s["levelSensors"][lid].update(
                level=pct,
                heightCm=h,
                pressure=sensores[lid]["pressure"],
                voltage=sensores[lid]["voltage"],
                raw=None,
                status="available",
            )
        for fid, vazao in self.planta.vazoes_l_min().items():
            s["flowSensors"][fid].update(flow=vazao, raw=None, frequency=None, status="available")
        for rid, ligado in self.planta.reles().items():
            s["threeWayValves"][rid]["state"] = ligado

        trechos = self.planta.trechos_l_min()
        s["segments"] = trechos
        s["flows"] = _flows_legado(trechos)
        s["xv"] = {k: dict(v) for k, v in self.xv.items()}
        s["loops"] = self.banco.estado()
        s["scenario"] = self.cenario_id
        s["sim"] = {
            "t": self.planta.t,
            "running": self.running,
            "speed": self.speed,
            "realtimeRatio": self.razao_tempo_real,
            "cpuMs": self._cpu_por_tick * 1000.0,
            "initialLevels": dict(self.niveis_iniciais),
            "tankHeightCm": h_max,
            "error": self.ultimo_erro,
        }
        s["alarms"] = self._alarmes(niveis, h_max)

    def _alarmes(self, niveis, h_max):
        s = self.state
        alarmes = []
        for i in range(1, 7):
            tid = f"H{i}"
            h = niveis[tid]
            if h >= NIVEL_MUITO_ALTO * h_max:
                alarmes.append({"tag": f"LT{i}", "priority": 1, "text": "nível muito alto (transbordo)"})
            elif h >= NIVEL_ALTO * h_max:
                alarmes.append({"tag": f"LT{i}", "priority": 2, "text": "nível alto"})
        for pid, tid in (("P1", "H3"), ("P2", "H4")):
            p = s["pumps"][pid]
            if p["power"] and p["command"] > 0 and niveis[tid] < NIVEL_BAIXO_SUCCAO_CM:
                alarmes.append({"tag": pid, "priority": 3, "text": "bomba sem sucção (tanque vazio)"})
        for tag, m in self.banco.malhas.items():
            if m.qualidade != "good":
                alarmes.append({"tag": tag, "priority": 2, "text": "PV sem dado; malha em MAN"})
        if self.ultimo_erro:
            alarmes.append({"tag": "SIM", "priority": 1, "text": self.ultimo_erro})
        return alarmes


def _flows_legado(t):
    """Mapa de trechos no formato usado pelo MOCK/HARDWARE (L/min)."""
    return {
        "RES_P3": t["B103"], "P3_MV": t["B103"],
        "MV_V1": t["LV101"], "MV_V2": t["LV102"],
        "V1_X1A": t["XV101A"], "X1A_FT3": t["XV101A"], "FT3_H3": t["XV101A"],
        "V1_X1B": t["XV101B"], "X1B_FT2": t["XV101B"], "FT2_H6": t["XV101B"],
        "V2_X2A": t["XV102A"], "X2A_FT1": t["XV102A"], "FT1_H5": t["XV102A"],
        "V2_X2B": t["XV102B"], "X2B_FT6": t["XV102B"], "FT6_H4": t["XV102B"],
        "P1_V3": t["LV103"], "V3_FT4": t["LV103"], "FT4_H1": t["LV103"],
        "P2_V4": t["LV104"], "V4_FT5": t["LV104"], "FT5_H2": t["LV104"],
        "H5_HV3_IN": t["HV105"], "HV3_IN_H3": t["HV105"],
        "P1_RV1": t["HV107"], "RV1_H3": t["HV107"],
        "H3_HV3_P1": t["B101"], "HV3_P1_P1": t["B101"],
        "H6_HV4_IN": t["HV106"], "HV4_IN_H4": t["HV106"],
        "P2_RV2": t["HV108"], "RV2_H4": t["HV108"],
        "H4_HV4_P2": t["B102"], "HV4_P2_P2": t["B102"],
        "H1_HV1_DRAIN": t["HV101"], "HV1_DRAIN_RES": t["HV101"],
        "H2_HV2_DRAIN": t["HV102"], "HV2_DRAIN_RES": t["HV102"],
    }


def _clamp(valor, minimo=0.0, maximo=1.0):
    return max(minimo, min(maximo, valor))
