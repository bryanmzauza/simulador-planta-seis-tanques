import { PLANT_CONFIG } from './plant-config.js';
import { componentLabel } from './component-labels.js';
import { dia, shapes } from '@joint/core';


function readableDefaults(defaults) {
    defaults.z = 10;
    const [sx, sy, font] = PLANT_CONFIG.componentScale[defaults.type.split('.').pop()] ?? [1, 1, 1];
    defaults.size.width *= sx;
    defaults.size.height *= sy;
    for (const attrs of Object.values(defaults.attrs)) {
        for (const key of ['x', 'x1', 'x2', 'cx', 'width']) if (typeof attrs[key] === 'number') attrs[key] *= sx;
        for (const key of ['y', 'y1', 'y2', 'cy', 'height']) if (typeof attrs[key] === 'number') attrs[key] *= sy;
        if (typeof attrs.r === 'number') attrs.r *= sx;
        if (typeof attrs.fontSize === 'number') attrs.fontSize *= font;
    }
    return defaults;
}

// AUXILIAR DE ABERTURA
/* Evita que valores como 0.999 ou 0.001 sejam exibidos como
   100% / 0% mas mantenham a cor de posição intermediária.
 */

function normalizeOpening(value) {

    const clamped =
        Math.max(
            0,
            Math.min(
                1,
                Number.isFinite(value)
                    ? value
                    : 0
            )
        );

    if (clamped <= 0.005) {
        return 0;
    }

    if (clamped >= 0.995) {
        return 1;
    }

    return clamped;
}

// TANQUE PET

export class LiquidTank extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.LiquidTank',

            size: {
                width: 110,
                height: 200
            },

            attrs: {

                liquid: {
                    d: '',
                    fill: '#5593b3',
                    opacity: 1,
                    stroke: 'none'
                },

                body: {
                    d: `
                        M 18 8
                        Q 14 8 14 14
                        L 14 118
                        Q 14 132 23 143
                        L 34 155
                        Q 39 160 39 168
                        L 39 188
                        Q 39 194 45 194
                        L 65 194
                        Q 71 194 71 188
                        L 71 168
                        Q 71 160 76 155
                        L 87 143
                        Q 96 132 96 118
                        L 96 14
                        Q 96 8 92 8
                        Z
                    `,

                    fill: '#f1f2f3',
                    fillOpacity: 0.18,

                    stroke: '#636c72',
                    strokeWidth: 2
                },

                topLine: {
                    x1: 21,
                    y1: 14,

                    x2: 89,
                    y2: 14,

                    stroke: '#899196',
                    strokeWidth: 2
                },

                neckLine1: {
                    x1: 40,
                    y1: 177,

                    x2: 70,
                    y2: 177,

                    stroke: '#899196',
                    strokeWidth: 1
                },

                neckLine2: {
                    x1: 40,
                    y1: 184,

                    x2: 70,
                    y2: 184,

                    stroke: '#899196',
                    strokeWidth: 1
                },

                typeLabel: {
                    x: 55,
                    y: 29,

                    text: 'TANQUE',

                    textAnchor: 'middle',

                    fontSize: 7,
                    fontWeight: 'bold',

                    fill: '#535c62'
                },

                idLabel: {
                    x: 55,
                    y: 48,

                    text: 'T1',

                    textAnchor: 'middle',

                    fontSize: 16,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                levelText: {
                    x: 55,
                    y: 102,

                    text: '0.0%',

                    textAnchor: 'middle',

                    fontSize: 14,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                volumeText: {
                    x: 55,
                    y: 123,

                    text: '0.00 L',

                    textAnchor: 'middle',

                    fontSize: 9,

                    fill: '#414b52'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'defs',
                children: [{
                    tagName: 'clipPath',
                    selector: 'liquidClip',
                    attributes: { clipPathUnits: 'userSpaceOnUse' },
                    children: [{ tagName: 'path', selector: 'liquidOutline' }]
                }]
            },

            {
                tagName: 'path',
                selector: 'liquid'
            },

            {
                tagName: 'path',
                selector: 'body'
            },

            {
                tagName: 'line',
                selector: 'topLine'
            },

            {
                tagName: 'line',
                selector: 'neckLine1'
            },

            {
                tagName: 'line',
                selector: 'neckLine2'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'levelText'
            },

            {
                tagName: 'text',
                selector: 'volumeText'
            }
        ];
    }

    updateTank(data) {

        const level =
            Math.max(
                0,
                Math.min(
                    100,
                    data.level ?? 0
                )
            );

        const volume =
            data.volume ?? 0;

        const topY = 8;
        const bottomY = 194;

        const usableHeight =
            bottomY - topY;

        const fillY =
            bottomY -
            (
                level /
                100
            ) *
            usableHeight;

        this.attr({

            idLabel: {
                text:
                    componentLabel(data.id ?? 'H?')
            },

            /* Recorta o preenchimento horizontal conforme o contorno curvo da garrafa.
               Cada tanque possui seu próprio ID de recorte, mantendo os níveis independentes.
             */
            liquidClip: { id: `tank-liquid-${this.id}` },
            liquidOutline: { d: this.attr('body/d') },
            liquid: {
                d: level > 0 ? `M 0 ${fillY} H 110 V ${bottomY} H 0 Z` : '',
                'clip-path': `url(#tank-liquid-${this.id})`
            },

            levelText: {
                text:
                    Number.isFinite(data.level) ? `${level.toFixed(1).replace('.', ',')}%` : '—'
            },

            volumeText: {
                text:
                    Number.isFinite(data.volume) ? `${volume.toFixed(2).replace('.', ',')} L` : '—'
            }
        });
    }
}

