import asyncio
import json
import math
import os
import time

import websockets

from serial_bridge import SerialBridge
from hardware_config import ADC_MAX, ADC_REFERENCE_V, LT_CALIBRATION, FT_ANALOG_CALIBRATION, TELEMETRY_TIMEOUT_S
from hardware_config import LT_PRESSURE_CALIBRATION, WATER_DENSITY_KG_M3, GRAVITY_M_S2
last_telemetry_time = None


# ============================================================
# CONFIGURAÇÃO DO SERVIDOR
# ============================================================

HOST = "localhost"
PORT = int(os.getenv("SIX_TANK_WS_PORT", "8765"))

# O modo padrao continua sendo MOCK, portanto o projeto funciona
# exatamente como antes mesmo sem Arduino conectado.
#
# Para usar o Mega futuramente, no PowerShell:
#   $env:SIX_TANK_MODE="HARDWARE"
#   $env:SIX_TANK_SERIAL_PORT="COM5"
#   python python\server.py
BACKEND_MODE = os.getenv(
    "SIX_TANK_MODE",
    "MOCK"
).strip().upper()

SERIAL_PORT = os.getenv(
    "SIX_TANK_SERIAL_PORT",
    "COM3"
).strip()

SERIAL_BAUD = int(
    os.getenv(
        "SIX_TANK_SERIAL_BAUD",
        "115200"
    )
)

if BACKEND_MODE not in {
    "MOCK",
    "HARDWARE",
    "MODELICA"
}:
    raise ValueError(
        "SIX_TANK_MODE deve ser MOCK, HARDWARE ou MODELICA."
    )

# Runtime do modo MODELICA (planta + controladores em FMU), criado em main().
modelica_runtime = None

clients = set()
serial_bridge = None
last_synced_serial_connection_id = 0


# ============================================================
# PARÂMETROS DO MOCK DA PLANTA
#
# IMPORTANTE:
# estes valores NÃO são ainda os parâmetros calibrados da
# bancada real.
#
# Servem apenas para fazer o backend reagir de forma coerente
# aos comandos enviados pela HMI.
# ============================================================

TANK_CAPACITY_L = 2.0

TANK_MAX_HEIGHT_M = 0.45

# Vazão máxima aproximada usada no mock.

P3_MAX_FLOW_L_MIN = 3.0

P1_MAX_FLOW_L_MIN = 2.0

P2_MAX_FLOW_L_MIN = 2.0


# Vazão gravitacional máxima H5 -> H3 e H6 -> H4.

GRAVITY_MAX_FLOW_L_MIN = 0.70


# Vazão máxima de descarga de H1 e H2.

DRAIN_MAX_FLOW_L_MIN = 0.55


# ============================================================
# ESTADO DA "PLANTA REAL" SIMULADA
# ============================================================

state = {

    "tanks": {

        "H1": {
            "level": 20.0,
            "height": 0.0,
            "volume": 0.0
        },

        "H2": {
            "level": 25.0,
            "height": 0.0,
            "volume": 0.0
        },

        "H3": {
            "level": 30.0,
            "height": 0.0,
            "volume": 0.0
        },

        "H4": {
            "level": 35.0,
            "height": 0.0,
            "volume": 0.0
        },

        "H5": {
            "level": 40.0,
            "height": 0.0,
            "volume": 0.0
        },

        "H6": {
            "level": 45.0,
            "height": 0.0,
            "volume": 0.0
        },
    },

    "levelSensors": {

        "LT1": {
            "level": 20.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },

        "LT2": {
            "level": 25.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },

        "LT3": {
            "level": 30.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },

        "LT4": {
            "level": 35.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },

        "LT5": {
            "level": 40.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },

        "LT6": {
            "level": 45.0,
            "pressure": 0.0,
            "voltage": 0.0,
            "raw": 0
        },
    },

    "flowSensors": {

        "FT1": {
            "flow": 0.0
        },

        "FT2": {
            "flow": 0.0
        },

        "FT3": {
            "flow": 0.0
        },

        "FT4": {
            "flow": 0.0
        },

        "FT5": {
            "flow": 0.0
        },

        "FT6": {
            "flow": 0.0
        },
    },

    "pumps": {

        "P1": {
            "power": False,
            "command": 1.0
        },

        "P2": {
            "power": False,
            "command": 1.0
        },

        "P3": {
            "power": False,
            "command": 1.0
        },
    },

    "mainValve": {

        "opening": 1.0
    },

    "actuatedValves": {

        "V1": {
            "opening": 1.0
        },

        "V2": {
            "opening": 1.0
        },

        "V3": {
            "opening": 1.0
        },

        "V4": {
            "opening": 1.0
        },
    },

    "recycleValves": {

        "RV1": {
            "opening": 1.0
        },

        "RV2": {
            "opening": 1.0
        },
    },

    "manualValves": {

        "HV3_IN": {
            "opening": 1.0
        },

        "HV4_IN": {
            "opening": 1.0
        },

        "HV3_P1": {
            "opening": 1.0
        },

        "HV4_P2": {
            "opening": 1.0
        },

        "HV1_DRAIN": {
            "opening": 1.0
        },

        "HV2_DRAIN": {
            "opening": 1.0
        },
    },

    "threeWayValves": {

        "X1A": {
            "state": False
        },

        "X1B": {
            "state": False
        },

        "X2A": {
            "state": False
        },

        "X2B": {
            "state": False
        },
    },

    # Vazões por trecho usadas apenas para animação/diagnóstico da HMI.
    "flows": {},

    # Modo do backend, para a HMI saber se pode atuar (MOCK/MODELICA)
    # ou se é só leitura (HARDWARE).
    "mode": BACKEND_MODE,
}


