# Planta Multivariável de Seis Tanques

Supervisório (HMI) de uma planta multivariável de seis tanques, desenvolvido
em um projeto de Iniciação Científica da UFRGS.

A mesma página web opera:

- a **planta simulada em Modelica**, em tempo real ou acelerado, com
  controladores PID ISA / PI atuando em válvulas, bombas e níveis;
- a **planta física**, com aquisição dos sensores pelo Arduino Mega 2560
  (por enquanto somente leitura).

A tela é o fluxograma de processo (P&ID) ao vivo. Clicar em um instrumento,
válvula, bomba ou tanque abre o painel (faceplate) com setpoint, modo
AUTO/MAN, saída manual e sintonia. A aba **Tendências** da barra superior
troca para a tela de gráficos e registro de ensaios em CSV; o laboratório de
código fica em **Código / API**.

## Estrutura

```text
src/
  main.js                 coordenação da HMI
  real.js                 cliente WebSocket do backend (fonte única de estado)
  synoptic.js             fluxograma SVG ao vivo (geometria do P&ID)
  faceplate.js            painéis de malha, bomba, válvula, tanque e sensores
  topbar.js               modo, conexão, cenário, controle da simulação, alarmes
  trends.js               tendências, registro de ensaios e exportação CSV
  simulation-api.js       API do laboratório de código (ver SIMULATION_API.md)
  component-labels.js     tags ISA e descrições (só apresentação)
  hmi.css, style.css      estilos

python/
  server.py               servidor WebSocket (modos MODELICA, MOCK e HARDWARE)
  modelica_runtime.py     laço de tempo real: planta + controladores + cenários
  modelica_plant.py       FMU da planta (SeisTanques_v13) via PyFMI
  controle.py             banco de controladores PID_ISA/PI (FMU) via PyFMI
  cenarios.py             cenários de controle (malhas, pareamentos, sintonias)
  build_fmu.py            exporta as FMUs com o OpenModelica
  serial_bridge.py        comunicação serial com o Arduino (aquisição)
  hardware_config.py      calibração da aquisição

modelica/
  modelo_6tanques_v13.mo       modelo físico da bancada (P&ID)
  modelo_6tanques_controle.mo  controladores PID_ISA/PI para tempo real
  modelo_6tanques_v12.mo       modelo original do laboratório (com MF_ST)
  pid_modelo_6tanques_v1.html  P&ID da planta
  build/                       FMUs geradas (não versionadas)

arduino/six_tank_mega2560/     firmware de aquisição
```

## Requisitos

- Node.js e npm (interface).
- OpenModelica 1.27 ou superior (só para gerar as FMUs).
- Python com PyFMI para o modo Modelica. PyFMI não instala por `pip` no
  Windows; use o conda-forge (Miniforge):

```sh
conda create -n seistanques -c conda-forge python=3.12 pyfmi websockets pyserial pyzmq
conda run -n seistanques pip install OMPython
```

Para a planta física basta `python -m pip install -r python/requirements.txt`.

## Como usar

### Simulação Modelica

```text
rodar_planta_modelica.bat
```

O script localiza o ambiente `seistanques`, gera as FMUs na primeira vez
(`python/build_fmu.py`), inicia o backend em modo `MODELICA` e o Vite, e abre
`http://127.0.0.1:5173`. A HMI conecta sozinha.

Na barra superior: escolha o **cenário**, clique em **Rodar** e ajuste a
**velocidade** (0,25× a 10×). As malhas já começam em AUTO e a planta parte
dos tanques vazios; no faceplate de cada controlador dá para mudar SP, passar
para MAN e ajustar a sintonia. **Todas AUTO** / **Todas MAN** mudam o modo
de todas as malhas de uma vez.

Cenários:

| Cenário | Malhas |
|---|---|
| Nível | LIC-101: LT-101 → LV-103 · LIC-102: LT-102 → LV-104 · LIC-103: LT-103 → LV-101 · LIC-104: LT-104 → LV-102 |
| Vazão por válvula | FIC-101: FT-101 → LV-101 · FIC-102: FT-102 → LV-102 · LIC-103: LT-103 → LV-103 · LIC-104: LT-104 → LV-104 |
| Vazão por bomba | FIC-103: FT-101 + FT-102 → B-103 · LIC-103: LT-103 → B-101 · LIC-104: LT-104 → B-102 |

