// SINÓTICO (P&ID AO VIVO)
/* Desenha o fluxograma da planta em SVG com a mesma geometria e as mesmas
   tags do P&ID (modelica/pid_modelo_6tanques_v1.html) e o anima com o
   estado recebido do backend: nível nos vasos, vazão nos tubos, bombas
   ligadas, abertura das válvulas, porta ativa das XV, valores nos balões
   dos instrumentos e malhas de controle do cenário ativo.

   Convenções visuais (ISA-101 sobre a paleta do P&ID): o normal é cinza e
   branco; cor só para água em movimento, sinais de controle, modo MAN e
   alarmes. Cada estado também tem forma ou texto, não só cor.

   Este módulo só recebe dados por update() e emite seleções por onSelect:
   nunca envia comandos. */

import { isaTag, componentDescription } from './component-labels.js';

const NS = 'http://www.w3.org/2000/svg';
const VIEWBOX = '0 -4 1400 968';

// GEOMETRIA (coordenadas do P&ID)

const TANKS = {
    H5: { x: 170, y: 130 }, H6: { x: 1110, y: 130 },
    H3: { x: 170, y: 470 }, H4: { x: 1110, y: 470 },
    H1: { x: 480, y: 470 }, H2: { x: 800, y: 470 }
};

const PUMPS = {
    P3: { x: 700, y: 800, out: 'up', label: [728, 805, 'start'], status: [728, 820, 'start'] },
    P1: { x: 230, y: 790, out: 'right', label: [230, 830, 'middle'], status: [230, 845, 'middle'] },
    P2: { x: 1170, y: 790, out: 'left', label: [1170, 830, 'middle'], status: [1170, 845, 'middle'] }
};

const CONTROL_VALVES = {
    V1: { x: 600, y: 215, vert: false, dir: 'up', label: [600, 241, 'middle'], value: [600, 254, 'middle'] },
    V2: { x: 800, y: 215, vert: false, dir: 'up', label: [800, 241, 'middle'], value: [800, 254, 'middle'] },
    V3: { x: 430, y: 700, vert: true, dir: 'left', label: [446, 704, 'start'], value: [446, 717, 'start'] },
    V4: { x: 970, y: 700, vert: true, dir: 'right', label: [954, 704, 'end'], value: [954, 717, 'end'] }
};

const THREE_WAY = {
    X1: {
        x: 470, y: 215, ports: { right: 'in', left: 'A', up: 'B' },
        label: [484, 248, 'start'], value: [484, 261, 'start'],
        portLabels: [['A', 452, 207, 'end'], ['B', 480, 199, 'start']]
    },
    X2: {
        x: 930, y: 215, ports: { left: 'in', up: 'A', right: 'B' },
        label: [916, 248, 'end'], value: [916, 261, 'end'],
        portLabels: [['A', 920, 199, 'end'], ['B', 948, 207, 'start']]
    }
};

const MANUAL_VALVES = {
    MV: { x: 700, y: 725, vert: true, label: [718, 729, 'start'], value: [718, 741, 'start'] },
    HV3_IN: { x: 230, y: 350, vert: true, label: [214, 354, 'end'], value: [214, 366, 'end'] },
    HV4_IN: { x: 1170, y: 350, vert: true, label: [1186, 354, 'start'], value: [1186, 366, 'start'] },
    HV1_DRAIN: { x: 540, y: 745, vert: true, label: [556, 749, 'start'], value: [556, 761, 'start'] },
    HV2_DRAIN: { x: 860, y: 745, vert: true, label: [844, 749, 'end'], value: [844, 761, 'end'] },
    HV3_P1: { x: 230, y: 690, vert: true, label: [246, 694, 'start'], value: [246, 706, 'start'] },
    HV4_P2: { x: 1170, y: 690, vert: true, label: [1154, 694, 'end'], value: [1154, 706, 'end'] },
    RV1: { x: 320, y: 600, vert: true, label: [304, 656, 'end'], value: [304, 668, 'end'] },
    RV2: { x: 1080, y: 600, vert: true, label: [1096, 656, 'start'], value: [1096, 668, 'start'] }
};