# ============================================================
# AUXILIARES
# ============================================================

def clamp(
    value,
    minimum=0.0,
    maximum=1.0
):

    return max(
        minimum,
        min(
            maximum,
            value
        )
    )


def clamp_level(
    level
):

    return max(
        0.0,
        min(
            100.0,
            level
        )
    )


async def send_json(
    websocket,
    data
):

    await websocket.send(
        json.dumps(
            data
        )
    )


# ============================================================
# DIVISÃO DE VAZÃO
#
# Exemplo:
#
# V1 = 100 %
# V2 = 100 %
#
# a vazão da P3 é dividida 50 / 50.
#
# V1 = 100 %
# V2 = 50 %
#
# a divisão será 2/3 para V1 e 1/3 para V2.
# ============================================================

def split_flow(
    total_flow,
    opening_a,
    opening_b
):

    opening_a = clamp(
        opening_a
    )

    opening_b = clamp(
        opening_b
    )

    total_opening = (
        opening_a +
        opening_b
    )

    if (
        total_opening <=
        0.0
    ):

        return (
            0.0,
            0.0
        )

    flow_a = (
        total_flow *
        opening_a /
        total_opening
    )

    flow_b = (
        total_flow *
        opening_b /
        total_opening
    )

    return (
        flow_a,
        flow_b
    )


# ============================================================
# DIVISÃO X1 / X2
#
# Provisoriamente:
#
# somente A ligada -> 100 % para A
# somente B ligada -> 100 % para B
# A e B ligadas   -> 50 / 50
# ambas desligadas -> vazão zero
# ============================================================

def split_relay_flow(
    total_flow,
    state_a,
    state_b
):

    if (
        state_a and
        state_b
    ):

        return (
            total_flow / 2.0,
            total_flow / 2.0
        )

    if (
        state_a
    ):

        return (
            total_flow,
            0.0
        )

    if (
        state_b
    ):

        return (
            0.0,
            total_flow
        )

    return (
        0.0,
        0.0
    )


# ============================================================
# CONVERSÃO DE VAZÃO PARA VARIAÇÃO DO NÍVEL
#
# flow = L/min
# dt   = segundos
#
# Retorna variação percentual do tanque.
# ============================================================

def flow_to_level_change(
    flow_l_min,
    dt
):

    volume_change_l = (
        flow_l_min *
        dt /
        60.0
    )

    fraction = (
        volume_change_l /
        TANK_CAPACITY_L
    )

    return (
        fraction *
        100.0
    )


# ============================================================
# ATUALIZAÇÃO DOS SENSORES DE NÍVEL
#
# Ainda é uma aproximação:
#
# nível %
#   ↓
# altura
#   ↓
# pressão hidrostática
#   ↓
# MPX5010
# ============================================================

def update_level_sensors():

    rho = 1000.0

    gravity = 9.81

    supply_voltage = 5.0

    for index in range(
        1,
        7
    ):

        tank_id = (
            f"H{index}"
        )

        sensor_id = (
            f"LT{index}"
        )

        tank = (
            state["tanks"][tank_id]
        )

        sensor = (
            state["levelSensors"][sensor_id]
        )

        level = clamp_level(
            tank["level"]
        )

        level_fraction = (
            level /
            100.0
        )

        height = (
            level_fraction *
            TANK_MAX_HEIGHT_M
        )

        volume = (
            level_fraction *
            TANK_CAPACITY_L
        )

        pressure_pa = (
            rho *
            gravity *
            height
        )

        pressure_kpa = (
            pressure_pa /
            1000.0
        )

        # MPX5010:
        #
        # Vout = Vs * (0.09 * P + 0.04)

        voltage = (
            supply_voltage *
            (
                0.09 *
                pressure_kpa +
                0.04
            )
        )

        voltage = max(
            0.0,
            min(
                supply_voltage,
                voltage
            )
        )

        raw = int(
            round(
                voltage /
                supply_voltage *
                1023
            )
        )

        tank["level"] = (
            level
        )

        tank["height"] = (
            height
        )

        tank["volume"] = (
            volume
        )

        sensor["level"] = (
            level
        )

        sensor["pressure"] = (
            pressure_kpa
        )

        sensor["voltage"] = (
            voltage
        )

        sensor["raw"] = (
            raw
        )


