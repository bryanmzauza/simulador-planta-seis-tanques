#pragma once
#include "acquisition_config.h"

constexpr uint8_t LT_COUNT = 6;

// Ligações confirmadas da Planta 1.
// MPX5010: saída analógica proporcional à pressão.
const int LT_PINS[LT_COUNT] = {
  A0, // LT1 / Sensor de pressão 1
  A1, // LT2 / Sensor de pressão 2
  A2, // LT3 / Sensor de pressão 3
  A3, // LT4 / Sensor de pressão 4
  A4, // LT5 / Sensor de pressão 5
  A5  // LT6 / Sensor de pressão 6
};

inline bool validAnalogPin(int pin) {
  return pin >= A0 && pin <= A15;
}

inline void appendLevelTelemetry() {
  for (uint8_t i = 0; i < LT_COUNT; ++i) {
    Serial.print(",LT");
    Serial.print(i + 1);
    Serial.print("_RAW=");

    if (TEST_MODE) {
      Serial.print(300 + ((millis() / 100 + i * 30) % 200));
    } else if (validAnalogPin(LT_PINS[i])) {
      Serial.print(analogRead(LT_PINS[i]));
    } else {
      Serial.print("null");
    }
  }
}