// BOMBA

export class Pump extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.Pump',

            size: {
                width: 66,
                height: 66
            },

            attrs: {

                outer: {
                    cx: 33,
                    cy: 33,
                    r: 32,

                    fill: '#343b40',

                    stroke: '#c83e3e',
                    strokeWidth: 2
                },

                inner: {
                    cx: 33,
                    cy: 33,
                    r: 23,

                    fill: '#343b40',

                    stroke: '#c83e3e',
                    strokeWidth: 1
                },

                typeLabel: {
                    x: 33,
                    y: 27,

                    text: 'PUMP',

                    textAnchor: 'middle',

                    fontSize: 8,
                    fontWeight: 'bold',

                    fill: '#d4dade'
                },

                idLabel: {
                    x: 33,
                    y: 44,

                    text: 'B1',

                    textAnchor: 'middle',

                    fontSize: 15,
                    fontWeight: 'bold',

                    fill: '#f2f4f5'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'circle',
                selector: 'outer'
            },

            {
                tagName: 'circle',
                selector: 'inner'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            }
        ];
    }

    updatePump(data) {

        const on =
            data.power === 1;

        this.attr({

            typeLabel: { text: on ? 'ON' : 'OFF' },

            idLabel: {
                text:
                    componentLabel(data.id ?? 'P?')
            },

            outer: {
                stroke:
                    on
                        ? '#209b60'
                        : '#c83e3e'
            },

            inner: {

                fill:
                    on
                        ? '#343b40'
                        : '#343b40',

                stroke:
                    on
                        ? '#209b60'
                        : '#c83e3e'
            }
        });
    }
}

// SENSOR DE NÍVEL

export class LevelSensor extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.LevelSensor',

            size: {
                width: 62,
                height: 36
            },

            attrs: {

                body: {
                    width: 62,
                    height: 36,

                    rx: 4,
                    ry: 4,

                    fill: '#f4f5f5',

                    stroke: '#8b959c',
                    strokeWidth: 1.5
                },

                typeLabel: {
                    display: 'none',
                    x: 31,
                    y: 9,

                    text: 'LEVEL',

                    textAnchor: 'middle',

                    fontSize: 6,
                    fontWeight: 'bold',

                    fill: '#505d65'
                },

                idLabel: {
                    x: 31,
                    y: 9,

                    text: 'LT1',

                    textAnchor: 'middle',

                    fontSize: 6,
                    fontWeight: 'bold',

                    fill: '#505d65'
                },

                levelText: {
                    x: 31,
                    y: 23,

                    text: '0.0%',

                    textAnchor: 'middle',

                    fontSize: 12,
                    fontWeight: 'bold',

                    fill: '#304956'
                },

                pressureText: {
                    x: 31,
                    y: 34,

                    text: '0.00 kPa',

                    textAnchor: 'middle',

                    fontSize: 5.5,

                    fill: '#505d65'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'levelText'
            },

            {
                tagName: 'text',
                selector: 'pressureText'
            }
        ];
    }

    updateSensor(data) {

        this.attr({

            idLabel: {
                text:
                    componentLabel(data.id ?? 'LT?')
            },

            levelText: {
                text:
                    Number.isFinite(data.level) ? `${data.level.toFixed(1).replace('.', ',')}%` : '—'
            },

            pressureText: {
                text:
                    Number.isFinite(data.pressure) ? `${data.pressure.toFixed(2).replace('.', ',')} kPa` : '—'
            }
        });
    }
}

// SENSOR DE VAZÃO