# ============================================================
# HARDWARE / SERIAL
# ============================================================

def hardware_mode():
    return BACKEND_MODE == "HARDWARE"


def modelica_mode():
    return BACKEND_MODE == "MODELICA"


def forward_command_to_arduino(message):
    return False  # Aquisição: nenhuma atuação física.


def apply_hardware_telemetry(values):
    """Cada frame é um snapshot: campo ausente/null nunca reaproveita leitura antiga."""
    global last_telemetry_time
    last_telemetry_time = time.monotonic()
    for index in range(1, 7):
        sid = f"LT{index}"
        raw = values.get(f"{sid}_RAW")
        raw = raw if isinstance(raw, (int, float)) and math.isfinite(raw) and 0 <= raw <= ADC_MAX else None
        calibration = LT_CALIBRATION[sid]
        level = None
        voltage = raw/ADC_MAX*ADC_REFERENCE_V if raw is not None and ADC_REFERENCE_V else None
        pressure = None
        pressure_calibration = LT_PRESSURE_CALIBRATION[sid]
        if voltage is not None and pressure_calibration and pressure_calibration[1] > 0:
            pressure = max(0, (voltage-pressure_calibration[0])/pressure_calibration[1])
            height = pressure*1000/(WATER_DENSITY_KG_M3*GRAVITY_M_S2)
            level = clamp_level(height/TANK_MAX_HEIGHT_M*100)
        if raw is not None and calibration and calibration[1] > calibration[0]:
            level = clamp_level((raw-calibration[0])/(calibration[1]-calibration[0])*100)
        state["levelSensors"][sid].update(raw=raw,
            voltage=voltage,
            pressure=pressure, level=level,
            status="available" if level is not None else "uncalibrated" if raw is not None else "unavailable")
        state["tanks"][f"H{index}"].update(level=level,
            height=level/100*TANK_MAX_HEIGHT_M if level is not None else None,
            volume=level/100*TANK_CAPACITY_L if level is not None else None)
        sid = f"FT{index}"
        raw = values.get(f"{sid}_RAW")
        raw = raw if isinstance(raw, (int, float)) and math.isfinite(raw) and 0 <= raw <= ADC_MAX else None
        flow = values.get(sid)
        calibration = FT_ANALOG_CALIBRATION[sid]
        if flow is None and raw is not None and calibration:
            zero, reference, reference_flow = calibration
            if reference > zero and reference_flow > 0:
                flow = max(0, (raw-zero)/(reference-zero)*reference_flow)
        flow = flow if isinstance(flow, (int, float)) and math.isfinite(flow) and flow >= 0 else None
        hz = values.get(f"{sid}_HZ")
        state["flowSensors"][sid].update(flow=flow, raw=raw, frequency=hz,
            status="available" if flow is not None else "uncalibrated" if raw is not None or hz is not None else "unavailable")
    update_hardware_visual_flows()



def update_hardware_visual_flows():
    """Monta animacao a partir dos FT reais disponiveis."""

    ft1 = state["flowSensors"]["FT1"]["flow"]
    ft2 = state["flowSensors"]["FT2"]["flow"]
    ft3 = state["flowSensors"]["FT3"]["flow"]
    ft4 = state["flowSensors"]["FT4"]["flow"]
    ft5 = state["flowSensors"]["FT5"]["flow"]
    ft6 = state["flowSensors"]["FT6"]["flow"]

    branch_x1 = ft2 + ft3 if ft2 is not None and ft3 is not None else None
    branch_x2 = ft1 + ft6 if ft1 is not None and ft6 is not None else None
    central_flow = branch_x1 + branch_x2 if branch_x1 is not None and branch_x2 is not None else None

    state["flows"] = {
        "RES_P3": central_flow,
        "P3_MV": central_flow,
        "MV_V1": branch_x1,
        "MV_V2": branch_x2,
        "V1_X1A": ft3,
        "X1A_FT3": ft3,
        "FT3_H3": ft3,
        "V1_X1B": ft2,
        "X1B_FT2": ft2,
        "FT2_H6": ft2,
        "V2_X2A": ft1,
        "X2A_FT1": ft1,
        "FT1_H5": ft1,
        "V2_X2B": ft6,
        "X2B_FT6": ft6,
        "FT6_H4": ft6,
        "P1_V3": ft4,
        "V3_FT4": ft4,
        "FT4_H1": ft4,
        "P2_V4": ft5,
        "V4_FT5": ft5,
        "FT5_H2": ft5,

        # Estes trechos nao possuem FT proprio confirmado.
        # Nao inventamos vazao no modo HARDWARE.
        "H5_HV3_IN": None,
        "HV3_IN_H3": None,
        "P1_RV1": None,
        "RV1_H3": None,
        "H3_HV3_P1": None,
        "HV3_P1_P1": None,
        "H6_HV4_IN": None,
        "HV4_IN_H4": None,
        "P2_RV2": None,
        "RV2_H4": None,
        "H4_HV4_P2": None,
        "HV4_P2_P2": None,
        "H1_HV1_DRAIN": None,
        "HV1_DRAIN_RES": None,
        "H2_HV2_DRAIN": None,
        "HV2_DRAIN_RES": None
    }