// Transmissores de nível: linha do tanque até o balão
const LEVEL_TRANSMITTERS = {
    LT5: { tx: 170, bx: 125, y: 270 }, LT6: { tx: 1230, bx: 1275, y: 270 },
    LT3: { tx: 170, bx: 125, y: 615 }, LT4: { tx: 1230, bx: 1275, y: 615 },
    LT1: { tx: 600, bx: 645, y: 615 }, LT2: { tx: 800, bx: 755, y: 615 }
};

// Transmissores de vazão: elemento no tubo + balão
const FLOW_TRANSMITTERS = {
    FT3: { px: 655, py: 215, vert: false, bx: 655, by: 172 },
    FT6: { px: 745, py: 215, vert: false, bx: 745, by: 172 },
    FT1: { px: 380, py: 95, vert: false, bx: 380, by: 52 },
    FT2: { px: 1040, py: 60, vert: false, bx: 1040, by: 20, value: [1064, 24, 'start'] },
    FT4: { px: 430, py: 540, vert: true, bx: 388, by: 540 },
    FT5: { px: 970, py: 540, vert: true, bx: 1012, by: 540 }
};

// Tubulações: [caminho, trecho do P&ID, seta no fim]
const PIPES = [
    ['M700,920 V820', 'B103'],
    ['M700,780 V215', 'B103'],
    ['M700,215 H470', 'LV101'],
    ['M700,215 H930', 'LV102'],
    ['M470,215 V60 H1170 V130', 'XV101B', true],
    ['M930,215 V95 H480 A10,10 0 0 0 460,95 H230 V130', 'XV102A', true],
    ['M470,215 H350 V410 H240 A10,10 0 0 0 220,410 H198 V470', 'XV101A', true],
    ['M930,215 H1050 V410 H1160 A10,10 0 0 1 1180,410 H1202 V470', 'XV102B', true],
    ['M230,300 V470', 'HV105', true],
    ['M1170,300 V470', 'HV106', true],
    ['M320,790 V440 H262 V470', 'HV107', true],
    ['M1080,790 V440 H1138 V470', 'HV108', true],
    ['M230,640 V770', 'B101'],
    ['M250,790 H430', 'B101'],
    ['M430,790 V430 H540 V470', 'LV103', true],
    ['M1170,640 V770', 'B102'],
    ['M1150,790 H970', 'B102'],
    ['M970,790 V430 H860 V470', 'LV104', true],
    ['M540,640 V850', 'HV101', true],
    ['M860,640 V850', 'HV102', true]
];

const TEES = [[700, 215], [320, 790], [1080, 790]];

const FLOW_ARROWS = [
    [700, 500, 'up'], [535, 215, 'left'], [865, 215, 'right'], [820, 60, 'right'],
    [640, 95, 'left'], [350, 370, 'down'], [1050, 370, 'down'], [380, 790, 'right'],
    [1020, 790, 'left'], [430, 480, 'up'], [970, 480, 'up'], [320, 510, 'up'], [1080, 510, 'up']
];

// Controladores: posição do balão, sinais da PV e sinal da MV por atuador.
// A rota da MV depende de qual atuador o cenário escolheu.
const LOOP_LAYOUT = {
    'LIC-101': { x: 645, y: 360, pv: ['M645,596 V380'], mv: { V3: 'M625,360 H455 V760 H401 V709', V4: 'M775,360 H945 V760 H999 V709' }, text: [620, 392, 'end'] },
    'LIC-102': { x: 755, y: 360, pv: ['M755,596 V380'], mv: { V4: 'M775,360 H945 V760 H999 V709', V3: 'M625,360 H455 V760 H401 V709' }, text: [780, 392, 'start'] },
    'LIC-103': { x: 125, y: 720, pv: ['M125,634 V700'], mv: { V1: 'M106,720 H40 V24 H600 V177', V2: 'M106,720 H40 V24 H800 V177' } },
    'LIC-104': { x: 1275, y: 720, pv: ['M1275,634 V700'], mv: { V2: 'M1294,720 H1360 V46 H800 V177', V1: 'M1294,720 H1360 V46 H600 V177' } },
    'FIC-101': { x: 560, y: 120, pv: ['M655,153 V120 H579'], mv: { V1: 'M560,139 V160 H600 V177' } },
    'FIC-102': { x: 840, y: 120, pv: ['M745,153 V120 H821'], mv: { V2: 'M840,139 V160 H800 V177' } },
    'FIC-103': { x: 645, y: 290, pv: ['M641,191 V271', 'M745,191 V290 H664'], mv: { P3: 'M645,309 V330 H665 V800 H680' }, text: [620, 286, 'end'] },
    'FIC-105': { x: 360, y: 480, pv: ['M388,521 V505 H360 V499'], mv: { V3: 'M341,480 H330 V660 H401 V691', P1: 'M341,480 H330 V850 H230 V810' }, text: [325, 430, 'start'] },
    'FIC-106': { x: 1040, y: 480, pv: ['M1012,521 V505 H1040 V499'], mv: { V4: 'M1059,480 H1070 V660 H999 V691', P2: 'M1059,480 H1070 V850 H1170 V810' }, text: [1075, 430, 'end'] }
};

