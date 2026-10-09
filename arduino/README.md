# Aquisição da planta física

O Mega 2560 lê os sensores e envia dados ao dashboard pelo caminho:

```text
Sensores LT/FT → Mega 2560 → USB/Serial → Python → WebSocket → HMI
```

Esta etapa é somente de aquisição. O firmware não aciona bombas, válvulas, relés ou servos. O backend HARDWARE rejeita comandos de atuação e a HMI real mantém os controles bloqueados.

## Configuração atual

As ligações registradas da Planta 1 estão em [CONEXOES_PLANTA_1.md](six_tank_mega2560/CONEXOES_PLANTA_1.md).

| Arquivo | Configuração |
| --- | --- |
| `acquisition_config.h` | `TEST_MODE = false`, Serial a 115200 baud, telemetria a cada 100 ms e janela de vazão de 500 ms |
| `lt_config.h` | LT1–LT6 em A0–A5; transmissão do ADC bruto |
| `ft_config.h` | FT1–FT6 por pulsos em D30–D35; fator nominal de 2580 pulsos/L |
| `ft_sensors.h` | Contagem das transições por amostragem a 4 kHz usando Timer1 |

O fator nominal dos FT ainda deve ser validado experimentalmente por sensor. O Timer1 fica reservado para aquisição; qualquer uso futuro desse temporizador precisa considerar essa configuração.

Cada canal FT aceita `FT_PULSE`, `FT_ANALOG` ou `FT_DISABLED`. Os seis IDs são canais lógicos: outra montagem pode ter menos sensores. Para um FT ausente, use `FT_DISABLED`; para LT ausente, use pino `-1`. FT analógico transmite `FTn_RAW` e exige calibração no Python para apresentar vazão.

## Dados sintéticos e calibração

Em `acquisition_config.h`, `TEST_MODE = true` gera dados sintéticos sem ler os pinos físicos. A máscara `FT_TEST_ENABLED` atualmente habilita os seis FT nesse modo. Volte a `false` para ler a bancada e grave novamente o firmware.

A calibração fica em [`python/hardware_config.py`](../python/hardware_config.py):

- `ADC_REFERENCE_V`: referência medida do ADC.
- `LT_CALIBRATION`: par ADC vazio/cheio para obter nível.
- `LT_PRESSURE_CALIBRATION`: tensão a zero kPa e volts por kPa, para converter tensão em pressão, altura e nível.
- `FT_ANALOG_CALIBRATION`: ADC de zero, ADC de referência e vazão de referência em L/min.

Valores ainda desconhecidos estão como `None`. Se os dois métodos LT forem configurados, o par ADC vazio/cheio define o nível. Altura e volume ainda dependem dos parâmetros geométricos provisórios do backend.

## Como executar

1. Abra `six_tank_mega2560/six_tank_mega2560.ino` na Arduino IDE, selecione Mega 2560 e a porta da placa, compile e envie.
2. Feche o Monitor Serial e conecte o Mega por USB.
3. Na raiz do projeto, execute `rodar_planta_hardware.bat`.
4. Se houver várias portas possíveis, escolha pela lista. Na HMI, selecione **Planta real → Conectar**.

O iniciador verifica dependências, inicia Python/Vite e abre o navegador. Ele não grava firmware. Um novo upload só é necessário na primeira utilização ou após alterações no firmware/configuração dos sensores. Ctrl+C no iniciador encerra os processos que ele abriu.

Sem placa, use `rodar_planta_mock.bat` para testar Python → HMI. Use `rodar_simulacao.bat` para executar apenas a simulação no navegador.

## Telemetria e ausência de dados

O startup envia `HELLO,MEGA2560,SIX_TANKS,1`; `PING` recebe `PONG`. Exemplo de frame:

```text
TELEMETRY,LT1_RAW=512,FT1=0.000,FT2_RAW=523,FT3=null
```

`FTn` está em L/min, `FTn_HZ` em Hz e `RAW` em unidades ADC. Campos ausentes, inválidos ou `null` não reaproveitam a leitura anterior. Sem calibração, o valor bruto pode estar disponível enquanto nível/vazão permanecem ausentes.

A HMI mostra **—**, o gráfico apresenta lacuna e o CSV deixa a célula vazia. Zero válido continua sendo zero. Após desconexão ou dois segundos sem telemetria, os valores são invalidados. O payload inclui FT RAW; o CSV atual mantém vazão e as colunas LT RAW.

## Problemas comuns

- **Sem porta:** confira cabo USB de dados e driver.
- **Porta ocupada:** feche Monitor Serial, IDE ou outro processo usando a placa.
- **Porta 8765 ocupada:** encerre o backend anterior antes de iniciar outro modo.
- **RAW disponível, valor ausente:** revise a calibração no Python.
- **Erro de configuração FT:** confira pinos válidos e duplicados.

Para conferir a aquisição em Python: `python -m unittest discover -s python -p test_acquisition.py`. Esse arquivo é independente dos antigos testes do frontend. A validação de pulsos, ruído e calibração deve ser feita também na bancada.
