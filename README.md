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
AUTO/MAN, saída manual e sintonia. Tendências e exportação em CSV ficam na
gaveta inferior; o laboratório de código, na barra superior.

## Estrutura

```text
src/
  main.js                 coordenação da HMI
  real.js                 cliente WebSocket do backend (fonte única de estado)
  synoptic.js             fluxograma SVG ao vivo (geometria do P&ID)
  faceplate.js            painéis de malha, bomba, válvula, tanque e sensores
  topbar.js               modo, conexão, cenário, controle da simulação, alarmes
  experiment-dashboard.js tendências, registro e exportação CSV
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
**velocidade** (0,25× a 10×). As malhas começam em MAN; no faceplate de cada
controlador passe para AUTO e ajuste o SP.

Cenários:

| Cenário | Malhas |
|---|---|
| Nível | LIC-101: LT-101 → LV-103 · LIC-102: LT-102 → LV-104 · LIC-103: LT-103 → LV-101 · LIC-104: LT-104 → LV-102 |
| Vazão por válvula | FIC-101: FT-101 → LV-101 · FIC-102: FT-102 → LV-102 · FIC-105: FT-105 → LV-103 · FIC-106: FT-106 → LV-104 |
| Vazão por bomba | FIC-103: FT-101 + FT-102 → B-103 · FIC-105: FT-105 → B-101 · FIC-106: FT-106 → B-102 |

Os pareamentos e as sintonias iniciais estão em `python/cenarios.py`.

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
