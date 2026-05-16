const PEX = (() => {
  'use strict';

  const ARANCEL_DEFAULT = 0.018;
  const STORAGE_KEY     = 'pex_arancel';

  let monto   = 0;
  let dias    = 0;
  let tna     = 0;      // decimal, ej. 0.44 para 44%
  let arancel = ARANCEL_DEFAULT;
  let debT    = null;

  function loadArancel() {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY));
    return isNaN(v) || v <= 0 ? ARANCEL_DEFAULT : v / 100;
  }

  function saveArancel(pct) {
    localStorage.setItem(STORAGE_KEY, pct);
  }

  /* ═══════════════════════════════════════════════════
     VIEW
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="pex-view">
  <div class="pex-topbar">
    <button class="pex-back" id="pex-back">&#8249;</button>
    <span class="pex-title">PEX — Anticipo TC</span>
  </div>

  <div class="pex-scroll">

    <!-- Inputs -->
    <div class="pex-card">
      <div class="pex-field-row">
        <label class="pex-field-label" for="pex-monto">Monto del Cupón</label>
        <div class="pex-input-wrap">
          <span class="pex-sym">$</span>
          <input id="pex-monto" class="pex-input" type="number"
                 inputmode="decimal" placeholder="0" min="1" step="0.01">
        </div>
      </div>
      <div class="pex-divider"></div>
      <div class="pex-field-row">
        <label class="pex-field-label" for="pex-dias">Días de adelanto</label>
        <input id="pex-dias" class="pex-input pex-input-dias" type="number"
               inputmode="numeric" placeholder="0" min="1" step="1">
      </div>
      <div class="pex-divider"></div>
      <div class="pex-field-row">
        <label class="pex-field-label" for="pex-tna">TNA</label>
        <div class="pex-input-wrap">
          <input id="pex-tna" class="pex-input" type="number"
                 inputmode="decimal" placeholder="0,00" min="0.01" step="0.01">
          <span class="pex-sym">%</span>
        </div>
      </div>
      <div class="pex-divider"></div>
      <div class="pex-field-row">
        <label class="pex-field-label" for="pex-arancel">Arancel TC</label>
        <div class="pex-input-wrap">
          <input id="pex-arancel" class="pex-input pex-input-arancel" type="number"
                 inputmode="decimal" placeholder="1,80" min="0.01" step="0.01">
          <span class="pex-sym">%</span>
        </div>
      </div>
    </div>

    <!-- Resultados -->
    <div id="pex-results" style="display:none">
      <div class="pex-section-hdr">Resultado</div>
      <div class="pex-card pex-result-card">
        <div class="pex-result-row">
          <span class="pex-rl">Monto Sujeto a PEX</span>
          <span class="pex-rv" id="r-sujeto"></span>
        </div>
        <div class="pex-divider"></div>
        <div class="pex-result-row">
          <span class="pex-rl">Costo PEX (comisión directa)</span>
          <span class="pex-rv" id="r-costo"></span>
        </div>
        <div class="pex-divider"></div>
        <div class="pex-result-row">
          <span class="pex-rl">CFT (EA)</span>
          <span class="pex-rv" id="r-cft"></span>
        </div>
        <div class="pex-divider"></div>
        <div class="pex-result-row pex-row-neg">
          <span class="pex-rl">Intereses</span>
          <span class="pex-rv" id="r-intereses"></span>
        </div>
        <div class="pex-divider pex-divider-strong"></div>
        <div class="pex-result-row pex-row-accent">
          <span class="pex-rl pex-rl-accent">Monto Neto a Acreditar</span>
          <span class="pex-rv pex-rv-accent" id="r-neto"></span>
        </div>
      </div>
    </div>

    <!-- Estado vacío -->
    <div class="pex-empty" id="pex-empty">
      Ingresá el monto, los días y la TNA para simular
    </div>

    <div style="height:48px"></div>
  </div>
</div>`;

  /* ═══════════════════════════════════════════════════
     CÁLCULO
  ═══════════════════════════════════════════════════ */
  function calcular() {
    if (monto <= 0 || dias <= 0 || tna <= 0) return null;

    const montoSujeto = monto * (1 - arancel);
    const intereses   = montoSujeto * tna / 365 * dias;
    const montoNeto   = montoSujeto - intereses;
    const costoPEX    = tna / 365 * dias;
    const cft         = Math.pow(1 + intereses / montoNeto, 365 / dias) - 1;

    return { montoSujeto, intereses, montoNeto, costoPEX, cft };
  }

  /* ═══════════════════════════════════════════════════
     FORMATO
  ═══════════════════════════════════════════════════ */
  const fmtARS = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const fmtPct2 = v => (v * 100).toFixed(2).replace('.', ',') + '%';
  const fmtPct4 = v => (v * 100).toFixed(4).replace('.', ',') + '%';

  /* ═══════════════════════════════════════════════════
     UI
  ═══════════════════════════════════════════════════ */
  function updateResults() {
    const res     = calcular();
    const resEl   = document.getElementById('pex-results');
    const emptyEl = document.getElementById('pex-empty');
    if (!resEl || !emptyEl) return;

    if (!res) {
      resEl.style.display   = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    resEl.style.display   = 'block';
    emptyEl.style.display = 'none';

    document.getElementById('r-sujeto').textContent    = fmtARS.format(res.montoSujeto);
    document.getElementById('r-costo').textContent     = fmtPct4(res.costoPEX);
    document.getElementById('r-cft').textContent       = fmtPct2(res.cft);
    document.getElementById('r-intereses').textContent = fmtARS.format(res.intereses);
    document.getElementById('r-neto').textContent      = fmtARS.format(res.montoNeto);
  }

  function scheduleRecalc() {
    clearTimeout(debT);
    debT = setTimeout(updateResults, 120);
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  function init() {
    document.getElementById('pex-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    document.getElementById('pex-monto')
      ?.addEventListener('input', e => {
        monto = parseFloat(e.target.value) || 0;
        scheduleRecalc();
      });

    document.getElementById('pex-dias')
      ?.addEventListener('input', e => {
        dias = parseInt(e.target.value, 10) || 0;
        scheduleRecalc();
      });

    document.getElementById('pex-tna')
      ?.addEventListener('input', e => {
        tna = (parseFloat(e.target.value) || 0) / 100;
        scheduleRecalc();
      });

    document.getElementById('pex-arancel')
      ?.addEventListener('input', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v > 0) {
          arancel = v / 100;
          saveArancel(v);
        }
        scheduleRecalc();
      });

    updateResults();
  }

  /* ═══════════════════════════════════════════════════
     VALIDACIÓN — caso de prueba (TNA=44, días=10, monto=1.000.000)
     Esperado: sujeto=982.000, intereses=11.837,81, neto=970.162,19
               costoPEX=1,2055%, CFT=55,69%
  ═══════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    monto = 0; dias = 0; tna = 0;
    arancel = loadArancel();
    clearTimeout(debT);
    document.getElementById('app').innerHTML = VIEW;
    /* Precarga el valor guardado en el input */
    const arancelInput = document.getElementById('pex-arancel');
    if (arancelInput) arancelInput.value = (arancel * 100).toFixed(2);
    init();
  }

  return { render };
})();
