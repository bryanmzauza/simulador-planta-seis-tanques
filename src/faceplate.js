// FACEPLATES
/* Painel lateral que abre ao clicar em um elemento do sinótico: malha de
   controle (SP, AUTO/MAN, MV manual, sintonia), bomba, válvula de controle,
   válvula de 3 vias, válvula manual, tanque e transmissores.

   Recebe dados por update() e devolve ações pelos callbacks; não envia
   comandos diretamente. Em modo somente leitura (planta real) todos os
   controles ficam desabilitados. */

import { isaTag, componentDescription } from './component-labels.js';
import { fmt } from './synoptic.js';

const SP_STEP = { cm: 0.5, 'L/min': 0.1 };

const TUNING_FIELDS = [
    ['kp', 'Kp', 'ganho proporcional', 0.001],
    ['ti', 'Ti (s)', 'tempo integral; 0 desliga a integral', 0.1],
    ['td', 'Td (s)', 'tempo derivativo; 0 = PI', 0.1],
    ['b', 'b', 'peso do SP na parcela P', 0.05],
    ['c', 'c', 'peso do SP na parcela D', 0.05],
    ['n', 'N', 'limite do filtro derivativo', 1],
    ['ftt', 'FTt', 'ganho do tracking anti-windup', 0.1],
    ['uBias', 'U bias', 'polarização da saída', 0.01],
    ['uMin', 'MV mín', 'limite inferior da saída (0 a 1)', 0.01],
    ['uMax', 'MV máx', 'limite superior da saída (0 a 1)', 0.01]
];

