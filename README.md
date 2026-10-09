# Planta Multivariável de Seis Tanques

Simulador e interface supervisória para uma planta multivariável de seis tanques, desenvolvido em um projeto de Iniciação Científica da UFRGS.

A aplicação permite simular a planta no navegador, acompanhar níveis e vazões, realizar ensaios e registrar dados. Também possui uma estrutura para aquisição de dados da planta física através de Arduino, Python e WebSocket.

## Estrutura

```text
src/
  main.js                 inicialização e integração da aplicação
  simulator.js            modelo e dinâmica da simulação
  plant-model.js          parâmetros físicos da planta
  plant-state.js          estado dos componentes
  plant-view.js           representação da planta em JointJS
  plant-config.js         posições e configuração visual
  experiment-dashboard.js tendências, aquisição e exportação de dados
  simulation-api.js       interface para execução de códigos na simulação

python/
  server.py               servidor WebSocket
  serial_bridge.py        comunicação serial com o Arduino
  hardware_config.py      configuração e calibração da aquisição

arduino/
  six_tank_mega2560/      firmware da planta

index.html                página principal
SIMULATION_API.md         documentação da API de simulação
```

## Como usar

Requer Node.js e npm.

Na pasta do projeto:

```sh
npm install
npm run dev
```

Depois, abra:

```text
http://127.0.0.1:5173
```

A simulação funciona sem Python ou Arduino.

No Windows, também pode ser iniciada por:

```text
rodar_simulacao.bat
```

## Simulação

O modelo hidráulico é executado em JavaScript no navegador.

A interface permite ajustar bombas, válvulas e relés, acompanhar os níveis dos tanques e as vazões do sistema e visualizar tendências ao longo do tempo.

O painel **Código / API** permite executar códigos durante a simulação para realizar ensaios e alterar os atuadores programaticamente. A documentação está em `SIMULATION_API.md`.

Alguns parâmetros do modelo ainda são provisórios e serão ajustados a partir de medições e calibração da planta física.

## Planta física

A aquisição da planta utiliza um Arduino Mega 2560 conectado ao computador por USB/Serial.

O backend Python recebe os dados do Arduino e os envia para a interface através de WebSocket.

Para instalar as dependências:

```sh
python -m pip install -r python/requirements.txt
```

Para executar com dados simulados pelo backend:

```text
rodar_planta_mock.bat
```

Para utilizar a bancada:

```text
rodar_planta_hardware.bat
```

A configuração dos sensores, calibração e conexões está descrita em:

- `arduino/README.md`
- `arduino/six_tank_mega2560/CONEXOES_PLANTA_1.md`

## Interface

A interface possui:

- sinótico da planta;
- modos Simulação e Planta real;
- níveis e vazões;
- tendências temporais;
- registro de experimentos;
- exportação de dados em CSV;
- painel para execução de códigos sobre a simulação.

O desenho da planta é feito com JointJS.

## Observações

Os parâmetros hidráulicos, dimensões e fatores de calibração ainda estão em desenvolvimento. Os resultados da simulação não devem ser interpretados como uma reprodução já identificada experimentalmente da bancada.
