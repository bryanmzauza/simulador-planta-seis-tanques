"""Testes do modo MODELICA (planta + controladores em FMU).

Rodam só no ambiente com PyFMI e com as FMUs geradas (python/build_fmu.py);
fora dele são pulados, sem falhar.

    python -m unittest discover -s python -p test_modelica.py
"""

import os
import unittest

os.environ.setdefault("SIX_TANK_MODE", "MODELICA")

try:
    import pyfmi  # noqa: F401
    TEM_PYFMI = True
except ImportError:
    TEM_PYFMI = False

import cenarios
from modelica_plant import FMU_PLANTA
from controle import FMU_CONTROLE

TEM_FMUS = os.path.isfile(FMU_PLANTA) and os.path.isfile(FMU_CONTROLE)


def avancar(rt, segundos):
    """Avança a simulação em `segundos` de tempo simulado."""
    ticks = int(round(segundos / (0.1 * rt.speed)))
    for _ in range(ticks):
        rt.tick()


@unittest.skipUnless(TEM_PYFMI and TEM_FMUS, "PyFMI ou FMUs ausentes")
class RuntimeModelicaTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        import server
        from modelica_runtime import RuntimeModelica
        cls.server = server
        cls.state = server.state
        cls.rt = RuntimeModelica(server.state)

    def setUp(self):
        self.rt.handle_command({"type": "sim", "reset": True, "levels": {t: 0 for t in self.rt.niveis_iniciais}})
        self.rt.handle_command({"type": "scenario", "id": "nivel"})
        self.rt.handle_command({"type": "sim", "running": True, "speed": 10})

    def test_estado_publicado(self):
        s = self.state
        self.assertEqual(s["mode"], "MODELICA")
        self.assertEqual(s["scenario"], "nivel")
        self.assertEqual(set(s["loops"]), {"LIC-101", "LIC-102", "LIC-103", "LIC-104"})
        self.assertIn("sim", s)
        self.assertIn("segments", s)
        self.assertEqual(len(s["flows"]), 38)
        for tid in ("H1", "H6"):
            self.assertIn("heightCm", s["tanks"][tid])
        import json
        json.dumps(s)

    def test_malhas_comecam_em_manual(self):
        for malha in self.state["loops"].values():
            self.assertEqual(malha["mode"], "MAN")

    def test_rodar_sem_tocar_em_nada_move_os_niveis(self):
        # Caso relatado: Rodar logo após abrir a HMI e nenhum nível sair do zero.
        for nome in cenarios.CENARIOS:
            self.rt.handle_command({"type": "sim", "reset": True})
            self.rt.handle_command({"type": "scenario", "id": nome})
            self.rt.handle_command({"type": "sim", "running": True, "speed": 10})
            avancar(self.rt, 60)
            soma = sum(t["heightCm"] for t in self.state["tanks"].values())
            self.assertGreater(soma, 1.0, f"cenário {nome}: níveis parados")
            for malha in self.state["loops"].values():
                self.assertAlmostEqual(malha["mv"], malha["uBias"], places=3)

    def test_tempo_avanca_com_velocidade(self):
        t0 = self.state["sim"]["t"]
        avancar(self.rt, 20)
        self.assertAlmostEqual(self.state["sim"]["t"] - t0, 20.0, places=6)

    def test_pausa_congela(self):
        self.rt.handle_command({"type": "sim", "running": False})
        t0 = self.state["sim"]["t"]
        self.rt.tick()
        self.assertEqual(self.state["sim"]["t"], t0)

    def test_manual_atua_e_auto_recusa_comando_direto(self):
        # LV-103 fechada: a B-101 não tira água de TQ-103 e ele acumula
        self.assertTrue(self.rt.handle_command({"type": "valve", "id": "V3", "opening": 0.0}))
        self.assertTrue(self.rt.handle_command({"type": "valve", "id": "V1", "opening": 0.6}))
        self.assertEqual(self.state["actuatedValves"]["V1"]["opening"], 0.6)
        avancar(self.rt, 60)
        self.assertGreater(self.state["tanks"]["H3"]["heightCm"], 0.5)
        self.assertTrue(self.rt.handle_command({"type": "loop", "id": "LIC-103", "mode": "AUTO"}))
        self.assertFalse(self.rt.handle_command({"type": "valve", "id": "V1", "opening": 0.1}))

    def test_transferencia_sem_salto(self):
        self.rt.handle_command({"type": "valve", "id": "V1", "opening": 0.4})
        self.rt.handle_command({"type": "sim", "speed": 1})
        avancar(self.rt, 5)
        mv_antes = self.state["loops"]["LIC-103"]["mv"]
        self.assertAlmostEqual(mv_antes, 0.4, places=3)
        self.rt.handle_command({"type": "loop", "id": "LIC-103", "mode": "AUTO"})
        self.rt.tick()
        mv_depois = self.state["loops"]["LIC-103"]["mv"]
        self.assertLess(abs(mv_depois - mv_antes), 0.02)

    def test_malha_de_vazao_converge(self):
        self.rt.handle_command({"type": "scenario", "id": "vazao_valvula"})
        for tag in list(self.state["loops"]):
            self.rt.handle_command({"type": "loop", "id": tag, "mode": "AUTO"})
        self.rt.handle_command({"type": "loop", "id": "FIC-101", "sp": 2.5})
        avancar(self.rt, 120)
        malha = self.state["loops"]["FIC-101"]
        self.assertAlmostEqual(malha["pv"], 2.5, delta=0.1)
        # a PV da malha é lida no início do subpasso; o FT, no fim
        self.assertAlmostEqual(self.state["flowSensors"]["FT3"]["flow"], malha["pv"], delta=0.01)

    def test_pi_zera_td_e_sintonia_em_execucao(self):
        self.rt.handle_command({"type": "loop", "id": "LIC-101", "tuning": {"type": "PI", "td": 5, "kp": 0.2}})
        malha = self.state["loops"]["LIC-101"]
        self.assertEqual(malha["type"], "PI")
        self.assertEqual(malha["td"], 0.0)
        self.assertEqual(malha["kp"], 0.2)
        self.rt.handle_command({"type": "loop", "id": "LIC-101", "tuning": {"type": "PID_ISA", "td": 5}})
        self.assertEqual(self.state["loops"]["LIC-101"]["td"], 5.0)

    def test_sp_respeita_limites(self):
        self.rt.handle_command({"type": "loop", "id": "LIC-101", "sp": 99})
        self.assertEqual(self.state["loops"]["LIC-101"]["sp"], 25.0)
        self.rt.handle_command({"type": "loop", "id": "LIC-101", "sp": -3})
        self.assertEqual(self.state["loops"]["LIC-101"]["sp"], 0.0)

    def test_valvula_manual_nao_perde_nivel(self):
        self.rt.handle_command({"type": "valve", "id": "V1", "opening": 0.6})
        avancar(self.rt, 60)
        h = self.state["tanks"]["H3"]["heightCm"]
        self.assertTrue(self.rt.handle_command({"type": "manual_valve", "id": "HV3_P1", "opening": 0.4}))
        self.assertAlmostEqual(self.state["tanks"]["H3"]["heightCm"], h, places=3)
        self.assertEqual(self.state["manualValves"]["HV3_P1"]["opening"], 0.4)

    def test_xv_temporizada_alterna(self):
        self.rt.handle_command({"type": "xv", "id": "X1", "tA": 1, "tB": 1})
        self.rt.handle_command({"type": "sim", "speed": 1})
        estados = set()
        for _ in range(40):
            self.rt.tick()
            estados.add(self.state["threeWayValves"]["X1A"]["state"])
        self.assertEqual(estados, {True, False})
        self.assertNotEqual(self.state["threeWayValves"]["X1A"]["state"], self.state["threeWayValves"]["X1B"]["state"])

    def test_reset_volta_niveis_iniciais_e_manual(self):
        self.rt.handle_command({"type": "valve", "id": "V1", "opening": 0.6})
        self.rt.handle_command({"type": "loop", "id": "LIC-103", "mode": "AUTO"})
        avancar(self.rt, 30)
        self.rt.handle_command({"type": "sim", "reset": True, "levels": {"H1": 4.0}})
        self.assertFalse(self.state["sim"]["running"])
        self.assertAlmostEqual(self.state["tanks"]["H1"]["heightCm"], 4.0, places=6)
        self.assertEqual(self.state["sim"]["t"], 0.0)
        self.assertEqual(self.state["loops"]["LIC-103"]["mode"], "MAN")

    def test_cenario_vazao_bomba_usa_soma(self):
        self.rt.handle_command({"type": "scenario", "id": "vazao_bomba"})
        self.assertEqual(self.state["loops"]["FIC-103"]["pvSource"]["tipo"], "vazao_soma")
        for tag in list(self.state["loops"]):
            self.rt.handle_command({"type": "loop", "id": tag, "mode": "AUTO"})
        avancar(self.rt, 120)
        s = self.state
        self.assertAlmostEqual(s["loops"]["FIC-103"]["pv"], s["flowSensors"]["FT3"]["flow"] + s["flowSensors"]["FT6"]["flow"], delta=0.01)
        self.assertAlmostEqual(s["loops"]["FIC-103"]["pv"], 4.0, delta=0.2)

    def test_server_delegacao(self):
        from unittest.mock import patch
        with patch.object(self.server, "BACKEND_MODE", "MODELICA"), patch.object(self.server, "modelica_runtime", self.rt):
            self.assertTrue(self.server.handle_command({"type": "sim", "speed": 2}))
            self.assertEqual(self.state["sim"]["speed"], 2)
            self.assertFalse(self.server.handle_command({"type": "banana"}))


class CenariosTests(unittest.TestCase):
    def test_cenarios_bem_formados(self):
        for nome, c in cenarios.CENARIOS.items():
            tags = [m["tag"] for m in c["malhas"]]
            self.assertEqual(len(tags), len(set(tags)), nome)
            alvos = [(m["mv"]["tipo"], m["mv"]["id"]) for m in c["malhas"]]
            self.assertEqual(len(alvos), len(set(alvos)), f"{nome}: dois controladores no mesmo atuador")
            for m in c["malhas"]:
                self.assertLessEqual(m["sp_min"], m["sp"])
                self.assertLessEqual(m["sp"], m["sp_max"])

    def test_copia_independente(self):
        a = cenarios.obter_cenario("nivel")
        a["malhas"][0]["sp"] = 1234
        self.assertNotEqual(cenarios.CENARIOS["nivel"]["malhas"][0]["sp"], 1234)


if __name__ == "__main__":
    unittest.main()