def process_serial_events():
    global last_synced_serial_connection_id

    if serial_bridge is None:
        return

    for event in serial_bridge.poll_events():
        event_type = event.get("type")

        if event_type == "serial_connected":
            print(
                f"[SERIAL] Conectado em {event['port']} "
                f"@ {event['baud']} baud."
            )

            connection_id = event.get(
                "connection_id",
                0
            )

            if connection_id != last_synced_serial_connection_id:
                last_synced_serial_connection_id = connection_id
                apply_hardware_telemetry({})

            continue

        if event_type == "serial_disconnected":
            apply_hardware_telemetry({})
            print("[SERIAL] Arduino desconectado; tentando reconectar...")
            continue

        if event_type == "serial_error":
            print(
                "[SERIAL] Erro:",
                event.get("message", "")
            )
            continue

        if event_type == "arduino_hello":
            print(
                "[ARDUINO]",
                event.get("board"),
                event.get("application"),
                f"protocolo={event.get('protocol')}"
            )
            continue

        if event_type == "arduino_ack":
            print(
                "[ARDUINO ACK]",
                ",".join(event.get("command", []))
            )
            continue

        if event_type == "arduino_error":
            print(
                "[ARDUINO ERRO]",
                event.get("message", "")
            )
            continue

        if event_type == "telemetry":
            apply_hardware_telemetry(
                event.get("values", {})
            )
            continue

        if event_type == "serial_line":
            print(
                "[SERIAL RX]",
                event.get("line", "")
            )


# ============================================================
# COMANDOS RECEBIDOS DA HMI
# ============================================================

def handle_command(
    message
):
    if hardware_mode():
        return False

    # No modo MODELICA quem interpreta os comandos é o runtime
    # (bombas e válvulas, malhas, cenário, válvulas de 3 vias, relógio).
    if modelica_mode():
        if modelica_runtime is None:
            return False
        return modelica_runtime.handle_command(message)


    message_type = (
        message.get(
            "type"
        )
    )


    # --------------------------------------------------------
    # HELLO
    # --------------------------------------------------------

    if (
        message_type ==
        "hello"
    ):

        print(
            "[HMI] cliente identificado:",
            message
        )

        return


    # --------------------------------------------------------
    # BOMBA
    # --------------------------------------------------------

    if (
        message_type ==
        "pump"
    ):

        pump_id = (
            message.get(
                "id"
            )
        )

        if (
            pump_id not in
            state["pumps"]
        ):

            return

        pump = (
            state["pumps"][pump_id]
        )

        if (
            "power" in
            message
        ):

            pump["power"] = bool(
                message["power"]
            )

        if (
            "command" in
            message
        ):

            pump["command"] = clamp(
                float(
                    message["command"]
                )
            )

        print(
            f"[COMANDO] {pump_id}: "
            f"power={pump['power']} "
            f"command={pump['command']:.2f}"
        )

        forward_command_to_arduino({
            "type": "pump",
            "id": pump_id,
            "power": pump["power"],
            "command": pump["command"]
        })

        return


    # --------------------------------------------------------
    # VÁLVULA
    # --------------------------------------------------------

    if (
        message_type ==
        "valve"
    ):

        valve_id = (
            message.get(
                "id"
            )
        )

        opening = clamp(
            float(
                message.get(
                    "opening",
                    0.0
                )
            )
        )

        if (
            valve_id ==
            "MV"
        ):

            state[
                "mainValve"
            ][
                "opening"
            ] = opening

        elif (
            valve_id in
            state[
                "actuatedValves"
            ]
        ):

            state[
                "actuatedValves"
            ][
                valve_id
            ][
                "opening"
            ] = opening

        else:

            return

        print(
            f"[COMANDO] {valve_id}: "
            f"opening={opening:.2f}"
        )

        forward_command_to_arduino({
            "type": "valve",
            "id": valve_id,
            "opening": opening
        })

        return


    # --------------------------------------------------------
    # VÁLVULA MANUAL / RECIRCULAÇÃO
    #
    # Estas válvulas não são atuadas eletricamente.
    # A HMI apenas informa ao backend a posição declarada
    # pelo operador para que o mock hidráulico use esse valor.
    # --------------------------------------------------------

    if (
        message_type ==
        "manual_valve"
    ):

        valve_id = (
            message.get(
                "id"
            )
        )

        opening = clamp(
            float(
                message.get(
                    "opening",
                    0.0
                )
            )
        )

        if (
            valve_id in
            state[
                "recycleValves"
            ]
        ):

            state[
                "recycleValves"
            ][
                valve_id
            ][
                "opening"
            ] = opening

        elif (
            valve_id in
            state[
                "manualValves"
            ]
        ):

            state[
                "manualValves"
            ][
                valve_id
            ][
                "opening"
            ] = opening

        else:

            return

        print(
            f"[MANUAL] {valve_id}: "
            f"opening={opening:.2f}"
        )

        return


    # --------------------------------------------------------
    # RELÉ
    # --------------------------------------------------------

    if (
        message_type ==
        "relay"
    ):

        relay_id = (
            message.get(
                "id"
            )
        )

        if (
            relay_id not in
            state[
                "threeWayValves"
            ]
        ):

            return

        relay_state = bool(
            message.get(
                "state",
                False
            )
        )

        state[
            "threeWayValves"
        ][
            relay_id
        ][
            "state"
        ] = relay_state

        print(
            f"[COMANDO] {relay_id}: "
            f"state={relay_state}"
        )

        forward_command_to_arduino({
            "type": "relay",
            "id": relay_id,
            "state": relay_state
        })

        return


    print(
        "[AVISO] comando desconhecido:",
        message
    )


