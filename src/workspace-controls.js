// Controles apenas de layout; os eventos dos atuadores e a simulação permanecem inalterados.
export function setupWorkspaceControls() {
    const app = document.querySelector('.app');
    const sidebar = document.querySelector('.sidebar');
    sidebar.id = 'plant-sidebar';
    const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
    const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Persistência opcional. */ } };

    for (const [index, section] of [...sidebar.querySelectorAll('.control-section')].entries()) {
        const heading = section.querySelector('h2');
        if (!heading) continue;
        const key = `plant-section-${section.id || section.querySelector('[id]')?.id || index}`;
        const body = document.createElement('div');
        body.id = `${key}-body`;
        // Move os controles existentes, preservando todos os eventos registrados.
        for (const child of [...section.children]) if (child !== heading) body.append(child);
        const button = document.createElement('button');
        button.className = 'section-toggle';
        button.type = 'button';
        button.textContent = heading.textContent.trim();
        button.setAttribute('aria-label', button.textContent);
        button.setAttribute('aria-controls', body.id);
        heading.replaceChildren(button);
        section.append(body);
        const setOpen = open => {
            body.hidden = !open;
            button.setAttribute('aria-expanded', String(open));
            section.classList.toggle('section-collapsed', !open);
        };
        const stored = read(key);
        setOpen(stored === null ? section.closest('.sidebar-fixed') !== null : stored === 'true');
        button.onclick = () => { setOpen(body.hidden); save(key, String(!body.hidden)); };
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sidebar-toggle';
    toggle.setAttribute('aria-controls', sidebar.id);
    const toggleDock = document.createElement('div');
    toggleDock.className = 'sidebar-toggle-dock';
    toggleDock.append(toggle);
    app.append(toggleDock);
    let toggleMousePointerActive = false;
    toggle.addEventListener('pointerdown', event => {
        toggleMousePointerActive = event.pointerType === 'mouse';
    });
    let toggleReleaseTimer = null;
    const releaseToggleMouseFocus = event => {
        if (!toggleMousePointerActive || (event.pointerType && event.pointerType !== 'mouse')) return;
        toggleMousePointerActive = false;
        clearTimeout(toggleReleaseTimer);
        // O evento `click` é disparado logo após `pointerup`. Mover a aba aqui
        // de forma síncrona pode afastá-la do ponteiro e cancelar esse clique.
        toggleReleaseTimer = setTimeout(() => {
            toggle.blur();
            toggleDock.classList.remove('is-near');
        }, 0);
    };
    window.addEventListener('pointerup', releaseToggleMouseFocus);
    window.addEventListener('pointercancel', releaseToggleMouseFocus);
    window.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') return;
        const rect = toggleDock.getBoundingClientRect();
        toggleDock.classList.toggle('is-near',
            event.clientX >= rect.left - 20 && event.clientX <= rect.right + 12 &&
            event.clientY >= rect.top - 16 && event.clientY <= rect.bottom + 16);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', event => {
        toggleDock.classList.remove('is-near');
        releaseToggleMouseFocus(event);
    });
    const setSidebar = open => {
        sidebar.hidden = !open;
        app.classList.toggle('sidebar-collapsed', !open);
        toggle.innerHTML = `<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="${open ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        toggle.title = open ? 'Recolher controles da planta' : 'Abrir controles da planta';
        toggle.setAttribute('aria-label', toggle.title);
        toggle.setAttribute('aria-expanded', String(open));
        save('plant-sidebar-open', String(open));
    };
    setSidebar(read('plant-sidebar-open') !== 'false');
    toggle.onclick = event => {
        setSidebar(sidebar.hidden);

        /* Um clique do mouse mantém o foco no botão, o que deixaria
           a aba retrátil visível por causa de :focus-within. O foco pelo teclado
           é preservado para manter o controle acessível com Tab/Enter.
         */
        if (event.detail > 0) {
            toggle.blur();
            toggleDock.classList.remove('is-near');
        }
    };
    toggleDock.addEventListener('click', event => {
        // A área de clique invisível é maior que o botão visível.
        // Cliques originados no botão já executam seu próprio tratamento.
        // setSidebar() substitui o SVG para inverter a seta. Por isso, `event.target`
        // pode não estar mais dentro do botão durante a propagação do evento.
        // composedPath() continua identificando corretamente o clique original no botão.
        if (!event.composedPath().includes(toggle)) {
            toggle.click();
            toggle.blur();
            toggleDock.classList.remove('is-near');
        }
    });

    const panel = document.querySelector('.code-panel');
    const handle = document.createElement('div');
    handle.className = 'code-resize-handle';
    handle.tabIndex = 0;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', 'Altura do painel de código');
    handle.setAttribute('aria-controls', panel.id);
    panel.prepend(handle);
    let height = Number(read('plant-code-height')) || window.innerHeight * 0.46;
    let drag = null;
    const setHeight = value => {
        const max = Math.max(160, document.querySelector('.main-area').clientHeight - 180);
        height = Math.round(Math.max(Math.min(220, max), Math.min(max, value)));
        panel.style.height = `${height}px`;
        panel.style.minHeight = '0';
        handle.setAttribute('aria-valuemin', String(Math.min(220, max)));
        handle.setAttribute('aria-valuemax', String(max));
        handle.setAttribute('aria-valuenow', String(height));
        save('plant-code-height', String(height));
    };
    setHeight(height);
    handle.onpointerdown = event => {
        if (event.button !== 0) return;
        event.preventDefault();
        drag = { y: event.clientY, height: panel.getBoundingClientRect().height };
        handle.setPointerCapture(event.pointerId);
        document.body.classList.add('code-resizing');
    };
    handle.onpointermove = event => { if (drag) setHeight(drag.height + drag.y - event.clientY); };
    const stop = () => { drag = null; document.body.classList.remove('code-resizing'); };
    handle.onpointerup = stop;
    handle.onpointercancel = stop;
    handle.onlostpointercapture = stop;
    handle.onkeydown = event => {
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        setHeight(event.key === 'Home' ? 0 : event.key === 'End' ? Infinity : height + (event.key === 'ArrowUp' ? 25 : -25));
    };
    window.addEventListener('resize', () => setHeight(height));
}