TQ-103 e TQ-104 não têm descarga por gravidade (são integradores), por isso
os cenários de vazão também seguram o nível deles pelo atuador de saída.
Pareamentos, SP, sintonias (SIMC a partir de degraus no modelo) e as
aberturas de operação das válvulas manuais estão em `python/cenarios.py`.

**Estimativas de operação.** Com os padrões do v13 (HV com Cv 1000, "sem
perda") as descargas por gravidade escoam quase toda a vazão da B-103 e os
tanques não passam de 4 cm. Para a simulação ter um ponto de operação útil,
`cenarios.py#PARAMETROS_PLANTA` usa Cv 10 nas HV totalmente abertas e cada
cenário define a abertura das HV (HV-105/106 a 40 %, recirculação a 30 %,
HV-101/102 abertas). São estimativas, não medições: substituir quando houver
o ensaio de esvaziamento e a abertura real das HV na bancada (ver cabeçalho
de `modelica/modelo_6tanques_v13.mo`). As sintonias precisam ser refeitas
depois disso.

### Tendências

A barra superior alterna entre as telas **Processo** (fluxograma) e
**Tendências** (`#tendencias` no fim da URL abre direto nela). A tela de
tendências não tem rolagem: são três janelas com o mesmo eixo de tempo.

1. **Nível dos tanques**: LT-101 a LT-106, em cm.
2. **Variáveis controladas**: PV (linha) e SP (degrau claro, na mesma cor) de
   cada malha do cenário. Quando o cenário mistura unidades (vazão em L/min e
   nível em cm), a janela se divide lado a lado, uma parte por grandeza.
3. **Variáveis manipuladas**: a saída de cada controlador em %, com uma faixa
   de eventos por malha embaixo (âmbar = malha em MAN).

Na planta real, sem malhas, a segunda janela mostra as vazões medidas.

A legenda à direita de cada janela mostra os valores no instante do cursor.
Clicar numa malha da legenda a destaca nas três janelas, e **Ver tendência**
no faceplate da malha faz o mesmo. A roda do mouse muda a janela de tempo
(1 min a 1 h), arrastar navega no histórico e **Ao vivo** volta ao tempo
atual. Nos níveis, a cor indica o andar (azul inferior, verde intermediário,
rosa superior) e o tracejado o lado direito; nas malhas, cada malha tem uma
cor (com quatro malhas, a cor indica o par e o tracejado o lado direito).

**Gravar** registra todas as variáveis a cada 0,1 s (tempo de simulação ou
relógio, na planta real) até **Parar**; **Exportar CSV** gera o arquivo no
padrão brasileiro (`;` e vírgula decimal), com colunas nomeadas pelas tags do
P&ID. Dado ausente fica como célula vazia. Na planta real, o estado dos
atuadores não é medido e aparece como ausente.

Manualmente (PowerShell):

```powershell
$env:SIX_TANK_MODE = "MODELICA"
conda run -n seistanques python python\server.py
npm run dev
```

### Planta física

```text
rodar_planta_hardware.bat
```

Detecta a porta do Mega, inicia o backend em modo `HARDWARE` e a interface.
Nesse modo a HMI é somente leitura: nenhum comando é enviado ao Arduino.
Dado ausente aparece como `—` (nunca como zero).

### Backend simulado simples (sem Modelica)

```text
rodar_planta_mock.bat
```

## Modelos Modelica

- `modelo_6tanques_v13.mo`: planta física com as tags do P&ID (tanques em
  garrafas PET invertidas, descargas por orifício, válvulas de 3 vias
  temporizadas, sensores YF-S401 e MPX5010). Os parâmetros hidráulicos são
  estimativas a confirmar com medições na bancada (ver cabeçalho do arquivo).
- `modelo_6tanques_controle.mo`: PID ISA da v12 com sintonia, modo
  (AUTO/MAN) e ação como entradas, em um banco de N controladores. PI é o
  mesmo bloco com Td = 0. A transferência MAN→AUTO é sem salto.

As duas FMUs (FMI 2.0, co-simulação) são geradas por
`python/build_fmu.py` e executadas pelo backend com PyFMI, com passo de
0,1 s sincronizado ao relógio.

## Testes

```sh
npm run build
conda run -n seistanques python -m unittest discover -s python -p "test_*.py"
```

## Observações

Os parâmetros hidráulicos, dimensões e fatores de calibração ainda estão em
desenvolvimento. Os resultados da simulação não devem ser interpretados como
uma reprodução já identificada experimentalmente da bancada.