export class FlowSensor extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.FlowSensor',

            size: {
                width: 58,
                height: 32
            },

            attrs: {

                body: {
                    width: 58,
                    height: 32,

                    rx: 4,
                    ry: 4,

                    fill: '#f4f5f5',

                    stroke: '#8b959c',
                    strokeWidth: 1.5
                },

                typeLabel: {
                    display: 'none',
                    x: 29,
                    y: 8,

                    text: 'FLOW',

                    textAnchor: 'middle',

                    fontSize: 5.8,
                    fontWeight: 'bold',

                    fill: '#505d65'
                },

                idLabel: {
                    x: 29,
                    y: 9,

                    text: 'FT1',

                    textAnchor: 'middle',

                    fontSize: 6,
                    fontWeight: 'bold',

                    fill: '#505d65'
                },

                flowText: {
                    x: 29,
                    y: 23,

                    text: '0.00 L/min',

                    textAnchor: 'middle',

                    fontSize: 9,
                    fontWeight: 'bold',

                    fill: '#304956'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'flowText'
            }
        ];
    }

    updateSensor(data) {

        this.attr({

            idLabel: {
                text:
                    componentLabel(data.id ?? 'FT?')
            },

            flowText: {
                text:
                    Number.isFinite(data.flow) ? `${data.flow.toFixed(2).replace('.', ',')} L/min` : '—'
            }
        });
    }
}

// VÁLVULA ATUADA V1 - V4
/* Intencionalmente simples:
   - formato vertical
   - preenchimento sempre preto
   - texto sempre branco/cinza
   - SOMENTE a borda muda com a abertura
 */

export class ActuatedValve extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.ActuatedValve',

            size: {
                width: 42,
                height: 76
            },

            attrs: {

                body: {
                    x: 1,
                    y: 1,

                    width: 40,
                    height: 74,

                    rx: 3,
                    ry: 3,

                    fill: '#f5f6f7',

                    stroke: '#42545f',
                    strokeWidth: 2
                },

                typeLabel: {
                    x: 21,
                    y: 14,

                    text: 'ATUADA',

                    textAnchor: 'middle',

                    fontSize: 5.5,
                    fontWeight: 'bold',

                    fill: '#505a61'
                },

                idLabel: {
                    x: 21,
                    y: 40,

                    text: 'V1',

                    textAnchor: 'middle',

                    fontSize: 15,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                valueText: {
                    x: 21,
                    y: 61,

                    text: '100%',

                    textAnchor: 'middle',

                    fontSize: 7,
                    fontWeight: 'bold',

                    fill: '#35424b'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'valueText'
            }
        ];
    }

    updateValve(data) {

        const value =
            normalizeOpening(
                data.opening ?? 0
            );

        let borderColor =
            '#c83e3e';

        if (
            value > 0 &&
            value < 1
        ) {

            borderColor =
                '#d5a516';
        }

        if (
            value === 1
        ) {

            borderColor =
                '#209b60';
        }

        this.attr({

            body: {
                fill: '#292e32',
                stroke: borderColor, strokeWidth: 3
            },

            typeLabel: { fill: '#c1c8cc' },
            idLabel: { text: componentLabel(data.id ?? 'V?'), fill: '#f2f4f5' },

            valueText: {
                text:
                    `${Math.round(
                        value *
                        100
                    )}%`,

                fill: '#f2f4f5'
            }
        });
    }
}

// VÁLVULAS DE 3 VIAS
/* X1A, X1B, X2A e X2B
 */

export class RelayThreeWayValve extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.RelayThreeWayValve',

            size: {
                width: 58,
                height: 46
            },

            attrs: {

                body: {
                    width: 58,
                    height: 46,

                    rx: 4,
                    ry: 4,

                    fill: '#f4f5f6',

                    stroke: '#929ba1',
                    strokeWidth: 1.5
                },

                typeLabel: {
                    x: 29,
                    y: 11,

                    text: '3-WAY',

                    textAnchor: 'middle',

                    fontSize: 6,
                    fontWeight: 'bold',

                    fill: '#505a61'
                },

                idLabel: {
                    x: 29,
                    y: 27,

                    text: 'X1A',

                    textAnchor: 'middle',

                    fontSize: 12,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                stateText: {
                    x: 29,
                    y: 39,

                    text: 'OFF',

                    textAnchor: 'middle',

                    fontSize: 7,
                    fontWeight: 'bold',

                    fill: '#c83e3e'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'stateText'
            }
        ];
    }

    updateValve(data) {

        const on =
            Boolean(
                data.state
            );

        const color =
            on
                ? '#209b60'
                : '#c83e3e';

        this.attr({

            idLabel: {
                text:
                    componentLabel(data.id ?? 'X?')
            },

            body: {
                fill: '#e4e7e9',
                strokeWidth: 3,
                stroke:
                    color
            },

            stateText: {

                text:
                    on
                        ? 'ON'
                        : 'OFF',

                fill:
                    color
            }
        });
    }
}

