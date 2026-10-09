#pragma once
#include <Arduino.h>

// false = lê a planta física.
// true  = gera telemetria sintética para testar Arduino -> Python -> Dashboard.
// Depois de alterar, é necessário gravar novamente o firmware no Mega.
const bool TEST_MODE = false;

constexpr unsigned long SERIAL_BAUD = 115200;
constexpr unsigned long TELEMETRY_PERIOD_MS = 100;

// A frequência dos FT é calculada usando uma janela maior que a telemetria.
// Isso reduz a quantização em baixas vazões sem diminuir a taxa de atualização
// do dashboard.
constexpr unsigned long FLOW_MEASUREMENT_PERIOD_MS = 500;

constexpr int UNCONFIGURED_PIN = -1;