# ============================================================
# MODELO HIDRÁULICO SIMPLIFICADO
# ============================================================

def update_mock_plant(
    dt
):

    # ========================================================
    # NÍVEIS ATUAIS
    # ========================================================

    h1 = state["tanks"]["H1"]["level"]
    h2 = state["tanks"]["H2"]["level"]
    h3 = state["tanks"]["H3"]["level"]
    h4 = state["tanks"]["H4"]["level"]
    h5 = state["tanks"]["H5"]["level"]
    h6 = state["tanks"]["H6"]["level"]


    # ========================================================
    # P3
    #
    # Reservatório -> P3 -> MV
    # ========================================================

    p3 = (
        state["pumps"]["P3"]
    )

    if (
        p3["power"]
    ):

        p3_flow = (
            P3_MAX_FLOW_L_MIN *
            p3["command"]
        )

    else:

        p3_flow = (
            0.0
        )

    p3_flow *= (
        state[
            "mainValve"
        ][
            "opening"
        ]
    )


    # ========================================================
    # DIVISÃO V1 / V2
    # ========================================================

    v1_opening = (
        state[
            "actuatedValves"
        ][
            "V1"
        ][
            "opening"
        ]
    )

    v2_opening = (
        state[
            "actuatedValves"
        ][
            "V2"
        ][
            "opening"
        ]
    )

    (
        v1_flow,
        v2_flow
    ) = split_flow(
        p3_flow,
        v1_opening,
        v2_opening
    )


    # ========================================================
    # X1
    #
    # X1A -> FT3 -> H3
    # X1B -> FT2 -> H6
    # ========================================================

    x1a = (
        state[
            "threeWayValves"
        ][
            "X1A"
        ][
            "state"
        ]
    )

    x1b = (
        state[
            "threeWayValves"
        ][
            "X1B"
        ][
            "state"
        ]
    )

    (
        ft3,
        ft2
    ) = split_relay_flow(
        v1_flow,
        x1a,
        x1b
    )


    # ========================================================
    # X2
    #
    # X2A -> FT1 -> H5
    # X2B -> FT6 -> H4
    # ========================================================

    x2a = (
        state[
            "threeWayValves"
        ][
            "X2A"
        ][
            "state"
        ]
    )

    x2b = (
        state[
            "threeWayValves"
        ][
            "X2B"
        ][
            "state"
        ]
    )

    (
        ft1,
        ft6
    ) = split_relay_flow(
        v2_flow,
        x2a,
        x2b
    )


    # ========================================================
    # GRAVIDADE
    #
    # H5 -> H3
    # H6 -> H4
    #
    # Usamos sqrt(nível), inspirado na relação de Torricelli,
    # mas ainda sem parâmetros físicos calibrados.
    # ========================================================

    hv3_in = (
        state[
            "manualValves"
        ][
            "HV3_IN"
        ][
            "opening"
        ]
    )

    hv4_in = (
        state[
            "manualValves"
        ][
            "HV4_IN"
        ][
            "opening"
        ]
    )

    gravity_h5_h3 = (
        GRAVITY_MAX_FLOW_L_MIN *
        math.sqrt(
            max(
                h5,
                0.0
            ) /
            100.0
        ) *
        hv3_in
    )

    gravity_h6_h4 = (
        GRAVITY_MAX_FLOW_L_MIN *
        math.sqrt(
            max(
                h6,
                0.0
            ) /
            100.0
        ) *
        hv4_in
    )


    # ========================================================
    # P1
    #
    # H3 -> P1
    #
    # divide entre:
    #
    # V3  -> FT4 -> H1
    # RV1 -> retorno para H3
    # ========================================================

    p1 = (
        state["pumps"]["P1"]
    )

    hv3_p1 = (
        state[
            "manualValves"
        ][
            "HV3_P1"
        ][
            "opening"
        ]
    )

    if (
        p1["power"] and
        h3 > 0.0
    ):

        p1_total_flow = (
            P1_MAX_FLOW_L_MIN *
            p1["command"] *
            hv3_p1
        )

    else:

        p1_total_flow = (
            0.0
        )

    v3_opening = (
        state[
            "actuatedValves"
        ][
            "V3"
        ][
            "opening"
        ]
    )

    rv1_opening = (
        state[
            "recycleValves"
        ][
            "RV1"
        ][
            "opening"
        ]
    )

    # Nova inspeção física:
    # RV1 retorna diretamente para H3 por uma entrada própria.
    # Portanto HV3_IN NÃO limita a recirculação.
    rv1_effective_opening = (
        rv1_opening
    )

    (
        ft4,
        p1_recycle
    ) = split_flow(
        p1_total_flow,
        v3_opening,
        rv1_effective_opening
    )

    actual_p1_flow = (
        ft4 +
        p1_recycle
    )


    # ========================================================
    # P2
    #
    # H4 -> P2
    #
    # divide entre:
    #
    # V4  -> FT5 -> H2
    # RV2 -> retorno para H4
    # ========================================================

    p2 = (
        state["pumps"]["P2"]
    )

    hv4_p2 = (
        state[
            "manualValves"
        ][
            "HV4_P2"
        ][
            "opening"
        ]
    )

    if (
        p2["power"] and
        h4 > 0.0
    ):

        p2_total_flow = (
            P2_MAX_FLOW_L_MIN *
            p2["command"] *
            hv4_p2
        )

    else:

        p2_total_flow = (
            0.0
        )

    v4_opening = (
        state[
            "actuatedValves"
        ][
            "V4"
        ][
            "opening"
        ]
    )

    rv2_opening = (
        state[
            "recycleValves"
        ][
            "RV2"
        ][
            "opening"
        ]
    )

    # O retorno de RV2 passa pelo mesmo ponto de entrada de H6 e
    # também fica limitado por HV4_IN.
    # RV2 também retorna diretamente para H4.
    # HV4_IN não limita este caminho.
    rv2_effective_opening = (
        rv2_opening
    )

    (
        ft5,
        p2_recycle
    ) = split_flow(
        p2_total_flow,
        v4_opening,
        rv2_effective_opening
    )

    actual_p2_flow = (
        ft5 +
        p2_recycle
    )


    # ========================================================
    # DRENAGEM H1 / H2
    # ========================================================

    hv1_drain = (
        state[
            "manualValves"
        ][
            "HV1_DRAIN"
        ][
            "opening"
        ]
    )

    hv2_drain = (
        state[
            "manualValves"
        ][
            "HV2_DRAIN"
        ][
            "opening"
        ]
    )

    drain_h1 = (
        DRAIN_MAX_FLOW_L_MIN *
        math.sqrt(
            max(
                h1,
                0.0
            ) /
            100.0
        ) *
        hv1_drain
    )

    drain_h2 = (
        DRAIN_MAX_FLOW_L_MIN *
        math.sqrt(
            max(
                h2,
                0.0
            ) /
            100.0
        ) *
        hv2_drain
    )


    # ========================================================
    # BALANÇO DE VAZÃO
    #
    # positivo = entra no tanque
    # negativo = sai do tanque
    # ========================================================

    net_h1 = (
        ft4 -
        drain_h1
    )

    net_h2 = (
        ft5 -
        drain_h2
    )

    net_h3 = (
        ft3 +
        gravity_h5_h3 +
        p1_recycle -
        actual_p1_flow
    )

    net_h4 = (
        ft6 +
        gravity_h6_h4 +
        p2_recycle -
        actual_p2_flow
    )

    net_h5 = (
        ft1 -
        gravity_h5_h3
    )

    net_h6 = (
        ft2 -
        gravity_h6_h4
    )


    # ========================================================
    # ATUALIZA NÍVEIS
    # ========================================================

    state["tanks"]["H1"]["level"] = (
        clamp_level(
            h1 +
            flow_to_level_change(
                net_h1,
                dt
            )
        )
    )

    state["tanks"]["H2"]["level"] = (
        clamp_level(
            h2 +
            flow_to_level_change(
                net_h2,
                dt
            )
        )
    )

    state["tanks"]["H3"]["level"] = (
        clamp_level(
            h3 +
            flow_to_level_change(
                net_h3,
                dt
            )
        )
    )

    state["tanks"]["H4"]["level"] = (
        clamp_level(
            h4 +
            flow_to_level_change(
                net_h4,
                dt
            )
        )
    )

    state["tanks"]["H5"]["level"] = (
        clamp_level(
            h5 +
            flow_to_level_change(
                net_h5,
                dt
            )
        )
    )

    state["tanks"]["H6"]["level"] = (
        clamp_level(
            h6 +
            flow_to_level_change(
                net_h6,
                dt
            )
        )
    )


    # ========================================================
    # ATUALIZA SENSORES FT
    # ========================================================

    state[
        "flowSensors"
    ][
        "FT1"
    ][
        "flow"
    ] = ft1

    state[
        "flowSensors"
    ][
        "FT2"
    ][
        "flow"
    ] = ft2

    state[
        "flowSensors"
    ][
        "FT3"
    ][
        "flow"
    ] = ft3

    state[
        "flowSensors"
    ][
        "FT4"
    ][
        "flow"
    ] = ft4

    state[
        "flowSensors"
    ][
        "FT5"
    ][
        "flow"
    ] = ft5

    state[
        "flowSensors"
    ][
        "FT6"
    ][
        "flow"
    ] = ft6


    # ========================================================
    # VAZÕES POR TRECHO PARA A HMI
    #
    # Os FT continuam sendo as medições principais. Para os
    # trechos sem FT, o mock fornece as vazões calculadas para
    # que as válvulas manuais tenham efeito visível na interface.
    # ========================================================

    branch_x1 = (
        ft2 +
        ft3
    )

    branch_x2 = (
        ft1 +
        ft6
    )

    central_flow = (
        branch_x1 +
        branch_x2
    )

    common_h3_flow = (
        gravity_h5_h3 +
        p1_recycle
    )

    common_h4_flow = (
        gravity_h6_h4 +
        p2_recycle
    )

    state["flows"] = {
        "RES_P3": central_flow,
        "P3_MV": central_flow,
        "MV_V1": branch_x1,
        "MV_V2": branch_x2,

        "V1_X1A": ft3,
        "X1A_FT3": ft3,
        "FT3_H3": ft3,
        "V1_X1B": ft2,
        "X1B_FT2": ft2,
        "FT2_H6": ft2,

        "V2_X2A": ft1,
        "X2A_FT1": ft1,
        "FT1_H5": ft1,
        "V2_X2B": ft6,
        "X2B_FT6": ft6,
        "FT6_H4": ft6,

        "H5_HV3_IN": gravity_h5_h3,
        "HV3_IN_H3": gravity_h5_h3,
        "P1_RV1": p1_recycle,
        "RV1_H3": p1_recycle,
        "H3_HV3_P1": actual_p1_flow,
        "HV3_P1_P1": actual_p1_flow,
        "P1_V3": ft4,
        "V3_FT4": ft4,
        "FT4_H1": ft4,

        "H6_HV4_IN": gravity_h6_h4,
        "HV4_IN_H4": gravity_h6_h4,
        "P2_RV2": p2_recycle,
        "RV2_H4": p2_recycle,
        "H4_HV4_P2": actual_p2_flow,
        "HV4_P2_P2": actual_p2_flow,
        "P2_V4": ft5,
        "V4_FT5": ft5,
        "FT5_H2": ft5,

        "H1_HV1_DRAIN": drain_h1,
        "HV1_DRAIN_RES": drain_h1,
        "H2_HV2_DRAIN": drain_h2,
        "HV2_DRAIN_RES": drain_h2,
    }


    # ========================================================
    # ATUALIZA LT
    # ========================================================

    update_level_sensors()