// FT que alimenta cada tag de malha (para o balão do FT abrir a malha)
const PV_SENSOR_OF_TANK = { H1: 'LT1', H2: 'LT2', H3: 'LT3', H4: 'LT4', H5: 'LT5', H6: 'LT6' };

// AUXILIARES DE SVG

function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== undefined && value !== null) node.setAttribute(key, value);
    }
    if (parent) parent.appendChild(node);
    return node;
}

function txt(parent, x, y, text, cls, anchor) {
    const node = el('text', { x, y, class: cls }, parent);
    if (anchor) node.setAttribute('text-anchor', anchor);
    node.textContent = text;
    return node;
}

function bowtie(g, x, y, vert) {
    const d = vert
        ? `M${x - 8},${y - 12} L${x + 8},${y + 12} L${x - 8},${y + 12} L${x + 8},${y - 12} Z`
        : `M${x - 12},${y - 8} L${x + 12},${y + 8} L${x + 12},${y - 8} L${x - 12},${y + 8} Z`;
    return el('path', { d, class: 'sym valve-body' }, g);
}

function actuator(g, x, y, dir, kind) {
    const dx = { up: 0, down: 0, left: -1, right: 1 }[dir];
    const dy = { up: -1, down: 1 }[dir] || 0;
    el('line', { x1: x, y1: y, x2: x + dx * 20, y2: y + dy * 20, class: 'stem' }, g);
    const cx = x + dx * 29;
    const cy = y + dy * 29;
    let shape;
    if (kind === 'M') shape = el('circle', { cx, cy, r: 9, class: 'sym actuator' }, g);
    else shape = el('rect', { x: cx - 8, y: cy - 8, width: 16, height: 16, class: 'sym actuator' }, g);
    txt(g, cx, cy + 3.5, kind, 'act');
    return shape;
}

function pumpSymbol(g, x, y, out) {
    const body = el('circle', { cx: x, cy: y, r: 20, class: 'sym pump-body' }, g);
    const tri = {
        up: `M${x - 9},${y + 7} L${x + 9},${y + 7} L${x},${y - 10} Z`,
        right: `M${x - 7},${y - 9} L${x - 7},${y + 9} L${x + 10},${y} Z`,
        left: `M${x + 7},${y - 9} L${x + 7},${y + 9} L${x - 10},${y} Z`
    }[out];
    const rotor = el('path', { d: tri, class: 'dot pump-rotor' }, g);
    return { body, rotor };
}

function bubble(g, x, y, letters, number) {
    const circle = el('circle', { cx: x, cy: y, r: 19, class: 'sym bubble' }, g);
    txt(g, x, y - 2, letters, 'tagL');
    txt(g, x, y + 11, number, 'tagN');
    return circle;
}

function flowArrow(g, x, y, dir) {
    const d = {
        up: `M${x - 5},${y + 4} L${x + 5},${y + 4} L${x},${y - 5} Z`,
        down: `M${x - 5},${y - 4} L${x + 5},${y - 4} L${x},${y + 5} Z`,
        left: `M${x + 4},${y - 5} L${x + 4},${y + 5} L${x - 5},${y} Z`,
        right: `M${x - 4},${y - 5} L${x - 4},${y + 5} L${x + 5},${y} Z`
    }[dir];
    el('path', { d, class: 'dot' }, g);
}

