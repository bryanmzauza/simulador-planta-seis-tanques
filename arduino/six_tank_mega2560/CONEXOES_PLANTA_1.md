# Conexões confirmadas — Planta 1

## Aquisição usada pelo firmware

| Componente | Pino Arduino | Tipo |
|---|---:|---|
| LT1 / Pressão 1 | A0 | MPX5010 analógico |
| LT2 / Pressão 2 | A1 | MPX5010 analógico |
| LT3 / Pressão 3 | A2 | MPX5010 analógico |
| LT4 / Pressão 4 | A3 | MPX5010 analógico |
| LT5 / Pressão 5 | A4 | MPX5010 analógico |
| LT6 / Pressão 6 | A5 | MPX5010 analógico |
| FT1 | D30 | YF-S401 pulsos |
| FT2 | D31 | YF-S401 pulsos |
| FT3 | D32 | YF-S401 pulsos |
| FT4 | D33 | YF-S401 pulsos |
| FT5 | D34 | YF-S401 pulsos |
| FT6 | D35 | YF-S401 pulsos |

Calibração nominal inicial dos YF-S401: `2580 pulsos/L`, derivada de `f = 43 Q`, com `f` em Hz e `Q` em L/min. Deve ser validada/calibrada experimentalmente por sensor.

## Conexões existentes não acionadas por este firmware

- Servo 1: D36
- Servo 2: D37
- Servo 3: D38
- Servo 4: D39
- Bomba 1 RPWM: D5
- Bomba 1 LPWM: D6
- Bomba 2 RPWM: D7
- Bomba 2 LPWM: D8
- Bomba 3 RPWM: D9
- Bomba 3 LPWM: D10
- Relé 1: D26
- Relé 2: D27
- Relé 3: D28
- Relé 4: D29

O modo físico atual é somente aquisição. Nenhum desses pinos de atuação é escrito pelo firmware.

## Observação sobre temporizador

A aquisição dos FT em D30..D35 usa o **Timer1** a 4 kHz para amostragem das entradas. Isso evita depender de `attachInterrupt()` e não interfere nos PWM já cabeados em D5..D10. Se no futuro o firmware passar a usar bibliotecas ou funções que também dependam do Timer1, essa reserva deverá ser revisada.
