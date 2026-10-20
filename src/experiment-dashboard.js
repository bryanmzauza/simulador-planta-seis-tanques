import { componentLabel } from './component-labels.js';
// DASHBOARD CIENTÍFICO / AQUISIÇÃO DE DADOS
/* Responsabilidades:
   - manter histórico temporal para visualização
   - desenhar tendências de LT1-LT6 e FT1-FT6
   - registrar sessões experimentais no navegador
   - exportar os dados registrados em CSV
   Não altera o modelo hidráulico nem envia comandos à planta.
   Funciona tanto em Simulação quanto em Planta real.
 */

const LEVEL_IDS = ['LT1', 'LT2', 'LT3', 'LT4', 'LT5', 'LT6'];
const FLOW_IDS = ['FT1', 'FT2', 'FT3', 'FT4', 'FT5', 'FT6'];
const PUMP_IDS = ['P1', 'P2', 'P3'];
const ACTUATED_VALVE_IDS = ['V1', 'V2', 'V3', 'V4'];
const THREE_WAY_IDS = ['X1A', 'X1B', 'X2A', 'X2B'];
const RECYCLE_IDS = ['RV1', 'RV2'];
const MANUAL_IDS = [
    'HV3_IN',
    'HV4_IN',
    'HV3_P1',
    'HV4_P2',
    'HV1_DRAIN',
    'HV2_DRAIN'
];

const SERIES_COLORS = [
    '#28658c',
    '#38755e',
    '#956b20',
    '#a74e59',
    '#785494',
    '#277e82',
    '#1c1d21',
    '#b45309',
    '#2563a8',
    '#6b7280',
    '#9333ea',
    '#c81e1e'
];

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function byId(collection, id) {
    return collection?.find(item => item.id === id) ?? null;
}

function finiteOrNull(value) {
    return Number.isFinite(value) ? value : null;
}

function csvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value).replace('.', ',') : '';
    }

    const text = String(value);

    if (/[;"\n\r]/.test(text)) {
        return `"${text.replaceAll('"', '""')}"`;
    }

    return text;
}

function timestampForFilename(date = new Date()) {
    const pad = value => String(value).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
    ].join('-') + '_' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join('-');
}


function sanitizeFilenamePart(value) {
    return String(value ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);
}

export class ExperimentDashboard {

    constructor(options = {}) {
        this.getPlant = options.getPlant ?? (() => null);
        this.getRuntime = options.getRuntime ?? (() => ({}));
        this.getMode = options.getMode ?? (() => 'simulation');

        this.sampleIntervalMs = 500;
        this.historyWindowSeconds = 30;
        this.followLatest = true;
        this.historyViewStart = null;
        this.maxHistorySeconds = 600;

        this.liveHistory = [];
        this.recordedRows = [];

        this.recording = false;
        this.recordingStartedAt = null;
        this.recordingStartedSourceTime = null;
        this.lastSampleAt = 0;
        this.lastMode = this.getMode();

        this.metric = 'levels';
        this.selectedSeries = new Set(LEVEL_IDS);

        // Limites operacionais provisórios para aviso visual.
        // Eles não atuam automaticamente em bombas/válvulas.
        this.lowLevelLimit = 10;
        this.highLevelLimit = 90;

        // Em modo real, consideramos a telemetria desatualizada
        // quando o backend não envia estado por este intervalo.
        this.staleDataMs = 2500;

        this.experimentName = '';
        this.experimentNotes = '';

        // Altura ajustável do painel de tendências.
        this.panelHeight = null;
        this.resizingPanel = false;
        this.resizeStartY = 0;
        this.resizeStartHeight = 0;

        this.createInterface();
        this.bindInterface();
        this.setupPanelResize();
        this.resizeObserver = new ResizeObserver(() => this.draw());
        this.resizeObserver.observe(this.canvas.parentElement);

        this.timer = window.setInterval(
            () => this.tick(),
            100
        );

        this.tick(true);
    }

    // INTERFACE

