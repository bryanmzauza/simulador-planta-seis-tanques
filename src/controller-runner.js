import workerSource from './controller-worker.js?raw';

/* O iframe não possui permissão de mesma origem. Sua CSP também se aplica ao Worker
   criado via Blob: os scripts não podem buscar/importar recursos nem abrir WebSockets de hardware.
 */
export class ControllerRunner {
    constructor({ onState, onLog }) {
        this.onState = onState;
        this.onLog = onLog;
        this.state = 'stopped';
        this.receive = event => {
            if (!this.frame || event.source !== this.frame.contentWindow) return;
            const data = event.data;
            if (data?.type === 'ready' && this.state === 'starting') {
                clearTimeout(this.timer);
                this.setState('running');
            } else if (data?.type === 'error') this.fail(data.message);
            else if (data?.type === 'result' && this.pending) {
                const pending = this.pending;
                this.pending = null;
                clearTimeout(this.timer);
                pending.resolve(data);
            }
        };
        window.addEventListener('message', this.receive);
    }
    setState(state) { this.state = state; this.onState(state); }
    start(code) {
        this.stop();
        this.setState('starting');
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.setAttribute('sandbox', 'allow-scripts');
        const payload = JSON.stringify({ workerSource, code }).replace(/</g, '\\u003c');
        frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' blob:; worker-src blob:; connect-src 'none'"><script>
            const payload = ${payload};
            const worker = new Worker(URL.createObjectURL(new Blob([payload.workerSource], {type: 'text/javascript'})));
            worker.onmessage = e => parent.postMessage(e.data, '*');
            worker.onerror = () => parent.postMessage({type:'error', message:'Falha no Worker.'}, '*');
            onmessage = e => { if(e.source === parent) worker.postMessage(e.data); };
            worker.postMessage({type:'init', code:payload.code});
        <\/script>`;
        this.frame = frame;
        document.body.append(frame);
        this.timer = setTimeout(() => this.fail('Tempo limite ao iniciar código.'), 3000);
    }
    tick(plant, dt) {
        if (this.state !== 'running' || this.pending) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
            this.pending = { resolve, reject };
            this.timer = setTimeout(() => this.fail('Código interrompido: ciclo excedeu 1 segundo.'), 1000);
            this.frame.contentWindow.postMessage({ type: 'tick', plant, dt }, '*');
        });
    }
    pause() { if (this.state === 'running') this.setState('paused'); }
    resume() { if (this.state === 'paused') this.setState('running'); }
    stop() {
        clearTimeout(this.timer);
        this.frame?.remove();
        this.frame = null;
        this.pending?.resolve(null);
        this.pending = null;
        this.setState('stopped');
    }
    fail(message) {
        this.stop();
        this.setState('error');
        this.onLog(String(message).slice(0, 1000), true);
    }
}