// VÁLVULA MANUAL

export class ManualValve extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.ManualValve',

            size: {
                width: 50,
                height: 34
            },

            attrs: {

                body: {
                    width: 50,
                    height: 34,

                    rx: 4,
                    ry: 4,

                    fill: '#b8c0c5',

                    stroke: '#69747c',
                    strokeWidth: 1.5
                },

                typeLabel: {
                    x: 25,
                    y: 9,

                    text: 'MANUAL',

                    textAnchor: 'middle',

                    fontSize: 5.5,
                    fontWeight: 'bold',

                    fill: '#69747c'
                },

                idLabel: {
                    x: 25,
                    y: 22,

                    text: 'VR3',

                    textAnchor: 'middle',

                    fontSize: 10,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                valueText: {
                    x: 25,
                    y: 31,

                    text: '100%',

                    textAnchor: 'middle',

                    fontSize: 6,

                    fill: '#35424b'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'valueText'
            }
        ];
    }

    updateValve(data) {

        const value =
            normalizeOpening(
                data.opening ?? 0
            );

        this.attr({

            idLabel: {
                text:
                    componentLabel(data.id ?? 'RV?')
            },

            body: {
                fill: '#b8c0c5',
                stroke: value === 0 ? '#c83e3e' : value === 1 ? '#209b60' : '#d5a516'
            },

            valueText: {
                text:
                    `${Math.round(
                        value *
                        100
                    )}%`
            }
        });
    }
}

// VÁLVULA PRINCIPAL

export class MainValve extends dia.Element {

    defaults() {

        return readableDefaults({
            ...super.defaults,

            type: 'app.MainValve',

            size: {
                width: 62,
                height: 42
            },

            attrs: {

                body: {
                    width: 62,
                    height: 42,

                    rx: 4,
                    ry: 4,

                    fill: '#b8c0c5',

                    stroke: '#546d7b',
                    strokeWidth: 2
                },

                typeLabel: {
                    x: 31,
                    y: 13,

                    text: 'MANUAL',

                    textAnchor: 'middle',

                    fontSize: 7,
                    fontWeight: 'bold',

                    fill: '#505a61'
                },

                idLabel: {
                    x: 31,
                    y: 27,

                    text: 'VMC',

                    textAnchor: 'middle',

                    fontSize: 13,
                    fontWeight: 'bold',

                    fill: '#20272b'
                },

                valueText: {
                    x: 31,
                    y: 37,

                    text: '100%',

                    textAnchor: 'middle',

                    fontSize: 7,

                    fill: '#42545f'
                }
            }
        });
    }

    preinitialize() {

        this.markup = [

            {
                tagName: 'rect',
                selector: 'body'
            },

            {
                tagName: 'text',
                selector: 'typeLabel'
            },

            {
                tagName: 'text',
                selector: 'idLabel'
            },

            {
                tagName: 'text',
                selector: 'valueText'
            }
        ];
    }

    updateValve(data) {

        const value =
            normalizeOpening(
                data.opening ?? 0
            );

        let color =
            '#c83e3e';

        if (
            value > 0 &&
            value < 1
        ) {

            color =
                '#d5a516';
        }

        if (
            value === 1
        ) {

            color =
                '#209b60';
        }

        this.attr({

            valueText: {

                text:
                    `${Math.round(
                        value *
                        100
                    )}%`,

                fill:
                    color
            },

            body: {
                fill: '#b8c0c5',
                strokeWidth: 3,
                stroke:
                    color
            }
        });
    }
}

// TUBULAÇÃO

export function createPipe(
    graph,
    source,
    target
) {

    const pipe =
        new shapes.standard.Link();

    pipe.source(
        source
    );

    pipe.target(
        target
    );

    pipe.attr({

        line: {

            stroke:
                '#8c969d',

            strokeWidth:
                9,

            strokeLinecap:
                'round',

            strokeLinejoin:
                'round',

            sourceMarker:
                null,

            targetMarker:
                null
        }
    });

    pipe.addTo(
        graph
    );

    pipe.toBack();

    return pipe;
}

// INDICAÇÃO DE FLUXO

export function createFlow(
    graph,
    source,
    target
) {

    const flow =
        new shapes.standard.Link();

    flow.source(
        source
    );

    flow.target(
        target
    );

    flow.attr({

        line: {

            stroke:
                '#b8bfc4',

            strokeWidth:
                3,

            strokeDasharray:
                '8 7',

            strokeLinecap:
                'round',

            sourceMarker:
                null,

            targetMarker:
                null
        }
    });

    flow.addTo(
        graph
    );

    return flow;
}   