# ============================================================
# ENVIO PERIÓDICO DO ESTADO
# ============================================================

async def state_sender(
    websocket
):

    previous_time = (
        time.monotonic()
    )

    try:

        while True:

            current_time = (
                time.monotonic()
            )

            dt = (
                current_time -
                previous_time
            )

            previous_time = (
                current_time
            )

            # Evita grandes saltos caso o computador fique
            # temporariamente travado.

            dt = min(
                dt,
                0.5
            )

            if hardware_mode():
                process_serial_events()
                if last_telemetry_time is None or time.monotonic() - last_telemetry_time > TELEMETRY_TIMEOUT_S:
                    apply_hardware_telemetry({})
            elif modelica_mode():
                # A simulação avança na tarefa modelica_loop(); aqui só se envia.
                pass
            else:
                update_mock_plant(
                    dt
                )

            await send_json(
                websocket,
                {
                    "type":
                        "state",

                    "data":
                        state
                }
            )

            await asyncio.sleep(
                0.10
            )

    except websockets.ConnectionClosed:

        pass


# ============================================================
# CLIENTE CONECTADO
# ============================================================

async def client_handler(
    websocket
):

    print(
        "[WEBSOCKET] HMI conectada."
    )

    clients.add(
        websocket
    )

    await send_json(
        websocket,
        {
            "type":
                "hello",

            "server":
                "six-tank-python-server"
        }
    )

    sender_task = (
        asyncio.create_task(
            state_sender(
                websocket
            )
        )
    )

    try:

        async for raw_message in websocket:

            try:

                message = (
                    json.loads(
                        raw_message
                    )
                )

            except json.JSONDecodeError:

                await send_json(
                    websocket,
                    {
                        "type":
                            "error",

                        "message":
                            "JSON inválido."
                    }
                )

                continue

            if hardware_mode():
                await send_json(websocket, {"type": "error", "message": "Planta real somente leitura."})
            elif modelica_mode():
                if handle_command(message) is False:
                    await send_json(websocket, {"type": "error", "message": f"Comando recusado: {message.get('type')} {message.get('id', '')}".strip()})
            else:
                handle_command(message)

    except websockets.ConnectionClosed:

        pass

    finally:

        sender_task.cancel()

        clients.discard(
            websocket
        )

        print(
            "[WEBSOCKET] HMI desconectada."
        )


