# API de simulação — v1

Execute `npm run dev`, abra a aplicação e clique em **Código / API**.
O painel salva o texto localmente no navegador. O exemplo inicial aplica um
degrau à bomba P3 por dez segundos de tempo simulado.

Os nomes internos da API continuam `H1–H6`, `P1–P3`, `MV`, `RV1/RV2` e `HV*`.
Na interface, aparecem como T1–T6, B1–B3, VMC, VR3/VR4 e VM1–VM6.

O corpo do código é chamado antes de cada passo do simulador. Recebe `plant`,
`dt`, `memory` e `log`. Não precisa declarar uma função nem um loop.

```js
if (memory.start === undefined) memory.start = plant.time;
const elapsed = plant.time - memory.start;
plant.pumps.P3.set(elapsed < 10 ? 0.5 : 0);
plant.valves.V3.set(0.4);
log('H1:', plant.tanks.H1.level);
```

## Leituras e unidades

| Campo | Unidade / significado |
| --- | --- |
| `plant.time`, `dt` | Segundos de simulação; dt acompanha a velocidade selecionada |
| `plant.tanks.H1…H6.level` | Altura normalizada, de 0 a 1 |
| `.height`, `.volume` | Metros e litros |
| `plant.sensors.LT1…LT6` | Telemetria original; `level` em porcentagem |
| `plant.sensors.FT1…FT6` | Telemetria original; vazão em L/s |
| `plant.pumps.P1…P3` | `power`, `command` e método `set(v)` |
| `plant.valves` | MV, V1–V4, RV1/RV2 e válvulas manuais HV |
| `plant.relays` | X1A/X1B/X2A/X2B; método `set(boolean)` |

`set(v)` aceita apenas números finitos de 0 a 1. Nas bombas, zero desliga
e um valor positivo liga com esse comando. Válvulas recebem abertura normalizada.
As leituras são cópias: atribuir diretamente a um campo não altera a planta.
Os parâmetros físicos do simulador ainda incluem valores provisórios.

## Execução

- **Executar:** inicia um Worker novo, limpa `memory` e inicia a simulação no
  estado atual. Para um ensaio a partir do tempo zero, use Resetar antes.
- **Pausar / Continuar:** congela/retoma o ensaio preservando `memory`.
- **Parar:** encerra o Worker e pausa a simulação; preserva níveis e atuadores.
- **Resetar ensaio:** encerra o código e usa o reset existente da planta
  (tempo zero e níveis iniciais; posições dos atuadores são preservadas).
- Trocar para **Planta real** encerra o Worker e bloqueia a execução.
- Erros pausam o ensaio. Um lote inválido não é aplicado parcialmente.

Os comandos são aplicados somente após a conclusão de um ciclo e antes do
passo físico. Há apenas um ciclo pendente. Pausa, reset ou troca de modo
invalidam respostas pendentes. O tempo de processamento do código pode reduzir
a velocidade de execução em tempo real; esta não é uma plataforma hard real-time.

## Separação e isolamento

`simulation-api.js` adapta leituras e comandos ao simulador; não importa `real.js`.
`controller-runner.js` gerencia o ciclo de vida e o timeout.
`controller-worker.js` executa o código fora da thread da interface.
`code-panel.js` contém o editor e os controles; `main.js` coordena cada passo.

O Worker nasce em um iframe `sandbox="allow-scripts"`, sem permissão de mesma
origem. A CSP bloqueia conexões e recursos externos, incluindo WebSocket.
O código não recebe referências ao DOM ou ao simulador. O host valida todos os
comandos, limita lotes a 100 comandos e encerra ciclos acima de um segundo.
O histórico exibe até 100 mensagens, com até 20 mensagens por ciclo.

Isso isola erros comuns e loops infinitos. Não execute código hostil: o navegador
não oferece aqui uma quota rígida de memória/CPU. Não há acesso à planta física
pela API.

## Verificação

`npm run build` gera o frontend.
