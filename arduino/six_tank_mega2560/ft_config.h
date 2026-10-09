#pragma once
#include "acquisition_config.h"

enum FlowMode {
  FT_DISABLED,
  FT_PULSE,
  FT_ANALOG
};

struct FlowConfig {
  FlowMode mode;
  int pin;
  float pulsesPerLiter;
};

constexpr uint8_t FT_SLOTS = 6;

// Planta 1 - ligações confirmadas.
// Sensores: YF-S401, saída por pulsos (Hall).
// Datasheet: f(Hz) = 43 * Q(L/min), portanto valor nominal:
// 43 pulsos/s por (L/min) * 60 s/min = 2580 pulsos/L.

// IMPORTANTE: 2580 pulsos/L é a calibração NOMINAL do datasheet.
// Depois, pode-se substituir cada valor pela calibração experimental de cada FT.
const FlowConfig FT_CONFIG[FT_SLOTS] = {
  {FT_PULSE, 30, 2580.0f}, // FT1 
  {FT_PULSE, 31, 2580.0f}, // FT2 
  {FT_PULSE, 32, 2580.0f}, // FT3 
  {FT_PULSE, 33, 2580.0f}, // FT4 
  {FT_PULSE, 34, 2580.0f}, // FT5 
  {FT_PULSE, 35, 2580.0f}  // FT6 
};

// No modo de teste agora existem seis FT conhecidos.
const bool FT_TEST_ENABLED[FT_SLOTS] = {
  true, true, true, true, true, true
};
