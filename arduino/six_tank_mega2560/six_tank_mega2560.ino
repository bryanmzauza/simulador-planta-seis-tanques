// ============================================================
// PLANTA DE SEIS TANQUES - AQUISIÇÃO SOMENTE LEITURA
// Arduino Mega 2560
// ============================================================
//
// Hardware confirmado - Planta 1:
//   LT1..LT6 : A0..A5 (MPX5010)
//   FT1..FT6 : D30..D35 (YF-S401)
//
// Nenhum comando deste firmware atua em bombas, válvulas, servos ou relés.
// O único comando recebido pela Serial é PING, usado para diagnóstico.
// ============================================================

#include "acquisition_config.h"
#include "lt_config.h"
#include "ft_sensors.h"

unsigned long lastTelemetryMs = 0;
unsigned long lastFlowMeasurementMs = 0;

char rxLine[32];
uint8_t rxLength = 0;
bool rxOverflow = false;

void setup() {
  Serial.begin(SERIAL_BAUD);

  setupFlowSensors();

  const unsigned long now = millis();
  lastTelemetryMs = now;
  lastFlowMeasurementMs = now;

  Serial.println("HELLO,MEGA2560,SIX_TANKS,1");
}

void loop() {
  // ----------------------------------------------------------
  // Entrada serial limitada e somente leitura.
  // Só PING é reconhecido; não existem comandos de atuação.
  // ----------------------------------------------------------
  for (uint8_t n = 0; n < 32 && Serial.available(); ++n) {
    const char c = Serial.read();

    if (c == '\n') {
      rxLine[rxLength] = 0;

      if (!rxOverflow && strcmp(rxLine, "PING") == 0) {
        Serial.println("PONG");
      }

      rxLength = 0;
      rxOverflow = false;
    } else if (c != '\r') {
      if (rxLength < sizeof(rxLine) - 1) {
        rxLine[rxLength++] = c;
      } else {
        rxOverflow = true;
      }
    }
  }

  const unsigned long now = millis();

  // ----------------------------------------------------------
  // Atualiza a frequência dos FT a cada 500 ms.
  // A contagem dos pulsos em D30..D35 acontece continuamente
  // no Timer1, inclusive enquanto a Serial está transmitindo.
  // ----------------------------------------------------------
  if (!TEST_MODE &&
      now - lastFlowMeasurementMs >= FLOW_MEASUREMENT_PERIOD_MS) {
    const unsigned long elapsed = now - lastFlowMeasurementMs;
    lastFlowMeasurementMs = now;
    readFlowSensors(elapsed);
  }

  // ----------------------------------------------------------
  // Envia um snapshot para Python/dashboard a cada 100 ms.
  // ----------------------------------------------------------
  if (now - lastTelemetryMs < TELEMETRY_PERIOD_MS) {
    return;
  }

  lastTelemetryMs = now;

  Serial.print("TELEMETRY");
  appendLevelTelemetry();
  appendFlowTelemetry();
  Serial.println();
}
