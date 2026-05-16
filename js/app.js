const App = (() => {
  const root = document.getElementById('app');

  /* ── Vistas embebidas (no fetch — funciona como file:// y como http://) ── */
  const VIEWS = {
    login: `
<div class="coop-stripe"></div>
<div class="login-wrap">
  <div id="login-icon-slot"></div>
  <div class="login-title" id="login-title"></div>
  <div class="login-subtitle" id="login-subtitle"></div>
  <div class="step-indicator" id="step-indicator"></div>
  <div class="pin-dots">
    <div class="pin-dot" id="dot-0"></div>
    <div class="pin-dot" id="dot-1"></div>
    <div class="pin-dot" id="dot-2"></div>
    <div class="pin-dot" id="dot-3"></div>
  </div>
  <div class="pin-error-msg" id="pin-error"></div>
  <div class="pin-pad" id="pin-pad">
    <div class="pin-key" data-key="1">1</div>
    <div class="pin-key" data-key="2">2</div>
    <div class="pin-key" data-key="3">3</div>
    <div class="pin-key" data-key="4">4</div>
    <div class="pin-key" data-key="5">5</div>
    <div class="pin-key" data-key="6">6</div>
    <div class="pin-key" data-key="7">7</div>
    <div class="pin-key" data-key="8">8</div>
    <div class="pin-key" data-key="9">9</div>
    <div class="pin-key key-empty" data-key=""></div>
    <div class="pin-key" data-key="0">0</div>
    <div class="pin-key key-del" data-key="del">⌫</div>
  </div>
</div>`,

    menu: `
<div class="menu-view">
  <div class="top-bar">
    <div class="top-brand">
      <div class="top-brand-logo">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11"
            stroke="white" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </div>
      <div>
        <div class="top-brand-name">Cosoop</div>
        <div class="top-brand-sub">Credicoop Coop. Ltdo.</div>
      </div>
    </div>
    <button class="top-cfg-btn" id="config-btn" aria-label="Configuración">⚙️</button>
  </div>
  <div class="greeting">
    <div class="greeting-title">Herramientas</div>
    <div class="greeting-sub">Seleccioná una sección para comenzar</div>
  </div>
  <div class="section-label">Módulos</div>
  <div class="menu-grid" id="menu-grid"></div>
  <div class="bottom-hint">Cosoop v1.0 · Funciona sin conexión</div>
</div>`
  };

  function showSetup() {
    root.innerHTML = VIEWS.login;
    initPinScreen(true);
  }

  function showLogin() {
    root.innerHTML = VIEWS.login;
    initPinScreen(false);
  }

  function showMenu() {
    root.innerHTML = VIEWS.menu;
    Menu.render();
    document.getElementById('config-btn')
      ?.addEventListener('click', () => navigateTo('config'));
  }

  /* ── Navegación ── */
  function navigateTo(section) {
    if (section === 'menu')   { showMenu();           return; }
    if (section === 'sim')    { SimView.render();      return; }
    if (section === 'dcpd')   { DCPD.render();         return; }
    if (section === 'pex')    { PEX.render();          return; }
    if (section === 'pf')     { PF.render();           return; }
    if (section === 'config') { Config.render();       return; }
    if (section === 'tas')    { TasasView.render();    return; }
    if (section === 'pdf')    { PDFViewer.render();    return; }
    if (section === 'pda_bp') { PDA_BP.render();      return; }
    if (section === 'pda_be') { PDA_BE.render();      return; }
    if (section === 'hip_uva') { HipUVA.render();    return; }
  }

  /* ── Reiniciar (cambio de PIN) ── */
  function reiniciar() {
    Auth.clearPin();
    showSetup();
  }

  /* ── Lógica de PIN ── */
  let buffer   = '';
  let step     = 1;
  let pinStep1 = '';

  function updateDots(count, state) {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`dot-${i}`);
      if (!dot) continue;
      dot.classList.remove('filled', 'error');
      if (state === 'error') dot.classList.add('error');
      else if (i < count)   dot.classList.add('filled');
    }
  }

  function showError(msg) {
    const el = document.getElementById('pin-error');
    if (el) el.textContent = msg;
    updateDots(4, 'error');
    setTimeout(() => {
      updateDots(0);
      if (el) el.textContent = '';
    }, 1000);
  }

  function initPinScreen(isSetup) {
    buffer   = '';
    step     = 1;
    pinStep1 = '';

    const title    = document.getElementById('login-title');
    const subtitle = document.getElementById('login-subtitle');
    const stepEl   = document.getElementById('step-indicator');
    const iconSlot = document.getElementById('login-icon-slot');

    const bankSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M8 10v11M12 10v11M16 10v11M20 10v11"
        stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    const lockSVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="#C8102E" stroke-width="1.8"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#C8102E" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="12" cy="16" r="1.5" fill="#C8102E"/>
    </svg>`;

    if (isSetup) {
      iconSlot.innerHTML = `<div class="setup-logo">${bankSVG}</div>`;
      title.textContent    = 'Bienvenido';
      subtitle.textContent = 'Configurá tu PIN de 4 dígitos para proteger el acceso';
      stepEl.textContent   = 'Paso 1 de 2 — Ingresá tu PIN';
    } else {
      iconSlot.innerHTML = `<div class="login-icon">${lockSVG}</div>`;
      title.textContent    = 'Ingresá tu PIN';
      subtitle.textContent = 'Cosoop · Credicoop';
      stepEl.textContent   = '';
    }

    document.getElementById('pin-pad')
      .addEventListener('click', e => {
        const key = e.target.closest('[data-key]')?.dataset.key;
        if (key !== undefined) handleKey(key, isSetup);
      });
  }

  function handleKey(key, isSetup) {
    if (key === 'del') {
      if (buffer.length > 0) buffer = buffer.slice(0, -1);
      updateDots(buffer.length);
      return;
    }
    if (key === '' || buffer.length >= 4) return;

    buffer += key;
    updateDots(buffer.length);
    if (buffer.length < 4) return;

    const pin = buffer;
    buffer = '';

    if (isSetup) {
      handleSetup(pin);
    } else {
      handleLogin(pin);
    }
  }

  function handleSetup(pin) {
    const stepEl = document.getElementById('step-indicator');
    if (step === 1) {
      pinStep1 = pin;
      step = 2;
      stepEl.textContent = 'Paso 2 de 2 — Confirmá tu PIN';
      updateDots(0);
    } else {
      if (pin === pinStep1) {
        Auth.savePin(pin);
        showMenu();
      } else {
        step     = 1;
        pinStep1 = '';
        stepEl.textContent = 'Paso 1 de 2 — Ingresá tu PIN';
        showError('Los PINs no coinciden');
      }
    }
  }

  function handleLogin(pin) {
    if (Auth.validatePin(pin)) {
      showMenu();
    } else {
      showError('PIN incorrecto');
    }
  }

  /* ── Arranque ── */
  function init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
      navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'SW_UPDATED') window.location.reload();
      });
    }
    /*
     * Cuando Android restaura la app desde memoria (bfcache),
     * forzamos recarga para que el SW sirva los archivos actualizados.
     */
    window.addEventListener('pageshow', e => {
      if (e.persisted) window.location.reload();
    });
    Auth.isPinSet() ? showLogin() : showSetup();
  }

  return { init, navigateTo, reiniciar };
})();

App.init();
