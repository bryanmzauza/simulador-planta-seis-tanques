"""Configuração de aquisição. None significa ainda não calibrado."""
ADC_MAX = 1023
ADC_REFERENCE_V = None  # TODO: medir referência do ADC
TELEMETRY_TIMEOUT_S = 2.0
# TODO: calibrar experimentalmente. LT: (raw_vazio, raw_cheio).
LT_CALIBRATION = {f"LT{i}": None for i in range(1, 7)}
# Alternativa: (tensão a zero kPa, volts por kPa), após calibração.
LT_PRESSURE_CALIBRATION = {f"LT{i}": None for i in range(1, 7)}
WATER_DENSITY_KG_M3 = 1000.0
GRAVITY_M_S2 = 9.81
# FT analógico: (raw_zero, raw_referencia, vazao_referencia_L_min).
FT_ANALOG_CALIBRATION = {f"FT{i}": None for i in range(1, 7)}