function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'html') node.innerHTML = value;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, value);
    }
    for (const child of children) {
        if (child === null || child === undefined) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function pctText(value) {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value * 100)} %`;
}

function byId(collection, id) {
    return collection.find(item => item.id === id) ?? null;
}

function isEditing(input) {
    return document.activeElement === input || input.dataset.dragging === '1';
}

function bindDrag(input) {
    input.addEventListener('pointerdown', () => { input.dataset.dragging = '1'; });
    const stop = () => { input.dataset.dragging = '0'; };
    input.addEventListener('pointerup', stop);
    input.addEventListener('pointercancel', stop);
    input.addEventListener('blur', stop);
}

export function createFaceplate(container, actions = {}) {
    let selection = null;
    let lastPlant = null;
    let lastRuntime = {};
    let view = null;     // {root, refresh(plant, runtime)}

    container.classList.add('faceplate');
    container.hidden = true;

    const act = {
        setPump: () => false,
        setValveOpening: () => false,
        setManualValveOpening: () => false,
        setLoop: () => false,
        setThreeWayTiming: () => false,
        setInitialLevel: () => false,
        ...actions
    };

    // CABEÇALHO
    function header(title, subtitle, extra = null) {
        return h('div', { class: 'fp-header' }, [
            h('div', {}, [
                h('h2', { text: title }),
                h('p', { class: 'fp-subtitle', text: subtitle }),
                extra
            ]),
            h('button', { class: 'fp-close', type: 'button', 'aria-label': 'Fechar painel', title: 'Fechar', onclick: () => hide() }, ['×'])
        ]);
    }

    function readOnlyBanner() {
        return h('p', { class: 'fp-readonly', text: 'Somente leitura: a planta real não aceita comandos pela HMI.' });
    }

    function lockedBanner(loopTag) {
        return h('p', { class: 'fp-locked', text: `Controlado por ${loopTag} em AUTO. Passe a malha para MAN para atuar à mão.` });
    }

    function loopOwning(kind, id, runtime) {
        for (const [tag, loop] of Object.entries(runtime.loops ?? {})) {
            if (loop.mvTarget?.tipo === kind && loop.mvTarget?.id === id) return [tag, loop];
        }
        return [null, null];
    }

    function loopWithPv(kind, id, runtime) {
        for (const [tag, loop] of Object.entries(runtime.loops ?? {})) {
            const pv = loop.pvSource ?? {};
            if (pv.tipo === kind && pv.id === id) return tag;
            if (pv.tipo === 'vazao_soma' && kind === 'vazao' && (pv.ids ?? []).includes(id)) return tag;
        }
        return null;
    }

    // MALHA
    function loopView(tag) {
        const root = h('section', { class: 'fp-body fp-loop' });
        const title = h('h2', { text: tag });
        const subtitle = h('p', { class: 'fp-subtitle' });
        const meta = h('p', { class: 'fp-meta' });
        root.append(h('div', { class: 'fp-header' }, [
            h('div', {}, [title, subtitle, meta]),
            h('button', { class: 'fp-close', type: 'button', 'aria-label': 'Fechar painel', title: 'Fechar', onclick: () => hide() }, ['×'])
        ]));
        const ro = readOnlyBanner();
        root.append(ro);

        // Valores principais
        const pvValue = h('strong', { class: 'fp-big' });
        const spValue = h('strong', { class: 'fp-big sp' });
        const mvValue = h('strong', { class: 'fp-big mv' });
        const unitPv = h('span', { class: 'fp-unit' });
        const unitSp = h('span', { class: 'fp-unit' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'PV' }), pvValue, unitPv]),
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'SP' }), spValue, unitSp]),
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'MV' }), mvValue, h('span', { class: 'fp-unit', text: '%' })])
        ]));

        // Barras
        const pvBar = h('div', { class: 'fp-bar-fill pv' });
        const spMark = h('div', { class: 'fp-bar-mark' });
        const mvBar = h('div', { class: 'fp-bar-fill mv' });
        root.append(h('div', { class: 'fp-bars' }, [
            h('div', { class: 'fp-bar', title: 'PV e SP na faixa do setpoint' }, [pvBar, spMark]),
            h('div', { class: 'fp-bar', title: 'MV de 0 a 100 %' }, [mvBar])
        ]));

        // Modo
        const btnAuto = h('button', { type: 'button', class: 'fp-mode', onclick: () => act.setLoop(tag, { mode: 'AUTO' }) }, ['AUTO']);
        const btnMan = h('button', { type: 'button', class: 'fp-mode', onclick: () => act.setLoop(tag, { mode: 'MAN' }) }, ['MAN']);
        const quality = h('span', { class: 'fp-quality' });
        root.append(h('div', { class: 'fp-row fp-modes' }, [btnAuto, btnMan, quality]));

        // Setpoint
        const spInput = h('input', { type: 'number', class: 'fp-number', step: '0.1' });
        const spRange = h('input', { type: 'range', class: 'fp-range', step: '0.1' });
        bindDrag(spRange);
        const applySp = value => act.setLoop(tag, { sp: Number(value) });
        spInput.addEventListener('change', () => applySp(spInput.value));
        spInput.addEventListener('keydown', event => { if (event.key === 'Enter') applySp(spInput.value); });
        spRange.addEventListener('input', () => { spInput.value = spRange.value; });
        spRange.addEventListener('change', () => applySp(spRange.value));
        const spMinus = h('button', { type: 'button', class: 'fp-step', onclick: () => applySp(Number(spInput.value) - Number(spInput.step)) }, ['−']);
        const spPlus = h('button', { type: 'button', class: 'fp-step', onclick: () => applySp(Number(spInput.value) + Number(spInput.step)) }, ['+']);
        const spRangeLabel = h('span', { class: 'fp-hint' });
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'Setpoint' }),
            h('div', { class: 'fp-row' }, [spMinus, spInput, spPlus, spRangeLabel]),
            spRange
        ]));

        // MV manual
        const mvRange = h('input', { type: 'range', class: 'fp-range', min: 0, max: 100, step: 1 });
        bindDrag(mvRange);
        const mvInput = h('input', { type: 'number', class: 'fp-number', min: 0, max: 100, step: 1 });
        const applyMv = value => act.setLoop(tag, { mv: Number(value) / 100 });
        mvRange.addEventListener('input', () => { mvInput.value = mvRange.value; });
        mvRange.addEventListener('change', () => applyMv(mvRange.value));
        mvInput.addEventListener('change', () => applyMv(mvInput.value));
        const mvHint = h('span', { class: 'fp-hint', text: 'disponível em MAN' });
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'MV manual (%)' }),
            h('div', { class: 'fp-row' }, [mvInput, mvHint]),
            mvRange
        ]));

        // Sintonia
        const typeSelect = h('select', { class: 'fp-select' }, [
            h('option', { value: 'PID_ISA', text: 'PID ISA' }),
            h('option', { value: 'PI', text: 'PI (Td = 0)' })
        ]);
        const tuningInputs = {};
        const tuningGrid = h('div', { class: 'fp-tuning-grid' });
        tuningGrid.append(h('label', { text: 'Tipo', title: 'PID ISA completo ou PI (derivada desligada)' }), typeSelect);
        for (const [key, label, title, step] of TUNING_FIELDS) {
            const input = h('input', { type: 'number', class: 'fp-number', step: String(step) });
            tuningInputs[key] = input;
            tuningGrid.append(h('label', { text: label, title }), input);
        }
        const applyTuning = () => {
            const tuning = { type: typeSelect.value };
            for (const [key] of TUNING_FIELDS) {
                const value = Number(tuningInputs[key].value);
                if (Number.isFinite(value)) tuning[key === 'uBias' ? 'u_bias' : key === 'uMin' ? 'u_min' : key === 'uMax' ? 'u_max' : key] = value;
            }
            act.setLoop(tag, { tuning });
        };
        const applyButton = h('button', { type: 'button', class: 'fp-apply', onclick: applyTuning }, ['Aplicar sintonia']);
        typeSelect.addEventListener('change', () => {
            if (typeSelect.value === 'PI') tuningInputs.td.value = '0';
        });
        const terms = h('p', { class: 'fp-terms' });
        const tuningDetails = h('details', { class: 'fp-details' }, [
            h('summary', { text: 'Sintonia' }),
            tuningGrid,
            h('div', { class: 'fp-row' }, [applyButton]),
            terms
        ]);
        root.append(tuningDetails);

        let tuningDirty = false;
        tuningGrid.addEventListener('input', () => { tuningDirty = true; });
        applyButton.addEventListener('click', () => { tuningDirty = false; });

        function refresh(plant, runtime) {
            const loop = runtime.loops?.[tag];
            const writable = Boolean(runtime.writable);
            ro.hidden = writable || !runtime.connected;
            if (!loop) {
                subtitle.textContent = 'Malha não existe no cenário atual.';
                return;
            }
            const unit = loop.unit ?? '';
            const digits = unit === 'cm' ? 1 : 2;
            subtitle.textContent = loop.descricao ?? '';
            const pvName = loop.pvSource?.tipo === 'vazao_soma'
                ? (loop.pvSource.ids ?? []).map(isaTag).join(' + ')
                : isaTag(loop.pvSource?.tipo === 'nivel' ? `LT${String(loop.pvSource.id).slice(1)}` : loop.pvSource?.id);
            meta.textContent = `PV: ${pvName} · MV: ${isaTag(loop.mvTarget?.id)} · ação ${loop.action === 'reverse' ? 'reversa' : 'direta'} · ${loop.type === 'PI' ? 'PI' : 'PID ISA'}`;

            pvValue.textContent = fmt(loop.pv, digits);
            spValue.textContent = fmt(loop.sp, digits);
            mvValue.textContent = loop.mv === null ? '—' : fmt(loop.mv * 100, 0);
            unitPv.textContent = unit;
            unitSp.textContent = unit;

            const spMin = loop.spMin ?? 0;
            const spMax = loop.spMax ?? 100;
            const span = Math.max(1e-9, spMax - spMin);
            const pvFrac = loop.pv === null ? 0 : Math.max(0, Math.min(1, (loop.pv - spMin) / span));
            const spFrac = Math.max(0, Math.min(1, (loop.sp - spMin) / span));
            pvBar.style.width = `${pvFrac * 100}%`;
            spMark.style.left = `${spFrac * 100}%`;
            mvBar.style.width = `${Math.max(0, Math.min(1, loop.mv ?? 0)) * 100}%`;

            const mode = loop.mode ?? 'MAN';
            const effective = loop.effectiveMode ?? mode;
            btnAuto.classList.toggle('active', effective === 'AUTO');
            btnMan.classList.toggle('active', effective !== 'AUTO');
            btnAuto.disabled = !writable;
            btnMan.disabled = !writable;
            quality.textContent = loop.quality === 'bad' ? 'PV sem dado: forçada em MAN' : effective === 'AUTO' ? 'automático' : 'manual';
            quality.classList.toggle('bad', loop.quality === 'bad');

            const step = SP_STEP[unit] ?? 0.1;
            spInput.step = String(step);
            spRange.step = String(step);
            spInput.min = String(spMin);
            spInput.max = String(spMax);
            spRange.min = String(spMin);
            spRange.max = String(spMax);
            spRangeLabel.textContent = `${fmt(spMin, 0)} a ${fmt(spMax, 0)} ${unit}`;
            if (!isEditing(spInput)) spInput.value = String(Number(loop.sp.toFixed(3)));
            if (!isEditing(spRange)) spRange.value = String(loop.sp);
            spInput.disabled = !writable;
            spRange.disabled = !writable;
            spMinus.disabled = !writable;
            spPlus.disabled = !writable;

            const manual = effective !== 'AUTO' && writable;
            if (!isEditing(mvRange)) mvRange.value = String(Math.round((loop.mv ?? 0) * 100));
            if (!isEditing(mvInput)) mvInput.value = String(Math.round((loop.mv ?? 0) * 100));
            mvRange.disabled = !manual;
            mvInput.disabled = !manual;
            mvHint.textContent = manual ? 'aplica na hora' : effective === 'AUTO' ? 'disponível em MAN' : '';

            if (!tuningDirty && !tuningDetails.contains(document.activeElement)) {
                typeSelect.value = loop.type === 'PI' ? 'PI' : 'PID_ISA';
                for (const [key] of TUNING_FIELDS) {
                    const value = loop[key];
                    tuningInputs[key].value = value === null || value === undefined ? '' : String(Number(Number(value).toFixed(4)));
                }
            }
            typeSelect.disabled = !writable;
            for (const input of Object.values(tuningInputs)) input.disabled = !writable;
            applyButton.disabled = !writable;
            const t = loop.terms ?? {};
            terms.textContent = `e = ${fmt(t.e, 3)} · P = ${fmt(t.up, 3)} · I = ${fmt(t.ui, 3)} · D = ${fmt(t.ud, 3)} · saída calculada = ${fmt(t.uop, 3)}`;
        }

        return { root, refresh };
    }

    // BOMBA
    function pumpView(id) {
        const root = h('section', { class: 'fp-body fp-pump' });
        root.append(header(isaTag(id), componentDescription(id)));
        const ro = readOnlyBanner();
        root.append(ro);
        const locked = h('p', { class: 'fp-locked' });
        root.append(locked);
        const status = h('strong', { class: 'fp-big' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Estado' }), status])
        ]));
        const flowInfo = h('p', { class: 'fp-meta' });
        root.append(flowInfo);
        const btnOn = h('button', { type: 'button', class: 'fp-mode' }, ['Ligar']);
        const btnOff = h('button', { type: 'button', class: 'fp-mode' }, ['Desligar']);
        root.append(h('div', { class: 'fp-row fp-modes' }, [btnOn, btnOff]));
        const range = h('input', { type: 'range', class: 'fp-range', min: 0, max: 100, step: 1 });
        bindDrag(range);
        const number = h('input', { type: 'number', class: 'fp-number', min: 0, max: 100, step: 1 });
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'Rotação (%)' }),
            h('div', { class: 'fp-row' }, [number, h('span', { class: 'fp-hint', text: 'PWM de 0 a 100 %' })]),
            range
        ]));
        let current = { power: 0, command: 1 };
        btnOn.onclick = () => act.setPump(id, true, current.command > 0 ? current.command : 1);
        btnOff.onclick = () => act.setPump(id, false, current.command);
        range.addEventListener('input', () => { number.value = range.value; });
        range.addEventListener('change', () => act.setPump(id, Number(range.value) > 0, Number(range.value) / 100));
        number.addEventListener('change', () => act.setPump(id, Number(number.value) > 0, Number(number.value) / 100));

        function refresh(plant, runtime) {
            const pump = byId(plant.pumps, id);
            if (!pump) return;
            current = pump;
            const writable = Boolean(runtime.writable);
            ro.hidden = writable || !runtime.connected;
            const [tag, loop] = loopOwning('bomba', id, runtime);
            const isLocked = Boolean(loop && loop.effectiveMode === 'AUTO');
            locked.hidden = !isLocked;
            if (isLocked) locked.textContent = `Controlada por ${tag} em AUTO. Passe a malha para MAN para atuar à mão.`;
            const on = Boolean(pump.power) && pump.command > 0;
            status.textContent = on ? `ligada · ${pctText(pump.command)}` : 'parada';
            const segs = runtime.segments ?? {};
            const seg = { P1: 'B101', P2: 'B102', P3: 'B103' }[id];
            const flow = segs[seg];
            flowInfo.textContent = flow === null || flow === undefined ? 'Vazão bombeada: —' : `Vazão bombeada: ${fmt(flow, 2)} L/min`;
            const enabled = writable && !isLocked;
            btnOn.disabled = !enabled;
            btnOff.disabled = !enabled;
            btnOn.classList.toggle('active', on);
            btnOff.classList.toggle('active', !on);
            if (!isEditing(range)) range.value = String(Math.round(pump.command * 100));
            if (!isEditing(number)) number.value = String(Math.round(pump.command * 100));
            range.disabled = !enabled;
            number.disabled = !enabled;
        }
        return { root, refresh };
    }

    // VÁLVULA DE CONTROLE
    function valveView(id) {
        const root = h('section', { class: 'fp-body fp-valve' });
        root.append(header(isaTag(id), componentDescription(id)));
        const ro = readOnlyBanner();
        root.append(ro);
        const locked = h('p', { class: 'fp-locked' });
        root.append(locked);
        const opening = h('strong', { class: 'fp-big' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Abertura' }), opening, h('span', { class: 'fp-unit', text: '%' })])
        ]));
        const flowInfo = h('p', { class: 'fp-meta' });
        root.append(flowInfo);
        const range = h('input', { type: 'range', class: 'fp-range', min: 0, max: 100, step: 1 });
        bindDrag(range);
        const number = h('input', { type: 'number', class: 'fp-number', min: 0, max: 100, step: 1 });
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'Abertura (%)' }),
            h('div', { class: 'fp-row' }, [number, h('span', { class: 'fp-hint', text: '0 fechada · 100 aberta' })]),
            range
        ]));
        const quick = h('div', { class: 'fp-row' });
        for (const value of [0, 25, 50, 75, 100]) {
            quick.append(h('button', { type: 'button', class: 'fp-step', onclick: () => act.setValveOpening(id, value / 100) }, [`${value}`]));
        }
        root.append(quick);
        range.addEventListener('input', () => { number.value = range.value; });
        range.addEventListener('change', () => act.setValveOpening(id, Number(range.value) / 100));
        number.addEventListener('change', () => act.setValveOpening(id, Number(number.value) / 100));

        function refresh(plant, runtime) {
            const valve = byId(plant.actuatedValves, id);
            if (!valve) return;
            const writable = Boolean(runtime.writable);
            ro.hidden = writable || !runtime.connected;
            const [tag, loop] = loopOwning('valvula', id, runtime);
            const isLocked = Boolean(loop && loop.effectiveMode === 'AUTO');
            locked.hidden = !isLocked;
            if (isLocked) locked.textContent = `Controlada por ${tag} em AUTO. Passe a malha para MAN para atuar à mão.`;
            opening.textContent = fmt(valve.opening * 100, 0);
            const seg = { V1: 'LV101', V2: 'LV102', V3: 'LV103', V4: 'LV104' }[id];
            const flow = (runtime.segments ?? {})[seg];
            flowInfo.textContent = flow === null || flow === undefined ? 'Vazão na válvula: —' : `Vazão na válvula: ${fmt(flow, 2)} L/min`;
            const enabled = writable && !isLocked;
            if (!isEditing(range)) range.value = String(Math.round(valve.opening * 100));
            if (!isEditing(number)) number.value = String(Math.round(valve.opening * 100));
            range.disabled = !enabled;
            number.disabled = !enabled;
            for (const button of quick.querySelectorAll('button')) button.disabled = !enabled;
        }
        return { root, refresh };
    }

    // VÁLVULA DE 3 VIAS
    function xvView(id) {
        const root = h('section', { class: 'fp-body fp-xv' });
        root.append(header(isaTag(id), componentDescription(id)));
        const ro = readOnlyBanner();
        root.append(ro);
        const port = h('strong', { class: 'fp-big' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Porta aberta' }), port])
        ]));
        const tA = h('input', { type: 'number', class: 'fp-number', min: 0, step: 0.5 });
        const tB = h('input', { type: 'number', class: 'fp-number', min: 0, step: 0.5 });
        const apply = h('button', { type: 'button', class: 'fp-apply', onclick: () => act.setThreeWayTiming(id, Number(tA.value), Number(tB.value)) }, ['Aplicar tempos']);
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'Tempo em cada porta (s)' }),
            h('div', { class: 'fp-tuning-grid' }, [
                h('label', { text: `Porta A → ${id === 'X1' ? 'TQ-103' : 'TQ-105'}` }), tA,
                h('label', { text: `Porta B → ${id === 'X1' ? 'TQ-106' : 'TQ-104'}` }), tB
            ]),
            h('div', { class: 'fp-row' }, [apply]),
            h('p', { class: 'fp-hint', text: 'A porta A fica aberta tA segundos, depois a B fica tB segundos, alternando. Tempo 0 em uma porta deixa a outra sempre aberta.' })
        ]));
        const relays = h('p', { class: 'fp-meta' });
        root.append(relays);

        function refresh(plant, runtime) {
            const writable = Boolean(runtime.writable) && Boolean(runtime.xv?.[id]);
            ro.hidden = Boolean(runtime.writable) || !runtime.connected;
            const a = byId(plant.threeWayValves, `${id}A`);
            const b = byId(plant.threeWayValves, `${id}B`);
            port.textContent = a?.state ? 'A' : b?.state ? 'B' : 'nenhuma';
            relays.textContent = `Solenoides: ${isaTag(`${id}A`)} ${a?.state ? 'ligada' : 'desligada'} · ${isaTag(`${id}B`)} ${b?.state ? 'ligada' : 'desligada'}`;
            const timing = runtime.xv?.[id];
            if (timing) {
                if (!isEditing(tA)) tA.value = String(timing.tA);
                if (!isEditing(tB)) tB.value = String(timing.tB);
            }
            tA.disabled = !writable;
            tB.disabled = !writable;
            apply.disabled = !writable;
        }
        return { root, refresh };
    }

    // VÁLVULA MANUAL
    function hvView(id) {
        const root = h('section', { class: 'fp-body fp-hv' });
        root.append(header(isaTag(id), componentDescription(id)));
        const ro = readOnlyBanner();
        root.append(ro);
        const opening = h('strong', { class: 'fp-big' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Abertura' }), opening, h('span', { class: 'fp-unit', text: '%' })])
        ]));
        const range = h('input', { type: 'range', class: 'fp-range', min: 0, max: 100, step: 1 });
        bindDrag(range);
        const number = h('input', { type: 'number', class: 'fp-number', min: 0, max: 100, step: 1 });
        root.append(h('div', { class: 'fp-group' }, [
            h('label', { text: 'Abertura declarada (%)' }),
            h('div', { class: 'fp-row' }, [number]),
            range,
            h('p', { class: 'fp-hint', text: 'Válvula de regulagem ajustada à mão na bancada. Na simulação, a abertura é um parâmetro do modelo: a mudança reinicializa o modelo mantendo os níveis.' })
        ]));
        const send = value => (id === 'MV' ? act.setValveOpening(id, value) : act.setManualValveOpening(id, value));
        range.addEventListener('input', () => { number.value = range.value; });
        range.addEventListener('change', () => send(Number(range.value) / 100));
        number.addEventListener('change', () => send(Number(number.value) / 100));

        function refresh(plant, runtime) {
            const valve = id === 'MV' ? plant.mainValve : byId(plant.manualValves, id) ?? byId(plant.recycleValves, id);
            if (!valve) return;
            const writable = Boolean(runtime.writable);
            ro.hidden = writable || !runtime.connected;
            opening.textContent = fmt(valve.opening * 100, 0);
            if (!isEditing(range)) range.value = String(Math.round(valve.opening * 100));
            if (!isEditing(number)) number.value = String(Math.round(valve.opening * 100));
            range.disabled = !writable;
            number.disabled = !writable;
        }
        return { root, refresh };
    }

    // TANQUE
    function tankView(id) {
        const root = h('section', { class: 'fp-body fp-tank' });
        root.append(header(isaTag(id), componentDescription(id)));
        const level = h('strong', { class: 'fp-big' });
        const percent = h('strong', { class: 'fp-big' });
        const volume = h('strong', { class: 'fp-big' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Nível' }), level, h('span', { class: 'fp-unit', text: 'cm' })]),
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Nível' }), percent, h('span', { class: 'fp-unit', text: '%' })]),
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: 'Volume' }), volume, h('span', { class: 'fp-unit', text: 'L' })])
        ]));
        const sensor = h('p', { class: 'fp-meta' });
        root.append(sensor);
        const loopLink = h('button', { type: 'button', class: 'fp-apply' });
        loopLink.hidden = true;
        root.append(h('div', { class: 'fp-row' }, [loopLink]));
        const initial = h('input', { type: 'number', class: 'fp-number', min: 0, step: 0.5 });
        const applyInitial = h('button', { type: 'button', class: 'fp-apply', onclick: () => act.setInitialLevel(id, Number(initial.value)) }, ['Guardar']);
        const initialGroup = h('div', { class: 'fp-group' }, [
            h('label', { text: 'Nível inicial para o próximo reset (cm)' }),
            h('div', { class: 'fp-row' }, [initial, applyInitial]),
            h('p', { class: 'fp-hint', text: 'Usado quando a simulação é reiniciada.' })
        ]);
        root.append(initialGroup);

        function refresh(plant, runtime) {
            const tank = byId(plant.tanks, id);
            if (!tank) return;
            level.textContent = fmt(tank.heightCm, 1);
            percent.textContent = fmt(tank.level, 0);
            volume.textContent = fmt(tank.volume, 2);
            const lt = byId(plant.levelSensors, `LT${id.slice(1)}`);
            sensor.textContent = lt
                ? `${isaTag(lt.id)}: ${lt.pressure === null ? '—' : fmt(lt.pressure, 3) + ' kPa'} · ${lt.voltage === null ? '—' : fmt(lt.voltage, 3) + ' V'}${lt.status && lt.status !== 'available' ? ' · ' + lt.status : ''}`
                : '';
            const tag = loopWithPv('nivel', id, runtime);
            loopLink.hidden = !tag;
            if (tag) {
                loopLink.textContent = `Abrir malha ${tag}`;
                loopLink.onclick = () => show({ kind: 'loop', id: tag });
            }
            const modelica = runtime.backendMode === 'MODELICA' && runtime.writable;
            initialGroup.hidden = !modelica;
            if (modelica) {
                const value = runtime.sim?.initialLevels?.[id];
                if (!isEditing(initial) && value !== undefined) initial.value = String(value);
                initial.max = String(runtime.sim?.tankHeightCm ?? 25);
            }
        }
        return { root, refresh };
    }

    // TRANSMISSORES
    function sensorView(kind, id) {
        const root = h('section', { class: 'fp-body fp-sensor' });
        root.append(header(isaTag(id), componentDescription(id)));
        const value = h('strong', { class: 'fp-big' });
        const unit = h('span', { class: 'fp-unit', text: kind === 'lt' ? 'cm' : 'L/min' });
        root.append(h('div', { class: 'fp-values' }, [
            h('div', { class: 'fp-value' }, [h('span', { class: 'fp-label', text: kind === 'lt' ? 'Nível' : 'Vazão' }), value, unit])
        ]));
        const meta = h('p', { class: 'fp-meta' });
        root.append(meta);
        const loopLink = h('button', { type: 'button', class: 'fp-apply' });
        loopLink.hidden = true;
        const tankLink = h('button', { type: 'button', class: 'fp-apply' });
        tankLink.hidden = true;
        root.append(h('div', { class: 'fp-row' }, [loopLink, tankLink]));

        function refresh(plant, runtime) {
            if (kind === 'lt') {
                const sensor = byId(plant.levelSensors, id);
                const tank = sensor ? byId(plant.tanks, sensor.tank) : null;
                const cm = sensor?.heightCm ?? tank?.heightCm ?? null;
                value.textContent = cm !== null ? fmt(cm, 1) : sensor?.level !== null && sensor ? `${fmt(sensor.level, 0)} %` : '—';
                meta.textContent = sensor
                    ? `Pressão ${sensor.pressure === null ? '—' : fmt(sensor.pressure, 3) + ' kPa'} · ${sensor.voltage === null ? '—' : fmt(sensor.voltage, 3) + ' V'} · bruto ${sensor.raw ?? '—'} · ${sensor.status ?? ''}`
                    : '';
                const tag = tank ? loopWithPv('nivel', tank.id, runtime) : null;
                loopLink.hidden = !tag;
                if (tag) { loopLink.textContent = `Abrir malha ${tag}`; loopLink.onclick = () => show({ kind: 'loop', id: tag }); }
                tankLink.hidden = !tank;
                if (tank) { tankLink.textContent = `Abrir ${isaTag(tank.id)}`; tankLink.onclick = () => show({ kind: 'tank', id: tank.id }); }
            } else {
                const sensor = byId(plant.flowSensors, id);
                value.textContent = sensor && sensor.flow !== null ? fmt(sensor.flow, 2) : '—';
                meta.textContent = sensor ? `bruto ${sensor.raw ?? '—'} · ${sensor.status ?? ''}` : '';
                const tag = loopWithPv('vazao', id, runtime);
                loopLink.hidden = !tag;
                if (tag) { loopLink.textContent = `Abrir malha ${tag}`; loopLink.onclick = () => show({ kind: 'loop', id: tag }); }
            }
        }
        return { root, refresh };
    }

    // API
    function show(newSelection) {
        selection = newSelection;
        container.innerHTML = '';
        if (!selection) {
            container.hidden = true;
            view = null;
            container.dispatchEvent(new CustomEvent('faceplate-change', { detail: null }));
            return;
        }
        const { kind, id } = selection;
        view = kind === 'loop' ? loopView(id)
            : kind === 'pump' ? pumpView(id)
            : kind === 'valve' ? valveView(id)
            : kind === 'xv' ? xvView(id)
            : kind === 'hv' ? hvView(id)
            : kind === 'tank' ? tankView(id)
            : kind === 'lt' || kind === 'ft' ? sensorView(kind, id)
            : null;
        if (!view) {
            container.hidden = true;
            return;
        }
        container.append(view.root);
        container.hidden = false;
        if (lastPlant) view.refresh(lastPlant, lastRuntime);
        container.dispatchEvent(new CustomEvent('faceplate-change', { detail: selection }));
    }

    function hide() {
        show(null);
    }

    function update(plant, runtime = {}) {
        lastPlant = plant;
        lastRuntime = runtime;
        if (view && plant) view.refresh(plant, runtime);
    }

    return { show, hide, update, getSelection: () => selection };
}
