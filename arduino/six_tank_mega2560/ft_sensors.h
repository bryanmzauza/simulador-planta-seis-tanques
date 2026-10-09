#pragma once

#include "ft_config.h"
#include "lt_config.h"

#include <avr/interrupt.h>
#include <util/atomic.h>

// ============================================================
// AQUISIÇÃO DOS YF-S401 EM D30..D35
// ============================================================
//
// D30..D35 no Mega 2560 não são entradas de interrupção externa
// compatíveis com attachInterrupt(). Como a fiação da planta não pode
// ser alterada, os seis sinais são amostrados por um temporizador.
//
// O Timer1 dispara a 4 kHz (a cada 250 us). Em cada interrupção o
// firmware lê rapidamente os seis pinos e conta apenas transições LOW->HIGH.
//
// O datasheet do YF-S401 indica até aproximadamente 258 Hz em 6 L/min,
// com duty cycle próximo de 50%. Portanto 4 kHz fornece várias amostras
// durante cada nível alto/baixo e é suficiente para detectar os pulsos.
// ============================================================

constexpr unsigned long FT_POLL_HZ = 4000UL;
constexpr unsigned long FT_TIMER1_PRESCALER = 8UL;
constexpr unsigned long FT_TIMER1_COUNTS =
    F_CPU / (FT_TIMER1_PRESCALER * FT_POLL_HZ);

static_assert(FT_TIMER1_COUNTS >= 1 && FT_TIMER1_COUNTS <= 65536UL,
              "Configuracao do Timer1 fora da faixa");

constexpr uint16_t FT_TIMER1_OCR =
    static_cast<uint16_t>(FT_TIMER1_COUNTS - 1UL);

volatile unsigned long ftPulses[FT_SLOTS] = {};
unsigned long ftLastCounts[FT_SLOTS] = {};
bool ftReady[FT_SLOTS] = {};
float ftFrequency[FT_SLOTS] = {};

// Acesso direto aos registradores dos pinos configurados.
// Assim evitamos digitalRead() dentro da interrupção e mantemos a ISR curta.
volatile uint8_t* ftInputRegister[FT_SLOTS] = {};
uint8_t ftBitMask[FT_SLOTS] = {};
volatile bool ftLastHigh[FT_SLOTS] = {};

inline bool pinConflictsWithAnotherFT(uint8_t index, int pin) {
  for (uint8_t j = 0; j < FT_SLOTS; ++j) {
    if (j == index) continue;
    if (FT_CONFIG[j].mode != FT_DISABLED && FT_CONFIG[j].pin == pin) {
      return true;
    }
  }
  return false;
}

inline bool pinConflictsWithLT(int pin) {
  for (uint8_t j = 0; j < LT_COUNT; ++j) {
    if (LT_PINS[j] == pin) return true;
  }
  return false;
}

inline bool configurePolledPulsePin(uint8_t index, int pin) {
  if (pin < 0) return false;

  const uint8_t port = digitalPinToPort(pin);
  if (port == NOT_A_PIN) return false;

  pinMode(pin, INPUT);

  ftInputRegister[index] = portInputRegister(port);
  ftBitMask[index] = digitalPinToBitMask(pin);
  ftLastHigh[index] =
      ((*ftInputRegister[index]) & ftBitMask[index]) != 0;

  return ftInputRegister[index] != nullptr && ftBitMask[index] != 0;
}

inline void startFlowSamplerTimer() {
  noInterrupts();

  // Timer1 em CTC. No Mega 2560 a 16 MHz:
  // 16 MHz / 8 / (499 + 1) = 4 kHz.
  // Timer1 foi escolhido para não interferir nos PWM já cabeados em D5..D10.
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1 = 0;
  OCR1A = FT_TIMER1_OCR;

  TCCR1B |= _BV(WGM12);  // CTC
  TCCR1B |= _BV(CS11);   // prescaler 8
  TIMSK1 |= _BV(OCIE1A); // interrupção Compare Match A

  interrupts();
}

ISR(TIMER1_COMPA_vect) {
  for (uint8_t i = 0; i < FT_SLOTS; ++i) {
    volatile uint8_t* input = ftInputRegister[i];
    const uint8_t mask = ftBitMask[i];

    if (input == nullptr || mask == 0) continue;

    const bool high = ((*input) & mask) != 0;

    // Conta uma vez por pulso, somente na borda de subida.
    if (high && !ftLastHigh[i]) {
      ++ftPulses[i];
    }

    ftLastHigh[i] = high;
  }
}

inline void setupFlowSensors() {
  if (TEST_MODE) return;

  bool hasPulseSensor = false;

  for (uint8_t i = 0; i < FT_SLOTS; ++i) {
    const FlowConfig& c = FT_CONFIG[i];

    if (c.mode == FT_DISABLED) continue;

    const bool duplicate =
        pinConflictsWithAnotherFT(i, c.pin) || pinConflictsWithLT(c.pin);

    if (!duplicate && c.mode == FT_ANALOG && validAnalogPin(c.pin)) {
      ftReady[i] = true;
    }

    if (!duplicate && c.mode == FT_PULSE) {
      if (configurePolledPulsePin(i, c.pin)) {
        ftReady[i] = true;
        hasPulseSensor = true;
      }
    }

    if (!ftReady[i]) {
      Serial.print("ERROR,FT_CONFIG,");
      Serial.println(i + 1);
    }
  }

  if (hasPulseSensor) {
    startFlowSamplerTimer();
  }
}

inline void readFlowSensors(unsigned long elapsedMs) {
  if (elapsedMs == 0) return;

  unsigned long counts[FT_SLOTS] = {};

  ATOMIC_BLOCK(ATOMIC_RESTORESTATE) {
    for (uint8_t i = 0; i < FT_SLOTS; ++i) {
      counts[i] = ftPulses[i];
      ftPulses[i] = 0;
    }
  }

  for (uint8_t i = 0; i < FT_SLOTS; ++i) {
    ftLastCounts[i] = counts[i];

    if (ftReady[i] && FT_CONFIG[i].mode == FT_PULSE) {
      ftFrequency[i] = counts[i] * 1000.0f / elapsedMs;
    } else {
      ftFrequency[i] = 0.0f;
    }
  }
}

inline void appendFlowTelemetry() {
  for (uint8_t i = 0; i < FT_SLOTS; ++i) {
    Serial.print(",FT");
    Serial.print(i + 1);

    const FlowConfig& c = FT_CONFIG[i];

    if (TEST_MODE) {
      Serial.print('=');
      if (FT_TEST_ENABLED[i]) {
        Serial.print(0.5f + (millis() / 100 % 20) * 0.05f, 3);
      } else {
        Serial.print("null");
      }
      continue;
    }

    if (!ftReady[i]) {
      Serial.print("=null");
      continue;
    }

    if (c.mode == FT_ANALOG) {
      Serial.print("_RAW=");
      Serial.print(analogRead(c.pin));
      continue;
    }

    // Diagnóstico bruto da janela de medição.
    Serial.print("_PULSES=");
    Serial.print(ftLastCounts[i]);

    // Frequência medida em Hz.
    Serial.print(",FT");
    Serial.print(i + 1);
    Serial.print("_HZ=");
    Serial.print(ftFrequency[i], 3);

    // Vazão em L/min usando a calibração configurada.
    Serial.print(",FT");
    Serial.print(i + 1);
    Serial.print('=');

    if (c.pulsesPerLiter > 0.0f) {
      Serial.print(ftFrequency[i] * 60.0f / c.pulsesPerLiter, 4);
    } else {
      Serial.print("null");
    }
  }
}