    createInterface() {
        const mainArea = document.querySelector('.main-area');

        if (!mainArea) {
            throw new Error('Elemento .main-area não encontrado.');
        }

        this.openButton = document.createElement('button');
        this.openButton.type = 'button';
        this.openButton.className = 'experiment-open-button';
        this.openButton.textContent = 'Tendências e dados';
        this.openButton.title = 'Abrir tendências e aquisição de dados';

        this.panel = document.createElement('section');
        this.panel.className = 'experiment-panel';
        this.panel.hidden = true;

        this.panel.innerHTML = `
            <div
                class="experiment-resize-handle"
                title="Arraste para cima ou para baixo para redimensionar"
            ></div>

            <div class="experiment-panel-header">
                <div>
                    <h2>Tendências e aquisição de dados</h2>
                    <p>Níveis, vazões, alarmes e registro experimental</p>
                </div>
                <button class="experiment-close-button" type="button" title="Fechar">×</button>
            </div>

            <div class="experiment-identification">
                <label>
                    Ensaio
                    <input
                        class="experiment-name-input"
                        type="text"
                        maxlength="60"
                        placeholder="Ex.: degrau P1 50%"
                    >
                </label>

                <label class="experiment-notes-label">
                    Observação
                    <input
                        class="experiment-notes-input"
                        type="text"
                        maxlength="160"
                        placeholder="Opcional"
                    >
                </label>
            </div>

            <div class="experiment-toolbar">
                <label>
                    Gráfico
                    <select class="experiment-metric-select">
                        <option value="levels">Níveis (%)</option>
                        <option value="flows">Vazões (L/min)</option>
                        <option value="loops">Malhas (PV, SP e MV)</option>
                    </select>
                </label>

                <label>
                    Janela
                    <select class="experiment-window-select">
                        <option value="30" selected>30 s</option>
                        <option value="60">60 s</option>
                        <option value="120">2 min</option>
                        <option value="300">5 min</option>
                        <option value="600">10 min</option>
                    </select>
                </label>

                <label>
                    Amostragem
                    <select class="experiment-sample-select">
                        <option value="100">0,1 s</option>
                        <option value="200">0,2 s</option>
                        <option value="500" selected>0,5 s</option>
                        <option value="1000">1 s</option>
                        <option value="2000">2 s</option>
                    </select>
                </label>

                <label>
                    Nível baixo
                    <input
                        class="experiment-low-limit"
                        type="number"
                        min="0"
                        max="99"
                        step="1"
                        value="10"
                    >
                </label>

                <label>
                    Nível alto
                    <input
                        class="experiment-high-limit"
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value="90"
                    >
                </label>

                <div class="experiment-record-actions">
                    <button class="experiment-record-button" type="button">Iniciar registro</button>
                    <button class="experiment-clear-button secondary" type="button">Limpar</button>
                    <button class="experiment-export-button secondary" type="button" disabled>Exportar CSV (BR)</button>
                </div>
            </div>

            <div class="experiment-status-row">
                <span class="experiment-record-dot"></span>
                <strong class="experiment-record-status">Sem registro ativo</strong>
                <span class="experiment-sample-count">0 amostras</span>
                <span class="experiment-mode-label"></span>
                <span class="experiment-quality-badge neutral">Qualidade: --</span>
            </div>

            <div class="experiment-alarm-area">
                <div class="experiment-alarm-summary">
                    <strong>Alarmes de nível</strong>
                    <span class="experiment-alarm-count">0 ativos</span>
                </div>
                <div class="experiment-level-status"></div>
            </div>

            <div class="experiment-series"></div>

            <div class="experiment-chart-wrap">
                <canvas class="experiment-chart"></canvas>
                <div class="experiment-chart-empty">Aguardando dados...</div>
            </div>

            <div class="experiment-history-navigation">
                <label for="experiment-history-position">Histórico</label>
                <input id="experiment-history-position" class="experiment-history-slider" type="range" min="0" max="0" step="0.1" value="0" aria-label="Navegar pelo histórico do gráfico">
                <span class="experiment-history-range"></span>
                <button type="button" class="experiment-follow-latest">Acompanhar atual</button>
            </div>

            <p class="experiment-footnote">
                Alarmes são apenas avisos visuais. FT1–FT6 continuam válidos para a simulação;
                a presença e o posicionamento dos sensores de vazão na planta real serão confirmados depois.
            </p>
        `;

        mainArea.appendChild(this.openButton);
        mainArea.appendChild(this.panel);

        this.closeButton = this.panel.querySelector('.experiment-close-button');
        this.resizeHandle = this.panel.querySelector('.experiment-resize-handle');
        this.metricSelect = this.panel.querySelector('.experiment-metric-select');
        this.windowSelect = this.panel.querySelector('.experiment-window-select');
        this.historySlider = this.panel.querySelector('.experiment-history-slider');
        this.historyRange = this.panel.querySelector('.experiment-history-range');
        this.followButton = this.panel.querySelector('.experiment-follow-latest');
        this.sampleSelect = this.panel.querySelector('.experiment-sample-select');
        this.nameInput = this.panel.querySelector('.experiment-name-input');
        this.notesInput = this.panel.querySelector('.experiment-notes-input');
        this.lowLimitInput = this.panel.querySelector('.experiment-low-limit');
        this.highLimitInput = this.panel.querySelector('.experiment-high-limit');
        this.recordButton = this.panel.querySelector('.experiment-record-button');
        this.clearButton = this.panel.querySelector('.experiment-clear-button');
        this.exportButton = this.panel.querySelector('.experiment-export-button');
        this.statusDot = this.panel.querySelector('.experiment-record-dot');
        this.statusText = this.panel.querySelector('.experiment-record-status');
        this.sampleCount = this.panel.querySelector('.experiment-sample-count');
        this.modeLabel = this.panel.querySelector('.experiment-mode-label');
        this.qualityBadge = this.panel.querySelector('.experiment-quality-badge');
        this.alarmCount = this.panel.querySelector('.experiment-alarm-count');
        this.levelStatusContainer = this.panel.querySelector('.experiment-level-status');
        this.seriesContainer = this.panel.querySelector('.experiment-series');
        this.canvas = this.panel.querySelector('.experiment-chart');
        this.emptyLabel = this.panel.querySelector('.experiment-chart-empty');
        this.ctx = this.canvas.getContext('2d');

        this.createSeriesControls();
    }

