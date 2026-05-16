const PF = (() => {
  'use strict';

  let monto = 0;
  let dias  = 0;
  let tna   = 0;   // decimal, ej. 0.30 para 30%
  let debT  = null;

  /* ═══════════════════════════════════════════════════
     VIEW
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="pf-view">
  <div class="pf-topbar">
    <button class="pf-back" id="pf-back">&#8249;</button>
    <span class="pf-title">Plazo Fijo</span>
  </div>

  <div class="pf-scroll">

    <div class="pf-card">
      <div class="pf-field-row">
        <label class="pf-field-label" for="pf-monto">Monto</label>
        <div class="pf-input-wrap">
          <span class="pf-sym">$</span>
          <input id="pf-monto" class="pf-input" type="number"
                 inputmode="decimal" placeholder="0" min="1" step="0.01">
        </div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-field-row">
        <label class="pf-field-label" for="pf-dias">Plazo</label>
        <div class="pf-input-wrap">
          <input id="pf-dias" class="pf-input pf-input-sm" type="number"
                 inputmode="numeric" placeholder="0" min="1" step="1">
          <span class="pf-sym">días</span>
        </div>
      </div>
      <div class="pf-divider"></div>
      <div class="pf-field-row">
        <label class="pf-field-label" for="pf-tna">TNA</label>
        <div class="pf-input-wrap">
          <input id="pf-tna" class="pf-input pf-input-sm" type="number"
                 inputmode="decimal" placeholder="0,00" min="0.01" step="0.01">
          <span class="pf-sym">%</span>
        </div>
      </div>
    </div>

    <div id="pf-results" style="display:none">
      <div class="pf-section-hdr">Resultado</div>
      <div class="pf-card pf-result-card">
        <div class="pf-result-row">
          <span class="pf-rl">TEM</span>
          <span class="pf-rv" id="r-tem"></span>
        </div>
        <div class="pf-divider"></div>
        <div class="pf-result-row">
          <span class="pf-rl">TEA</span>
          <span class="pf-rv" id="r-tea"></span>
        </div>
        <div class="pf-divider"></div>
        <div class="pf-result-row">
          <span class="pf-rl">Intereses</span>
          <span class="pf-rv" id="r-intereses"></span>
        </div>
        <div class="pf-divider pf-divider-strong"></div>
        <div class="pf-result-row pf-row-accent">
          <span class="pf-rl pf-rl-accent">Monto Total al Vencimiento</span>
          <span class="pf-rv pf-rv-accent" id="r-total"></span>
        </div>
      </div>
    </div>

    <div class="pf-empty" id="pf-empty">
      Ingresá el monto, el plazo y la TNA para simular
    </div>

    <div style="height:48px"></div>
  </div>
</div>`;

  /* ═══════════════════════════════════════════════════
     CÁLCULO
     Convención bancaria AR: interés simple para PF.
     TEM = TNA × 30/365 (simple, no compuesta).
     TEA = (1 + TNA/365)^365 − 1 (compuesta, informativa).
  ═══════════════════════════════════════════════════ */
  function calcular() {
    if (monto <= 0 || dias <= 0 || tna <= 0) return null;

    const intereses  = monto * tna * dias / 365;
    const total      = monto + intereses;
    const tem        = tna * 30 / 365;
    const tea        = Math.pow(1 + tna / 365, 365) - 1;

    return { intereses, total, tem, tea };
  }

  /* ═══════════════════════════════════════════════════
     FORMATO
  ═══════════════════════════════════════════════════ */
  const fmtARS = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const fmtPct3 = v => (v * 100).toFixed(3).replace('.', ',') + '%';

  /* ═══════════════════════════════════════════════════
     UI
  ═══════════════════════════════════════════════════ */
  function updateResults() {
    const res     = calcular();
    const resEl   = document.getElementById('pf-results');
    const emptyEl = document.getElementById('pf-empty');
    if (!resEl || !emptyEl) return;

    if (!res) {
      resEl.style.display   = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    resEl.style.display   = 'block';
    emptyEl.style.display = 'none';

    document.getElementById('r-tem').textContent       = fmtPct3(res.tem);
    document.getElementById('r-tea').textContent       = fmtPct3(res.tea);
    document.getElementById('r-intereses').textContent = fmtARS.format(res.intereses);
    document.getElementById('r-total').textContent     = fmtARS.format(res.total);
  }

  function scheduleRecalc() {
    clearTimeout(debT);
    debT = setTimeout(updateResults, 120);
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  function init() {
    document.getElementById('pf-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    document.getElementById('pf-monto')
      ?.addEventListener('input', e => {
        monto = parseFloat(e.target.value) || 0;
        scheduleRecalc();
      });

    document.getElementById('pf-dias')
      ?.addEventListener('input', e => {
        dias = parseInt(e.target.value, 10) || 0;
        scheduleRecalc();
      });

    document.getElementById('pf-tna')
      ?.addEventListener('input', e => {
        tna = (parseFloat(e.target.value) || 0) / 100;
        scheduleRecalc();
      });

    updateResults();
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    monto = 0; dias = 0; tna = 0;
    clearTimeout(debT);
    document.getElementById('app').innerHTML = VIEW;
    init();
  }

  return { render };
})();
