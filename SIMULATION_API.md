# API de simulação (laboratório de código)

O painel **Código / API** da HMI executa um trecho de JavaScript a cada ciclo
(100 ms de relógio) dentro de um Worker isolado. O código só alcança a
simulação Modelica: com o backend no modo `HARDWARE` (planta real) nada é
enviado, por construção (`real.js#sendCommand` recusa).

A simulação roda no backend Python (FMU do modelo `SeisTanques_v13` +
banco de controladores PID_ISA/PI). O código do usuário não trava a
simulação: ele lê o último estado recebido e envia comandos pelo WebSocket.

## Assinatura

```js
// variáveis disponíveis: plant, dt, memory, log
```

- `plant`: snapshot do estado (abaixo). Somente leitura, exceto os métodos `set*`.
- `dt`: segundos de simulação por ciclo (0,1 s × velocidade).
- `memory`: objeto que persiste entre ciclos (guarde estados e temporizadores aqui).
- `log(...valores)`: escreve no painel (até 20 mensagens por ciclo).

## Snapshot `plant`

| Campo | Conteúdo |
|---|---|
| `plant.time` | tempo de simulação (s) |
| `plant.scenario` | cenário ativo: `nivel`, `vazao_valvula`, `vazao_bomba` |
| `plant.tanks.H1…H6` | `level` (0 a 1), `heightCm` (cm), `height` (m), `volume` (L) |
| `plant.sensors.LT1…LT6` | `level` (%), `heightCm`, `pressure` (kPa), `voltage` (V), `status` |
| `plant.sensors.FT1…FT6` | `flow` (L/min), `status` |
| `plant.pumps.P1…P3` | `power` (0/1), `command` (0 a 1), `set(v)` |
| `plant.valves.MV, V1…V4, RV1, RV2, HV*` | `opening` (0 a 1), `set(v)` |
| `plant.relays.X1A, X1B, X2A, X2B` | `state` (bool), `set(bool)` |
| `plant.loops['LIC-101']…` | `pv`, `sp`, `mv` (0 a 1), `mode` (`AUTO`/`MAN`), `unit`, `setSP(v)`, `setMode('AUTO'|'MAN')`, `setMV(0–1)` |

IDs internos: tanques `H1…H6`, bombas `P1…P3`, válvulas de controle `V1…V4`
(LV-101…104 no P&ID), válvula principal `MV` (HV-109), recirculação
`RV1/RV2` (HV-107/108), manuais `HV3_IN, HV4_IN, HV3_P1, HV4_P2, HV1_DRAIN,
HV2_DRAIN`. Sensores: `LT1…LT6`; `FT3`=FT-101, `FT6`=FT-102, `FT1`=FT-103,
`FT2`=FT-104, `FT4`=FT-105, `FT5`=FT-106.

## Comandos

- Valores de bombas e válvulas: número de 0 a 1 (`set(0)` desliga a bomba).
- Relés: booleano. No modelo as válvulas de 3 vias são temporizadas; ligar
  um relé fixa aquela porta (o tempo da outra vai a zero).
- Malhas: `setSP(valor)` na unidade da malha (cm ou L/min), `setMode`,
  `setMV` (só vale em MAN).
- Um atuador controlado por uma malha em AUTO é recusado pelo backend:
  passe a malha para MAN antes (`plant.loops[tag].setMode('MAN')`).
- O lote de um ciclo é validado inteiro antes de ser enviado (até 100
  comandos); um comando inválido cancela o lote e para o código.

## Exemplo

```js
if (memory.start === undefined) {
  memory.start = plant.time;
  log('Ensaio iniciado no cenário', plant.scenario);
}
const malha = plant.loops['LIC-101'];
if (malha) {
  if (plant.time - memory.start < 1) malha.setMode('AUTO');
  malha.setSP(plant.time - memory.start < 60 ? 9 : 10);   // degrau de SP em 60 s
}
```

## Isolamento

Worker criado por um iframe sem permissão de mesma origem, com CSP que
bloqueia rede e importações. Limite de 1 s por ciclo. Não é uma proteção
contra exaustão de memória do navegador: use códigos de confiança.
