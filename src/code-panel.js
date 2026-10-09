import { ControllerRunner } from './controller-runner.js';

const example = `// Executado antes de cada passo. Tempo e dt em segundos.
// Exemplo: degrau de alimentação durante 10 segundos.
if (memory.start === undefined) {
  memory.start = plant.time;
  log('Ensaio iniciado');
}
plant.pumps.P3.set(plant.time - memory.start < 10 ? 0.5 : 0);
// Leitura: plant.tanks.H1.level (0–1), .height (m), .volume (L)
// Válvula: plant.valves.V3.set(0.4)
// Relé: plant.relays.X1A.set(true)
`;

export function createCodePanel({ isSimulationMode, startSimulation, pauseSimulation, resetSimulation }) {
    const panel = document.createElement('section');
    panel.className = 'code-panel';
    panel.hidden = true;
    panel.id = 'code-panel';
    panel.innerHTML = `<div class="experiment-panel-header"><div><h2>Laboratório de código</h2><p>JavaScript · somente simulação · API v1</p></div><button class="experiment-close-button" type="button" data-action="close" aria-label="Fechar painel de código" title="Fechar painel de código">×</button></div>
        <div class="code-content">
        <div class="code-toolbar"><button data-action="run">Executar</button><button data-action="pause">Pausar</button><button data-action="stop">Parar</button><button data-action="reset">Resetar ensaio</button><span role="status" class="code-status">Parado</span></div>
        <label for="controller-source">Código por ciclo — use memory para preservar variáveis</label>
        <textarea id="controller-source" spellcheck="false" aria-describedby="code-help"></textarea>
        <p id="code-help">Comandos de 0 a 1. Bombas: set(0) desliga; set(v) liga. Pausar congela o ensaio; Parar encerra o código e pausa a simulação. Resetar mantém o código e reinicia tempo e níveis. Alterações no texto valem na próxima execução.</p>
        <details><summary>Referência da API e isolamento</summary><p>plant.time e dt: segundos; tanks.H1…H6: level (0–1), height (m), volume (L). sensors.LT1…LT6 e FT1…FT6: cópias da telemetria (vazão em L/s). pumps.P1…P3.set(v); valves.MV/V1…V4/RV1/RV2/HV*.set(v); relays.X1A/X1B/X2A/X2B.set(true/false). log(texto) exibe mensagens. Comandos são aplicados juntos após um ciclo válido.</p><p>Worker separado, sem acesso ao DOM da HMI, com rede bloqueada por CSP. Limite de 1 segundo por ciclo. Use códigos de confiança: não é uma garantia contra exaustão de memória do navegador.</p></details>
        <div class="code-log-heading"><strong>Logs e erros</strong><button data-action="clear">Limpar</button></div><pre class="code-logs" role="log" aria-live="polite"></pre></div>`;
    document.querySelector('.main-area').append(panel);
    const button = document.createElement('button');
    button.className = 'code-open';
    button.textContent = 'Código / API';
    button.setAttribute('aria-controls', panel.id);
    button.setAttribute('aria-expanded', 'false');
    document.querySelector('.topbar').append(button);
    const toggle = visible => {
        if (visible) document.dispatchEvent(new CustomEvent('workspace-panel-open', { detail: 'code' }));
        panel.hidden = !visible;
        button.setAttribute('aria-expanded', String(visible));
    };
    document.addEventListener('workspace-panel-open', event => {
        if (event.detail !== 'code') toggle(false);
    });
    button.onclick = () => toggle(panel.hidden);
    const source = panel.querySelector('textarea');
    try { source.value = localStorage.getItem('six-tanks-code-v1') ?? example; } catch { source.value = example; }
    source.oninput = () => { try { localStorage.setItem('six-tanks-code-v1', source.value); } catch { /* Storage optional. */ } };
    const logs = panel.querySelector('.code-logs');
    const log = (text, error = false) => {
        logs.textContent = [...logs.textContent.split('\n').filter(Boolean), `${error ? 'ERRO: ' : ''}${text}`].slice(-100).join('\n');
        logs.scrollTop = logs.scrollHeight;
        if (error) pauseSimulation();
    };
    const labels = { stopped: 'Parado', starting: 'Iniciando', running: 'Executando', paused: 'Pausado', error: 'Erro' };
    const runner = new ControllerRunner({ onLog: log, onState: state => {
        panel.querySelector('.code-status').textContent = labels[state];
        panel.querySelector('[data-action="pause"]').textContent = state === 'paused' ? 'Continuar' : 'Pausar';
        source.readOnly = state === 'running' || state === 'starting' || state === 'paused';
    } });
    panel.addEventListener('click', event => {
        const action = event.target.closest('[data-action]')?.dataset.action;
        if (action === 'close') return toggle(false);
        if (action === 'clear') { logs.textContent = ''; return; }
        if (!action || !isSimulationMode()) return;
        if (action === 'run') { runner.start(source.value); startSimulation(); }
        if (action === 'pause') {
            if (runner.state === 'paused') { runner.resume(); startSimulation(); }
            else { runner.pause(); pauseSimulation(); }
        }
        if (action === 'stop' || action === 'reset') { runner.stop(); pauseSimulation(); }
        if (action === 'reset') resetSimulation();
    });
    return { runner, log, updateMode() {
        const enabled = isSimulationMode();
        if (!enabled) runner.stop();
        for (const control of panel.querySelectorAll('.code-toolbar button')) control.disabled = !enabled;
        panel.querySelector('.code-status').textContent = enabled ? labels[runner.state] : 'Indisponível na planta real';
    } };
}