function splitTag(tag) {
    const [letters, number] = String(tag).split('-');
    return [letters, number ?? ''];
}

// FORMATAÇÃO

export function fmt(value, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${Math.round(value * 100)} %`;
}

// SINÓTICO

export function createSynoptic(container, { onSelect = () => {} } = {}) {
    container.innerHTML = '';
    container.classList.add('synoptic');

    const svg = el('svg', { viewBox: VIEWBOX, preserveAspectRatio: 'xMidYMid meet', role: 'img', class: 'synoptic-svg' }, container);
    svg.setAttribute('aria-label', 'Fluxograma da planta de seis tanques');

    const tooltip = document.createElement('div');
    tooltip.className = 'synoptic-tooltip';
    tooltip.hidden = true;
    container.appendChild(tooltip);

    // Definições
    const defs = el('defs', {}, svg);
    for (const [id, cls] of [['arw', 'ah'], ['arws', 'ahs']]) {
        const marker = el('marker', {
            id, viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 10, markerHeight: 10,
            markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse'
        }, defs);
        el('path', { d: 'M0,0 L10,5 L0,10 z', class: cls }, marker);
    }

    const gPipesOuter = el('g', { class: 'pipes-outer' }, svg);
    const gPipesInner = el('g', { class: 'pipes-inner' }, svg);
    const gPipesDeco = el('g', { class: 'pipes-deco' }, svg);
    const gSignals = el('g', { class: 'signals' }, svg);
    const gSymbols = el('g', { class: 'symbols' }, svg);
    const gLoops = el('g', { class: 'loops' }, svg);

    // Registros dos elementos dinâmicos
    const pipes = {};      // trecho -> [paths internos]
    const tanks = {};
    const pumps = {};
    const controlValves = {};
    const threeWay = {};
    const manualValves = {};
    const levelTransmitters = {};
    const flowTransmitters = {};
    let loopNodes = {};    // tag -> {group, ...}
    let loopSignature = '';
    let selected = null;
    let alarmByTag = {};

    function comp(kind, id, parent = gSymbols) {
        const g = el('g', { class: `comp comp-${kind}`, tabindex: 0, role: 'button' }, parent);
        g.dataset.kind = kind;
        g.dataset.id = id;
        g.dataset.tip = `${isaTag(id)} · ${componentDescription(id)}`;
        return g;
    }

    // TUBULAÇÕES
    for (const [d, segment, arrow] of PIPES) {
        const outer = el('path', { d, class: 'pipe-outer' }, gPipesOuter);
        if (arrow) outer.setAttribute('marker-end', 'url(#arw)');
        const inner = el('path', { d, class: 'pipe-inner' }, gPipesInner);
        inner.dataset.segment = segment;
        (pipes[segment] ??= []).push(inner);
    }
    for (const [x, y] of TEES) el('circle', { cx: x, cy: y, r: 3.5, class: 'dot' }, gPipesDeco);
    for (const [x, y, dir] of FLOW_ARROWS) flowArrow(gPipesDeco, x, y, dir);

    // RESERVATÓRIO
    {
        const g = el('g', { class: 'reservoir' }, gSymbols);
        el('path', { d: 'M500,850 V930 H900 V850', class: 'sym vessel-static' }, g);
        el('line', { x1: 506, y1: 868, x2: 894, y2: 868, class: 'conn', 'stroke-dasharray': '3 4' }, g);
        txt(g, 620, 900, 'TQ-100', 'lbl', 'middle');
        txt(g, 620, 916, 'Reservatório', 'sub');
    }

    // TANQUES
    for (const [id, { x, y }] of Object.entries(TANKS)) {
        const g = comp('tank', id);
        const clipId = `clip-${id}`;
        const clip = el('clipPath', { id: clipId }, defs);
        el('rect', { x, y, width: 120, height: 170, rx: 14 }, clip);
        el('rect', { x, y, width: 120, height: 170, rx: 14, class: 'sym vessel' }, g);
        const fill = el('rect', { x, y: y + 170, width: 120, height: 0, class: 'vessel-fill', 'clip-path': `url(#${clipId})` }, g);
        const spLine = el('line', { x1: x + 6, y1: y + 170, x2: x + 114, y2: y + 170, class: 'sp-marker' }, g);
        spLine.style.display = 'none';
        el('rect', { x, y, width: 120, height: 170, rx: 14, class: 'vessel-outline' }, g);
        txt(g, x + 60, y + 34, isaTag(id), 'tk');
        const value = txt(g, x + 60, y + 118, '—', 'tank-value');
        const percent = txt(g, x + 60, y + 138, '', 'tank-sub');
        const alarm = el('circle', { cx: x + 104, cy: y + 16, r: 7, class: 'alarm-dot' }, g);
        alarm.style.display = 'none';
        tanks[id] = { g, fill, spLine, value, percent, alarm, x, y };
    }

    // BOMBAS
    for (const [id, cfg] of Object.entries(PUMPS)) {
        const g = comp('pump', id);
        const { body, rotor } = pumpSymbol(g, cfg.x, cfg.y, cfg.out);
        txt(g, cfg.label[0], cfg.label[1], isaTag(id), 'lbl', cfg.label[2]);
        const status = txt(g, cfg.status[0], cfg.status[1], '—', 'value', cfg.status[2]);
        const alarm = el('circle', { cx: cfg.x + 16, cy: cfg.y - 16, r: 7, class: 'alarm-dot' }, g);
        alarm.style.display = 'none';
        pumps[id] = { g, body, rotor, status, alarm };
    }

    // VÁLVULAS DE CONTROLE (SERVOS)
    for (const [id, cfg] of Object.entries(CONTROL_VALVES)) {
        const g = comp('valve', id);
        const body = bowtie(g, cfg.x, cfg.y, cfg.vert);
        const act = actuator(g, cfg.x, cfg.y, cfg.dir, 'M');
        txt(g, cfg.label[0], cfg.label[1], isaTag(id), 'lbl', cfg.label[2]);
        const value = txt(g, cfg.value[0], cfg.value[1], '—', 'value', cfg.value[2]);
        controlValves[id] = { g, body, act, value };
    }

    // VÁLVULAS DE 3 VIAS
    for (const [id, cfg] of Object.entries(THREE_WAY)) {
        const g = comp('xv', id);
        const { x, y } = cfg;
        const tri = {
            left: `M${x - 12},${y - 8} L${x - 12},${y + 8} L${x},${y} Z`,
            right: `M${x + 12},${y - 8} L${x + 12},${y + 8} L${x},${y} Z`,
            up: `M${x - 8},${y - 12} L${x + 8},${y - 12} L${x},${y} Z`,
            down: `M${x - 8},${y + 12} L${x + 8},${y + 12} L${x},${y} Z`
        };
        const ports = {};
        for (const [side, port] of Object.entries(cfg.ports)) {
            ports[port] = el('path', { d: tri[side], class: 'sym xv-port' }, g);
        }
        actuator(g, x, y, 'down', 'S');
        txt(g, cfg.label[0], cfg.label[1], isaTag(id), 'lbl', cfg.label[2]);
        for (const [s, px, py, a] of cfg.portLabels) txt(g, px, py, s, 'port', a);
        const value = txt(g, cfg.value[0], cfg.value[1], '—', 'value', cfg.value[2]);
        threeWay[id] = { g, ports, value };
    }

    // VÁLVULAS MANUAIS
    for (const [id, cfg] of Object.entries(MANUAL_VALVES)) {
        const g = comp('hv', id);
        const body = bowtie(g, cfg.x, cfg.y, cfg.vert);
        txt(g, cfg.label[0], cfg.label[1], isaTag(id), 'lbl', cfg.label[2]);
        const value = txt(g, cfg.value[0], cfg.value[1], '—', 'value muted', cfg.value[2]);
        manualValves[id] = { g, body, value };
    }

    // TRANSMISSORES DE NÍVEL
    for (const [id, cfg] of Object.entries(LEVEL_TRANSMITTERS)) {
        const g = comp('lt', id);
        el('line', { x1: cfg.tx, y1: cfg.y, x2: cfg.bx + (cfg.bx > cfg.tx ? -19 : 19), y2: cfg.y, class: 'conn' }, g);
        const [letters, number] = splitTag(isaTag(id));
        const circle = bubble(g, cfg.bx, cfg.y, letters, number);
        const value = txt(g, cfg.bx, cfg.y + 33, '—', 'value', 'middle');
        levelTransmitters[id] = { g, circle, value };
    }

    // TRANSMISSORES DE VAZÃO
    for (const [id, cfg] of Object.entries(FLOW_TRANSMITTERS)) {
        const g = comp('ft', id);
        const { px, py, bx, by, vert } = cfg;
        if (vert) {
            el('line', { x1: px + (bx > px ? 7 : -7), y1: py, x2: bx + (bx > px ? -19 : 19), y2: by, class: 'conn' }, g);
            el('rect', { x: px - 7, y: py - 4, width: 14, height: 8, class: 'sym' }, g);
        } else {
            el('line', { x1: px, y1: py + (by > py ? 7 : -7), x2: bx, y2: by + (by > py ? -19 : 19), class: 'conn' }, g);
            el('rect', { x: px - 4, y: py - 7, width: 8, height: 14, class: 'sym' }, g);
        }
        const [letters, number] = splitTag(isaTag(id));
        const circle = bubble(g, bx, by, letters, number);
        const [vx, vy, va] = cfg.value ?? [bx, by + 33, 'middle'];
        const value = txt(g, vx, vy, '—', 'value', va);
        flowTransmitters[id] = { g, circle, value };
    }

    // MALHAS DE CONTROLE (recriadas quando o cenário muda)
    function buildLoops(loops) {
        gLoops.innerHTML = '';
        gSignals.innerHTML = '';
        loopNodes = {};
        for (const [tag, loop] of Object.entries(loops)) {
            const layout = LOOP_LAYOUT[tag];
            if (!layout) continue;
            const mvId = loop.mvTarget?.id;
            const g = el('g', { class: 'comp comp-loop', tabindex: 0, role: 'button' }, gLoops);
            g.dataset.kind = 'loop';
            g.dataset.id = tag;
            g.dataset.tip = `${tag} · ${loop.descricao ?? ''}`;
            const { x, y } = layout;
            el('rect', { x: x - 20, y: y - 20, width: 40, height: 40, class: 'ctlbox' }, g);
            el('circle', { cx: x, cy: y, r: 19, class: 'symi' }, g);
            el('line', { x1: x - 19, y1: y, x2: x + 19, y2: y, class: 'symi' }, g);
            const [letters, number] = splitTag(tag);
            txt(g, x, y - 5, letters, 'tagL ctl');
            txt(g, x, y + 13, number, 'tagN ctl');

            const [tx, ty, anchor] = layout.text ?? [x, y + 34, 'middle'];
            const line1 = txt(g, tx, ty, '', 'loop-text', anchor);
            const line2 = txt(g, tx, ty + 12, '', 'loop-text', anchor);
            const modeW = 34;
            const modeX = anchor === 'end' ? tx - modeW : anchor === 'start' ? tx : tx - modeW / 2;
            const modeBox = el('rect', { x: modeX, y: ty + 17, width: modeW, height: 12, rx: 2, class: 'mode-box' }, g);
            const modeText = txt(g, modeX + modeW / 2, ty + 26.5, 'MAN', 'mode-text', 'middle');
            const alarm = el('circle', { cx: x + 20, cy: y - 20, r: 7, class: 'alarm-dot' }, g);
            alarm.style.display = 'none';

            for (const d of layout.pv) el('path', { d, class: 'sig', 'marker-end': 'url(#arws)' }, gSignals);
            const mvPath = layout.mv[mvId];
            if (mvPath) el('path', { d: mvPath, class: 'sig', 'marker-end': 'url(#arws)' }, gSignals);

            loopNodes[tag] = { g, line1, line2, modeBox, modeText, alarm };
        }
    }

    // INTERAÇÃO
    function findComp(target) {
        return target instanceof Element ? target.closest('.comp') : null;
    }

    svg.addEventListener('click', event => {
        const g = findComp(event.target);
        if (!g) return;
        onSelect({ kind: g.dataset.kind, id: g.dataset.id });
    });
    svg.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const g = findComp(event.target);
        if (!g) return;
        event.preventDefault();
        onSelect({ kind: g.dataset.kind, id: g.dataset.id });
    });
    svg.addEventListener('mousemove', event => {
        const g = findComp(event.target);
        if (!g) {
            tooltip.hidden = true;
            return;
        }
        tooltip.textContent = g.dataset.tip;
        tooltip.hidden = false;
        const rect = container.getBoundingClientRect();
        const left = Math.min(event.clientX - rect.left + 14, rect.width - tooltip.offsetWidth - 8);
        const top = event.clientY - rect.top + 16;
        tooltip.style.left = `${Math.max(0, left)}px`;
        tooltip.style.top = `${top}px`;
    });
    svg.addEventListener('mouseleave', () => { tooltip.hidden = true; });

    // SELEÇÃO
    function setSelected(selection) {
        selected = selection;
        for (const g of svg.querySelectorAll('.comp.selected')) g.classList.remove('selected');
        if (!selection) return;
        const g = svg.querySelector(`.comp[data-kind="${selection.kind}"][data-id="${selection.id}"]`);
        if (g) g.classList.add('selected');
    }

    // ATUALIZAÇÃO
    function byId(collection, id) {
        return collection.find(item => item.id === id) ?? null;
    }

    function setAlarm(node, tag) {
        const alarm = alarmByTag[tag];
        if (!alarm) {
            node.style.display = 'none';
            node.setAttribute('class', 'alarm-dot');
            return;
        }
        node.style.display = '';
        node.setAttribute('class', `alarm-dot prio-${alarm.priority}`);
    }

    function update(plant, runtime = {}) {
        if (!plant) return;
        const loops = runtime.loops ?? {};
        const writable = Boolean(runtime.writable);
        const hMax = runtime.sim?.tankHeightCm ?? 25;

        alarmByTag = {};
        for (const alarm of runtime.alarms ?? []) {
            const current = alarmByTag[alarm.tag];
            if (!current || alarm.priority < current.priority) alarmByTag[alarm.tag] = alarm;
        }

        // Malhas: recriar só quando o conjunto (tag + atuador) muda
        const signature = Object.entries(loops).map(([tag, l]) => `${tag}:${l.mvTarget?.id ?? ''}`).join('|');
        if (signature !== loopSignature) {
            loopSignature = signature;
            buildLoops(loops);
            if (selected) setSelected(selected);
        }

        // SP de nível por tanque (cenário de nível)
        const spByTank = {};
        for (const loop of Object.values(loops)) {
            if (loop.pvSource?.tipo === 'nivel' && loop.effectiveMode === 'AUTO') spByTank[loop.pvSource.id] = loop.sp;
        }

        // TANQUES
        for (const tank of plant.tanks) {
            const node = tanks[tank.id];
            if (!node) continue;
            const level = tank.level;
            const fraction = level === null || level === undefined ? 0 : Math.max(0, Math.min(1, level / 100));
            const height = 170 * fraction;
            node.fill.setAttribute('y', node.y + 170 - height);
            node.fill.setAttribute('height', height);
            node.g.classList.toggle('no-data', level === null || level === undefined);
            const cm = tank.heightCm;
            node.value.textContent = cm === null || cm === undefined ? (level === null ? '—' : `${fmt(level, 0)} %`) : `${fmt(cm, 1)} cm`;
            node.percent.textContent = cm === null || cm === undefined ? '' : `${fmt(level, 0)} %`;
            const sp = spByTank[tank.id];
            if (sp !== undefined && hMax > 0) {
                const ySp = node.y + 170 - 170 * Math.max(0, Math.min(1, sp / hMax));
                node.spLine.setAttribute('y1', ySp);
                node.spLine.setAttribute('y2', ySp);
                node.spLine.style.display = '';
            } else {
                node.spLine.style.display = 'none';
            }
            setAlarm(node.alarm, PV_SENSOR_OF_TANK[tank.id]);
        }

        // BOMBAS
        for (const pump of plant.pumps) {
            const node = pumps[pump.id];
            if (!node) continue;
            const on = Boolean(pump.power) && pump.command > 0;
            node.g.classList.toggle('running', on);
            node.status.textContent = on ? pct(pump.command) : 'parada';
            setAlarm(node.alarm, pump.id);
        }

        // VÁLVULAS DE CONTROLE
        for (const valve of plant.actuatedValves) {
            const node = controlValves[valve.id];
            if (!node) continue;
            node.value.textContent = pct(valve.opening);
            node.g.classList.toggle('closed', valve.opening <= 0.001);
        }

        // VÁLVULAS DE 3 VIAS
        for (const [id, node] of Object.entries(threeWay)) {
            const a = byId(plant.threeWayValves, `${id}A`);
            const b = byId(plant.threeWayValves, `${id}B`);
            node.ports.A.classList.toggle('open', Boolean(a?.state));
            node.ports.B.classList.toggle('open', Boolean(b?.state));
            node.ports.in.classList.toggle('open', Boolean(a?.state || b?.state));
            const timing = runtime.xv?.[id];
            if (timing) node.value.textContent = `A ${fmt(timing.tA, 0)} s · B ${fmt(timing.tB, 0)} s`;
            else node.value.textContent = a?.state ? 'porta A' : b?.state ? 'porta B' : 'fechada';
        }

        // VÁLVULAS MANUAIS
        const manual = [...plant.manualValves, ...plant.recycleValves, plant.mainValve];
        for (const valve of manual) {
            const node = manualValves[valve.id];
            if (!node) continue;
            node.value.textContent = pct(valve.opening);
            node.g.classList.toggle('closed', valve.opening <= 0.001);
        }

        // TRANSMISSORES
        for (const sensor of plant.levelSensors) {
            const node = levelTransmitters[sensor.id];
            if (!node) continue;
            const cm = sensor.heightCm ?? byId(plant.tanks, sensor.tank)?.heightCm ?? null;
            node.value.textContent = cm !== null ? `${fmt(cm, 1)} cm` : sensor.level !== null ? `${fmt(sensor.level, 0)} %` : '—';
            node.g.classList.toggle('no-data', sensor.level === null && cm === null);
            setAlarm(node.g.querySelector('.alarm-dot') ?? ensureAlarmDot(node), sensor.id);
        }
        for (const sensor of plant.flowSensors) {
            const node = flowTransmitters[sensor.id];
            if (!node) continue;
            node.value.textContent = sensor.flow === null ? '—' : `${fmt(sensor.flow, 2)} L/min`;
            node.g.classList.toggle('no-data', sensor.flow === null);
        }

        // TUBULAÇÕES
        const segments = runtime.segments ?? {};
        for (const [segment, paths] of Object.entries(pipes)) {
            const flow = segments[segment];
            const state = flow === null || flow === undefined ? 'unknown' : flow > 0.02 ? 'active' : 'idle';
            for (const path of paths) {
                path.classList.toggle('active', state === 'active');
                path.classList.toggle('unknown', state === 'unknown');
            }
        }

        // MALHAS
        for (const [tag, node] of Object.entries(loopNodes)) {
            const loop = loops[tag];
            if (!loop) continue;
            const unit = loop.unit ?? '';
            node.line1.textContent = `PV ${fmt(loop.pv, unit === 'cm' ? 1 : 2)} · SP ${fmt(loop.sp, unit === 'cm' ? 1 : 2)} ${unit}`;
            node.line2.textContent = `MV ${pct(loop.mv)}`;
            const mode = loop.effectiveMode ?? loop.mode ?? 'MAN';
            node.modeText.textContent = loop.quality === 'bad' ? 'BAD' : mode;
            node.g.classList.toggle('auto', mode === 'AUTO');
            node.g.classList.toggle('man', mode !== 'AUTO');
            node.g.classList.toggle('bad', loop.quality === 'bad');
            setAlarm(node.alarm, tag);
        }

        svg.classList.toggle('read-only', !writable);
        svg.classList.toggle('offline', !runtime.connected);
    }

    function ensureAlarmDot(node) {
        const circle = node.circle;
        const dot = el('circle', { cx: Number(circle.getAttribute('cx')) + 15, cy: Number(circle.getAttribute('cy')) - 15, r: 7, class: 'alarm-dot' }, node.g);
        dot.style.display = 'none';
        return dot;
    }

    function destroy() {
        container.innerHTML = '';
    }

    return { svg, update, setSelected, destroy };
}