    bindInterface() {
        this.canvas.title = 'Roda: navegar no tempo · Ctrl + roda: ajustar janela';
        this.canvas.addEventListener('wheel', event => {
            const delta = event.deltaY || event.deltaX;
            if (!delta) return;
            event.preventDefault();
            if (event.ctrlKey) {
                const windows = [...this.windowSelect.options].map(option => Number(option.value));
                const index = windows.indexOf(this.historyWindowSeconds);
                const next = clamp(index + Math.sign(delta), 0, windows.length - 1);
                this.historyWindowSeconds = windows[next];
                this.windowSelect.value = String(windows[next]);
            } else if (this.liveHistory.length) {
                const first = this.liveHistory[0].displayTime;
                const last = this.liveHistory[this.liveHistory.length - 1].displayTime;
                const latestStart = Math.max(first, last - this.historyWindowSeconds);
                const current = this.followLatest ? latestStart : (this.historyViewStart ?? first);
                this.historyViewStart = clamp(current - Math.sign(delta) * this.historyWindowSeconds * 0.1, first, latestStart);
                this.followLatest = this.historyViewStart >= latestStart;
            }
            this.draw();
        }, { passive: false });
        this.historySlider.addEventListener('input', () => {
            this.historyViewStart = Number(this.historySlider.value);
            this.followLatest = this.historyViewStart >= Number(this.historySlider.max) - 0.05;
            this.draw();
        });
        this.followButton.addEventListener('click', () => {
            this.followLatest = true;
            this.draw();
        });
        document.addEventListener('workspace-panel-open', event => {
            if (event.detail !== 'trends') {
                this.panel.hidden = true;
                this.openButton.hidden = false;
            }
        });
        this.openButton.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('workspace-panel-open', { detail: 'trends' }));
            this.panel.hidden = false;
            this.openButton.hidden = true;
            requestAnimationFrame(() => this.draw());
        });

        this.closeButton.addEventListener('click', () => {
            this.panel.hidden = true;
            this.openButton.hidden = false;
        });

        this.metricSelect.addEventListener('change', () => {
            this.metric = this.metricSelect.value;
            this.selectedSeries = new Set(this.seriesIds());
            this.createSeriesControls();
            this.draw();
        });

        this.windowSelect.addEventListener('change', () => {
            this.historyWindowSeconds = Number(this.windowSelect.value);
            this.draw();
        });

        this.sampleSelect.addEventListener('change', () => {
            this.sampleIntervalMs = Number(this.sampleSelect.value);
            this.lastSampleAt = 0;
        });

        this.nameInput.addEventListener('input', () => {
            this.experimentName = this.nameInput.value.trim();
        });

        this.notesInput.addEventListener('input', () => {
            this.experimentNotes = this.notesInput.value.trim();
        });

        const updateLevelLimits = () => {
            let low = Number(this.lowLimitInput.value);
            let high = Number(this.highLimitInput.value);

            low = clamp(Number.isFinite(low) ? low : 10, 0, 99);
            high = clamp(Number.isFinite(high) ? high : 90, 1, 100);

            if (low >= high) {
                if (document.activeElement === this.lowLimitInput) {
                    low = Math.max(0, high - 1);
                } else {
                    high = Math.min(100, low + 1);
                }
            }

            this.lowLevelLimit = low;
            this.highLevelLimit = high;
            this.lowLimitInput.value = String(low);
            this.highLimitInput.value = String(high);

            this.updateAlarmAndQualityInterface();
            this.draw();
        };

        this.lowLimitInput.addEventListener('change', updateLevelLimits);
        this.highLimitInput.addEventListener('change', updateLevelLimits);

        this.recordButton.addEventListener('click', () => {
            if (this.recording) {
                this.stopRecording();
            } else {
                this.startRecording();
            }
        });

        this.clearButton.addEventListener('click', () => {
            this.clearData();
        });

        this.exportButton.addEventListener('click', () => {
            this.exportCsv();
        });
    }

    // SÉRIES
    /* Níveis e vazões têm IDs fixos; as malhas dependem do cenário ativo:
       uma série para PV, SP e MV de cada malha (id "TAG:pv" etc.). */

    seriesIds() {
        if (this.metric === 'levels') return LEVEL_IDS;
        if (this.metric === 'flows') return FLOW_IDS;
        const loops = this.getRuntime()?.loops ?? {};
        return Object.keys(loops).flatMap(tag => [`${tag}:pv`, `${tag}:sp`, `${tag}:mv`]);
    }

    seriesLabel(id) {
        if (this.metric !== 'loops') return componentLabel(id);
        const [tag, field] = id.split(':');
        return `${tag} ${field.toUpperCase()}`;
    }

    sampleValue(sample, id) {
        if (this.metric === 'levels') return sample.levels[id];
        if (this.metric === 'flows') return sample.flows[id];
        const [tag, field] = id.split(':');
        const loop = sample.loops?.[tag];
        if (!loop) return null;
        if (field === 'mv') return finiteOrNull(loop.mv === null ? null : loop.mv * 100);
        return finiteOrNull(loop[field]);
    }

    createSeriesControls() {
        const ids = this.seriesIds();
        this.seriesSignature = ids.join('|');

        this.seriesContainer.innerHTML = '';

        ids.forEach((id, index) => {
            const label = document.createElement('label');
            label.className = 'experiment-series-item';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = this.selectedSeries.has(id);
            input.dataset.series = id;

            const color = document.createElement('span');
            color.className = 'experiment-series-color';
            color.style.background = SERIES_COLORS[index];

            const text = document.createElement('span');
            text.textContent = this.seriesLabel(id);

            input.addEventListener('change', () => {
                if (input.checked) {
                    this.selectedSeries.add(id);
                } else {
                    this.selectedSeries.delete(id);
                }
                this.draw();
            });

            label.append(input, color, text);
            this.seriesContainer.appendChild(label);
        });
    }

    // AQUISIÇÃO

    tick(force = false) {
        const now = performance.now();
        const mode = this.getMode();

        if (mode !== this.lastMode) {
            if (this.recording) {
                this.stopRecording('Registro encerrado: modo alterado');
            }

            this.liveHistory = [];
            this.followLatest = true;
            this.historyViewStart = null;
            this.lastMode = mode;
            this.lastSampleAt = 0;
        }

        this.updateModeLabel();
        this.updateAlarmAndQualityInterface();

        if (!force && now - this.lastSampleAt < this.sampleIntervalMs) {
            return;
        }

        this.lastSampleAt = now;

        const sample = this.captureSample();

        if (!sample) {
            return;
        }

        if (this.liveHistory.length && sample.displayTime < this.liveHistory[this.liveHistory.length - 1].displayTime) {
            this.liveHistory = [];
            this.followLatest = true;
            this.historyViewStart = null;
        }
        this.liveHistory.push(sample);
        this.trimLiveHistory(sample.displayTime);

        if (this.recording && this.canRecordCurrentState(sample)) {
            this.recordedRows.push(sample);
            this.updateRecordingInterface();
        }

        this.draw();
    }

    canRecordCurrentState(sample) {
        if (sample.mode === 'simulation') {
            return Boolean(sample.running);
        }

        return Boolean(sample.connected);
    }

    captureSample() {
        const plant = this.getPlant();
        const runtime = this.getRuntime() ?? {};
        const mode = this.getMode();

        if (!plant) {
            return null;
        }

        const nowDate = new Date();
        const nowPerformance = performance.now();

        const sourceTime = Number.isFinite(runtime.time)
            ? runtime.time
            : null;

        const displayTime = mode === 'simulation' && sourceTime !== null
            ? sourceTime
            : nowPerformance / 1000;

        const sample = {
            timestamp: nowDate.toISOString(),
            performanceTime: nowPerformance,
            displayTime,
            sourceTime,
            mode,
            running: Boolean(runtime.running),
            connected: Boolean(runtime.connected),
            dataQuality: this.getDataQuality(runtime, mode),
            levels: {},
            pressures: {},
            voltages: {},
            raws: {},
            flows: {},
            pumps: {},
            mainValve: finiteOrNull(plant.mainValve?.opening),
            actuatedValves: {},
            threeWayValves: {},
            recycleValves: {},
            manualValves: {},
            scenario: runtime.scenario ?? null,
            loops: {}
        };

        for (const [tag, loop] of Object.entries(runtime.loops ?? {})) {
            sample.loops[tag] = {
                pv: finiteOrNull(loop.pv),
                sp: finiteOrNull(loop.sp),
                mv: finiteOrNull(loop.mv),
                mode: loop.effectiveMode ?? loop.mode ?? null,
                unit: loop.unit ?? ''
            };
        }

        LEVEL_IDS.forEach(id => {
            const sensor = byId(plant.levelSensors, id);
            sample.levels[id] = finiteOrNull(sensor?.level);
            sample.pressures[id] = finiteOrNull(sensor?.pressure);
            sample.voltages[id] = finiteOrNull(sensor?.voltage);
            sample.raws[id] = finiteOrNull(sensor?.raw);
        });

        FLOW_IDS.forEach(id => {
            const sensor = byId(plant.flowSensors, id);
            sample.flows[id] = finiteOrNull(sensor?.flow);
        });

        PUMP_IDS.forEach(id => {
            const pump = byId(plant.pumps, id);
            sample.pumps[id] = {
                power: pump ? (pump.power ? 1 : 0) : null,
                command: finiteOrNull(pump?.command)
            };
        });

        ACTUATED_VALVE_IDS.forEach(id => {
            sample.actuatedValves[id] = finiteOrNull(
                byId(plant.actuatedValves, id)?.opening
            );
        });

        THREE_WAY_IDS.forEach(id => {
            const valve = byId(plant.threeWayValves, id);
            sample.threeWayValves[id] = valve
                ? (valve.state ? 1 : 0)
                : null;
        });

        RECYCLE_IDS.forEach(id => {
            sample.recycleValves[id] = finiteOrNull(
                byId(plant.recycleValves, id)?.opening
            );
        });

        MANUAL_IDS.forEach(id => {
            sample.manualValves[id] = finiteOrNull(
                byId(plant.manualValves, id)?.opening
            );
        });

        return sample;
    }

    trimLiveHistory(currentTime) {
        const minimumTime = currentTime - this.maxHistorySeconds;

        while (
            this.liveHistory.length > 2 &&
            this.liveHistory[0].displayTime < minimumTime
        ) {
            this.liveHistory.shift();
        }
    }

    // REDIMENSIONAMENTO VERTICAL DO PAINEL

    setupPanelResize() {
        if (!this.resizeHandle || !this.panel) {
            return;
        }

        const storedHeight =
            Number(
                localStorage.getItem(
                    'six-tank-experiment-panel-height'
                )
            );

        if (
            Number.isFinite(storedHeight) &&
            storedHeight > 0
        ) {
            this.setPanelHeight(storedHeight);
        }

        const onPointerMove = event => {
            if (!this.resizingPanel) {
                return;
            }

            const deltaY =
                this.resizeStartY -
                event.clientY;

            this.setPanelHeight(
                this.resizeStartHeight +
                deltaY
            );
        };

        const stopResize = () => {
            if (!this.resizingPanel) {
                return;
            }

            this.resizingPanel = false;

            document.body.classList.remove(
                'experiment-panel-resizing'
            );

            if (
                Number.isFinite(
                    this.panelHeight
                )
            ) {
                localStorage.setItem(
                    'six-tank-experiment-panel-height',
                    String(
                        Math.round(
                            this.panelHeight
                        )
                    )
                );
            }
        };

        this.resizeHandle.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.button !==
                    0
                ) {
                    return;
                }

                event.preventDefault();

                this.resizingPanel = true;
                this.resizeStartY =
                    event.clientY;

                this.resizeStartHeight =
                    this.panel
                        .getBoundingClientRect()
                        .height;

                document.body.classList.add(
                    'experiment-panel-resizing'
                );

                this.resizeHandle
                    .setPointerCapture?.(
                        event.pointerId
                    );
            }
        );

        window.addEventListener(
            'pointermove',
            onPointerMove
        );

        window.addEventListener(
            'pointerup',
            stopResize
        );

        window.addEventListener(
            'pointercancel',
            stopResize
        );

        window.addEventListener(
            'resize',
            () => {
                if (
                    Number.isFinite(
                        this.panelHeight
                    )
                ) {
                    this.setPanelHeight(
                        this.panelHeight
                    );
                }
            }
        );
    }

    setPanelHeight(height) {
        if (
            !this.panel ||
            !Number.isFinite(
                height
            )
        ) {
            return;
        }

        const viewportHeight =
            window.innerHeight ||
            document.documentElement.clientHeight ||
            800;

        const minHeight =
            Math.min(
                380,
                Math.max(
                    280,
                    viewportHeight *
                    0.34
                )
            );

        const maxHeight =
            Math.max(
                minHeight,
                viewportHeight -
                92
            );

        const boundedHeight =
            clamp(
                height,
                minHeight,
                maxHeight
            );

        this.panelHeight =
            boundedHeight;

        this.panel.style.height =
            `${Math.round(
                boundedHeight
            )}px`;

        this.panel.style.maxHeight =
            `${Math.round(
                maxHeight
            )}px`;

        requestAnimationFrame(
            () => this.draw()
        );
    }

    // QUALIDADE DOS DADOS E ALARMES

    getDataQuality(runtime = this.getRuntime() ?? {}, mode = this.getMode()) {
        if (mode === 'simulation') {
            return runtime.running
                ? 'SIMULATION_OK'
                : 'SIMULATION_PAUSED';
        }

        if (!runtime.connected) {
            return 'DISCONNECTED';
        }

        if (
            Number.isFinite(runtime.lastUpdate) &&
            Date.now() - runtime.lastUpdate > this.staleDataMs
        ) {
            return 'STALE';
        }

        return 'REALTIME_OK';
    }

    getLevelAlarmState(value) {
        if (!Number.isFinite(value)) {
            return 'NO_DATA';
        }

        if (value <= this.lowLevelLimit) {
            return 'LOW';
        }

        if (value >= this.highLevelLimit) {
            return 'HIGH';
        }

        return 'NORMAL';
    }

    updateAlarmAndQualityInterface() {
        if (!this.qualityBadge || !this.levelStatusContainer) {
            return;
        }

        const runtime = this.getRuntime() ?? {};
        const mode = this.getMode();
        const quality = this.getDataQuality(runtime, mode);

        const qualityLabels = {
            SIMULATION_OK: ['Qualidade: simulação OK', 'ok'],
            SIMULATION_PAUSED: ['Qualidade: simulação pausada', 'neutral'],
            DISCONNECTED: ['Qualidade: desconectado', 'warning'],
            STALE: ['Qualidade: dados desatualizados', 'danger'],
            REALTIME_OK: ['Qualidade: tempo real OK', 'ok']
        };

        const [qualityText, qualityClass] =
            qualityLabels[quality] ?? ['Qualidade: --', 'neutral'];

        this.qualityBadge.textContent = qualityText;
        this.qualityBadge.className =
            `experiment-quality-badge ${qualityClass}`;

        const plant = this.getPlant();

        this.levelStatusContainer.innerHTML = '';

        let activeAlarms = 0;

        LEVEL_IDS.forEach(id => {
            const sensor = byId(plant?.levelSensors, id);
            const value = finiteOrNull(sensor?.level);
            const state = this.getLevelAlarmState(value);

            if (state === 'LOW' || state === 'HIGH') {
                activeAlarms += 1;
            }

            const item = document.createElement('div');
            item.className =
                `experiment-level-state ${state.toLowerCase()}`;

            const valueText = Number.isFinite(value)
                ? `${value.toFixed(1).replace('.', ',')}%`
                : '--';

            const stateLabels = {
                LOW: 'BAIXO',
                HIGH: 'ALTO',
                NORMAL: 'OK',
                NO_DATA: 'SEM DADO'
            };

            item.innerHTML = `
                <strong>${componentLabel(id)}</strong>
                <span>${valueText}</span>
                <em>${stateLabels[state]}</em>
            `;

            this.levelStatusContainer.appendChild(item);
        });

        this.alarmCount.textContent =
            `${activeAlarms} ${activeAlarms === 1 ? 'ativo' : 'ativos'}`;

        this.alarmCount.classList.toggle(
            'active',
            activeAlarms > 0
        );
    }

    // REGISTRO

    startRecording() {
        this.recordedRows = [];
        this.experimentName = this.nameInput.value.trim();
        this.experimentNotes = this.notesInput.value.trim();
        this.recording = true;
        this.recordingStartedAt = performance.now();

        const runtime = this.getRuntime() ?? {};
        this.recordingStartedSourceTime = Number.isFinite(runtime.time)
            ? runtime.time
            : null;

        this.updateRecordingInterface();
    }

    stopRecording(message = null) {
        this.recording = false;
        this.updateRecordingInterface(message);
    }

    clearData() {
        this.recording = false;
        this.recordedRows = [];
        this.liveHistory = [];
        this.recordingStartedAt = null;
        this.followLatest = true;
        this.historyViewStart = null;
        this.recordingStartedSourceTime = null;
        this.updateRecordingInterface();
        this.draw();
    }

    updateRecordingInterface(message = null) {
        this.recordButton.textContent = this.recording
            ? 'Parar registro'
            : 'Iniciar registro';

        this.recordButton.classList.toggle('recording', this.recording);
        this.statusDot.classList.toggle('active', this.recording);

        if (message) {
            this.statusText.textContent = message;
        } else if (this.recording) {
            this.statusText.textContent = 'Registrando experimento';
        } else if (this.recordedRows.length > 0) {
            this.statusText.textContent = 'Registro finalizado';
        } else {
            this.statusText.textContent = 'Sem registro ativo';
        }

        const count = this.recordedRows.length;
        this.sampleCount.textContent = `${count} ${count === 1 ? 'amostra' : 'amostras'}`;
        this.exportButton.disabled = count === 0;
    }

    updateModeLabel() {
        const mode = this.getMode();
        const runtime = this.getRuntime() ?? {};

        if (mode === 'simulation') {
            this.modeLabel.textContent = runtime.running
                ? 'Simulação em execução'
                : 'Simulação pausada';
            return;
        }

        this.modeLabel.textContent = runtime.connected
            ? 'Planta real conectada'
            : 'Planta real desconectada';
    }

    exportCsv() {
        if (this.recordedRows.length === 0) {
            return;
        }

        // Malhas vistas ao longo do registro (o cenário pode ter mudado)
        const loopTags = [];
        for (const sample of this.recordedRows) {
            for (const tag of Object.keys(sample.loops ?? {})) {
                if (!loopTags.includes(tag)) loopTags.push(tag);
            }
        }

        const headers = [
            'timestamp_iso',
            'elapsed_s',
            'source_time_s',
            'experiment_name',
            'experiment_notes',
            'data_quality',
            'low_level_limit_pct',
            'high_level_limit_pct',
            'mode',
            'running',
            'connected',
            ...LEVEL_IDS.flatMap(id => [
                `${id}_level_pct`,
                `${id}_pressure_kpa`,
                `${id}_voltage_v`,
                `${id}_raw`,
                `${id}_alarm`
            ]),
            ...FLOW_IDS.map(id => `${id}_flow_l_min`),
            ...PUMP_IDS.flatMap(id => [
                `${id}_power`,
                `${id}_command`
            ]),
            'MV_opening',
            ...ACTUATED_VALVE_IDS.map(id => `${id}_opening`),
            ...THREE_WAY_IDS.map(id => `${id}_state`),
            ...RECYCLE_IDS.map(id => `${id}_opening`),
            ...MANUAL_IDS.map(id => `${id}_opening`),
            'scenario',
            ...loopTags.flatMap(tag => [
                `${tag}_pv`,
                `${tag}_sp`,
                `${tag}_mv`,
                `${tag}_mode`
            ])
        ];

        const first = this.recordedRows[0];

        const rows = this.recordedRows.map(sample => {
            const elapsedSeconds = (
                sample.performanceTime -
                first.performanceTime
            ) / 1000;

            return [
                sample.timestamp,
                elapsedSeconds,
                sample.sourceTime,
                this.experimentName,
                this.experimentNotes,
                sample.dataQuality,
                this.lowLevelLimit,
                this.highLevelLimit,
                sample.mode,
                sample.running ? 1 : 0,
                sample.connected ? 1 : 0,
                ...LEVEL_IDS.flatMap(id => [
                    sample.levels[id],
                    sample.pressures[id],
                    sample.voltages[id],
                    sample.raws[id],
                    this.getLevelAlarmState(sample.levels[id])
                ]),
                ...FLOW_IDS.map(id => sample.flows[id]),
                ...PUMP_IDS.flatMap(id => [
                    sample.pumps[id]?.power ?? null,
                    sample.pumps[id]?.command ?? null
                ]),
                sample.mainValve,
                ...ACTUATED_VALVE_IDS.map(id => sample.actuatedValves[id]),
                ...THREE_WAY_IDS.map(id => sample.threeWayValves[id]),
                ...RECYCLE_IDS.map(id => sample.recycleValves[id]),
                ...MANUAL_IDS.map(id => sample.manualValves[id]),
                sample.scenario ?? '',
                ...loopTags.flatMap(tag => [
                    sample.loops?.[tag]?.pv ?? null,
                    sample.loops?.[tag]?.sp ?? null,
                    sample.loops?.[tag]?.mv ?? null,
                    sample.loops?.[tag]?.mode ?? ''
                ])
            ];
        });

        const csv = [
            headers,
            ...rows
        ]
            .map(row => row.map(csvValue).join(';'))
            .join('\r\n');

        const blob = new Blob(
            ['\ufeff', csv],
            { type: 'text/csv;charset=utf-8' }
        );

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const namePart = sanitizeFilenamePart(this.experimentName);
        const nameSuffix = namePart ? `_${namePart}` : '';
        anchor.download =
            `seis-tanques_${this.lastMode}${nameSuffix}_${timestampForFilename()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }

    // GRÁFICO

    draw() {
        if (this.panel.hidden) {
            return;
        }

        const rect = this.canvas.parentElement.getBoundingClientRect();
        const width = Math.max(300, Math.floor(rect.width));
        const height = Math.max(220, Math.floor(rect.height));
        const dpr = window.devicePixelRatio || 1;

        if (
            this.canvas.width !== Math.floor(width * dpr) ||
            this.canvas.height !== Math.floor(height * dpr)
        ) {
            this.canvas.width = Math.floor(width * dpr);
            this.canvas.height = Math.floor(height * dpr);
            this.canvas.style.width = `${width}px`;
            this.canvas.style.height = `${height}px`;
        }

        const ctx = this.ctx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const latestTime = this.liveHistory.length > 0
            ? this.liveHistory[this.liveHistory.length - 1].displayTime
            : 0;

        const firstTime = this.liveHistory[0]?.displayTime ?? 0;
        const latestStart = Math.max(firstTime, latestTime - this.historyWindowSeconds);
        const minimumTime = this.followLatest
            ? latestStart
            : clamp(this.historyViewStart ?? firstTime, firstTime, latestStart);
        const maximumTime = minimumTime + this.historyWindowSeconds;
        this.historyViewStart = minimumTime;
        this.historySlider.min = String(firstTime);
        this.historySlider.max = String(latestStart);
        this.historySlider.value = String(minimumTime);
        this.historySlider.disabled = latestStart <= firstTime;
        this.followButton.disabled = this.followLatest;
        const seconds = value => value.toFixed(1).replace('.', ',');
        this.historyRange.textContent = `${seconds(minimumTime)}–${seconds(maximumTime)} s · ${this.followLatest ? 'Atual' : 'Histórico'}`;
        this.historySlider.setAttribute('aria-valuetext', this.historyRange.textContent);
        const visible = this.liveHistory.filter(
            sample => sample.displayTime >= minimumTime && sample.displayTime <= maximumTime
        );

        if (this.metric === 'loops' && this.seriesIds().join('|') !== this.seriesSignature) {
            this.selectedSeries = new Set(this.seriesIds());
            this.createSeriesControls();
        }
        const ids = this.seriesIds();
        const selectedIds = ids.filter(id => this.selectedSeries.has(id));

        if (visible.length < 2 || selectedIds.length === 0) {
            this.emptyLabel.hidden = false;
            return;
        }

        this.emptyLabel.hidden = true;

        const padding = {
            left: 54,
            right: 16,
            top: 14,
            bottom: 34
        };

        const plotWidth = width - padding.left - padding.right;
        const plotHeight = height - padding.top - padding.bottom;

        let yMin = this.metric === 'levels' ? -5 : 0;
        let yMax = this.metric === 'levels' ? 105 : 100;

        if (this.metric === 'flows' || this.metric === 'loops') {
            const values = [];

            visible.forEach(sample => {
                selectedIds.forEach(id => {
                    // MV (em %) fica fora da escala automática: usa a escala cheia
                    if (this.metric === 'loops' && id.endsWith(':mv')) return;
                    const value = this.sampleValue(sample, id);
                    if (Number.isFinite(value)) {
                        values.push(value);
                    }
                });
            });

            const maximum = values.length > 0 ? Math.max(...values) : 1;
            yMax = Math.max(1, maximum * 1.15);
        }

        const xStart = minimumTime;
        const xEnd = maximumTime;

        const xToPx = x => padding.left + (
            (x - xStart) /
            (xEnd - xStart)
        ) * plotWidth;

        const yToPx = y => padding.top + plotHeight - (
            (clamp(y, yMin, yMax) - yMin) /
            (yMax - yMin)
        ) * plotHeight;

        ctx.font = '10px Inter, system-ui, sans-serif';
        ctx.lineWidth = 1;

        // Grade horizontal + escala Y.
        for (let index = 0; index <= 5; index += 1) {
            const ratio = index / 5;
            const value = this.metric === 'levels' ? 100 - ratio * 100 : yMax - ratio * (yMax - yMin);
            const y = yToPx(value);

            ctx.strokeStyle = 'rgba(100, 125, 138, 0.18)';
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = '#54616a';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(
                this.metric === 'levels'
                    ? `${Math.round(value)}%`
                    : value.toFixed(yMax < 10 ? 1 : 0).replace('.', ','),
                padding.left - 8,
                y
            );
        }

        // Grade vertical + tempo relativo ao ponto mais recente.
        for (let index = 0; index <= 4; index += 1) {
            const ratio = index / 4;
            const x = padding.left + ratio * plotWidth;
            const time = xStart + ratio * (xEnd - xStart);
            const relative = time - latestTime;

            ctx.strokeStyle = 'rgba(100, 125, 138, 0.13)';
            ctx.beginPath();
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, padding.top + plotHeight);
            ctx.stroke();

            ctx.fillStyle = '#54616a';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(
                Math.abs(relative) < 0.5
                    ? 'agora'
                    : `${seconds(time)} s`,
                x,
                padding.top + plotHeight + 8
            );
        }

        // Eixos.
        ctx.strokeStyle = '#7c878e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + plotHeight);
        ctx.lineTo(width - padding.right, padding.top + plotHeight);
        ctx.stroke();

        // Limites de nível.
        if (this.metric === 'levels') {
            const drawLimit = (value, label) => {
                const y = yToPx(value);

                ctx.save();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = 'rgba(230, 173, 82, 0.68)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = '#855b18';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'bottom';
                ctx.fillText(
                    `${label} ${value.toFixed(0).replace('.', ',')}%`,
                    width - padding.right - 3,
                    y - 2
                );
            };

            drawLimit(this.lowLevelLimit, 'baixo');
            drawLimit(this.highLevelLimit, 'alto');
        }

        // Séries.
        selectedIds.forEach(id => {
            const index = ids.indexOf(id);
            ctx.strokeStyle = SERIES_COLORS[index];
            ctx.lineWidth = 2;
            ctx.beginPath();

            let started = false;

            // MV das malhas: 0 a 100 % mapeado na altura cheia do gráfico, tracejada
            const isMv = this.metric === 'loops' && id.endsWith(':mv');
            ctx.setLineDash(isMv ? [4, 3] : []);

            visible.forEach(sample => {
                let value = this.sampleValue(sample, id);
                if (isMv && Number.isFinite(value)) value = yMin + (value / 100) * (yMax - yMin);

                if (!Number.isFinite(value)) {
                    started = false;
                    return;
                }

                const x = xToPx(sample.displayTime);
                const y = yToPx(value);

                if (!started) {
                    ctx.moveTo(x, y);
                    started = true;
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();
            ctx.setLineDash([]);
        });

        if (this.metric === 'loops') {
            ctx.fillStyle = '#54616a';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillText('MV tracejada: 0 a 100 % na altura do gráfico', width - padding.right - 3, padding.top + 2);
        }
    }
}