# ============================================================
# MAIN
# ============================================================

# ============================================================
# LAÇO DO MODO MODELICA
# ============================================================

async def modelica_loop():
    """Avança a simulação a cada 100 ms de relógio (uma só vez, para todos os clientes)."""
    proximo = time.monotonic()
    while True:
        modelica_runtime.tick()
        proximo += 0.10
        atraso = proximo - time.monotonic()
        if atraso < 0:
            proximo = time.monotonic()
            atraso = 0
        await asyncio.sleep(atraso)


def create_modelica_runtime():
    try:
        from modelica_runtime import RuntimeModelica
    except ImportError as exc:
        raise SystemExit(
            "Modo MODELICA precisa do PyFMI. Use o ambiente conda 'seistanques' "
            f"(ver README) ou rode rodar_planta_modelica.bat. Detalhe: {exc}"
        )
    try:
        return RuntimeModelica(state)
    except FileNotFoundError as exc:
        raise SystemExit(f"{exc}")


async def main():
    global modelica_runtime
    if hardware_mode():
        apply_hardware_telemetry({})
    if modelica_mode():
        modelica_runtime = create_modelica_runtime()

    global serial_bridge

    if hardware_mode():
        serial_bridge = SerialBridge(
            port=SERIAL_PORT,
            baud=SERIAL_BAUD
        )
        serial_bridge.start()

    print(
        "=============================================="
    )

    print(
        "Servidor da Planta de Seis Tanques"
    )

    print(
        f"WebSocket: ws://{HOST}:{PORT}"
    )

    if hardware_mode():
        print(
            "Modo: HARDWARE"
        )
        print(
            f"Serial: {SERIAL_PORT} @ {SERIAL_BAUD} baud"
        )
        print(
            "Se o Arduino ainda nao estiver conectado, "
            "o servidor continuara tentando reconectar."
        )
    elif modelica_mode():
        print(
            "Modo: MODELICA (FMU da planta v13 + controladores PID_ISA/PI)"
        )
        print(
            f"Cenario inicial: {modelica_runtime.cenario_id}"
        )
    else:
        print(
            "Modo: MOCK (hidraulica simulada)"
        )

    print(
        "Aguardando conexão da HMI..."
    )

    print(
        "=============================================="
    )

    loop_task = None
    if modelica_mode():
        loop_task = asyncio.create_task(modelica_loop())

    try:
        try:
            servidor = websockets.serve(
                client_handler,
                HOST,
                PORT
            )
            await servidor.__aenter__()
        except OSError as exc:
            raise SystemExit(
                f"ERRO: a porta {PORT} já está em uso ({exc.strerror}). "
                "Outro backend da planta está rodando: feche a janela dele "
                "e execute de novo."
            )

        try:
            await asyncio.Future()
        finally:
            await servidor.__aexit__(None, None, None)

    finally:
        if loop_task is not None:
            loop_task.cancel()
        if serial_bridge is not None:
            serial_bridge.stop()


# ============================================================
# EXECUÇÃO
# ============================================================

if __name__ == "__main__":

    try:

        asyncio.run(
            main()
        )

    except KeyboardInterrupt:

        print(
            "\nServidor encerrado."
        )
