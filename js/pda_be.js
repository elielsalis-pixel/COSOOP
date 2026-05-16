const PDA_BE = (() => {
  'use strict';

  let monto = 0, meses = 0, gracia = 0, frecCapital = 30;
  let fechaConst = null;
  let tnaFija = 0, mesesFija = 0, tnaVar = 0;
  let debT = null;

  /* ═══════════════════════════════════════════════════
     VIEW
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="be-view">
  <div class="be-topbar">
    <button class="be-back" id="be-back">&#8249;</button>
    <span class="be-title">Préstamos BE</span>
  </div>
  <div class="be-scroll">

    <div class="be-card">
      <div class="be-field-row">
        <label class="be-field-label" for="be-monto">Monto</label>
        <div class="be-input-wrap">
          <span class="be-sym">$</span>
          <input id="be-monto" class="be-input" type="number"
                 inputmode="decimal" placeholder="0" min="1" step="0.01">
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-meses">Cantidad de meses</label>
        <div class="be-input-wrap">
          <input id="be-meses" class="be-input be-input-sm" type="number"
                 inputmode="numeric" placeholder="0" min="1" step="1">
          <span class="be-sym">meses</span>
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-gracia">Período de gracia</label>
        <div class="be-input-wrap">
          <input id="be-gracia" class="be-input be-input-sm" type="number"
                 inputmode="numeric" placeholder="0" min="0" step="1">
          <span class="be-sym">días</span>
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-frec">Frecuencia capital</label>
        <div class="be-input-wrap">
          <input id="be-frec" class="be-input be-input-sm" type="number"
                 inputmode="numeric" placeholder="30" min="1" step="1">
          <span class="be-sym">días</span>
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-fecha">Fecha constitución</label>
        <input id="be-fecha" class="be-input-date" type="date">
      </div>
    </div>

    <div class="be-section-hdr">Tasas</div>
    <div class="be-card">
      <div class="be-field-row">
        <label class="be-field-label" for="be-tna-fija">TNA Fija</label>
        <div class="be-input-wrap">
          <input id="be-tna-fija" class="be-input be-input-sm" type="number"
                 inputmode="decimal" placeholder="0,00" min="0.01" step="0.01">
          <span class="be-sym">%</span>
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-meses-fija">Meses a tasa fija</label>
        <div class="be-input-wrap">
          <input id="be-meses-fija" class="be-input be-input-sm" type="number"
                 inputmode="numeric" placeholder="0" min="1" step="1">
          <span class="be-sym">meses</span>
        </div>
      </div>
      <div class="be-divider"></div>
      <div class="be-field-row">
        <label class="be-field-label" for="be-tna-var">TNA Variable</label>
        <div class="be-input-wrap">
          <input id="be-tna-var" class="be-input be-input-sm" type="number"
                 inputmode="decimal" placeholder="—" min="0" step="0.01" disabled>
          <span class="be-sym">%</span>
        </div>
      </div>
    </div>

    <div id="be-results" style="display:none">
      <div class="be-section-hdr">Resumen</div>
      <div class="be-card be-result-card">
        <div class="be-result-row">
          <span class="be-rl">TNA Fija</span>
          <span class="be-rv" id="r-fija"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">CFT TEA</span>
          <span class="be-rv" id="r-cft-tea"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">CFT TNA (30d)</span>
          <span class="be-rv" id="r-cft-tna"></span>
        </div>
        <div class="be-divider bp-divider-strong"></div>
        <div class="be-result-row">
          <span class="be-rl">Cuota Pura Promedio</span>
          <span class="be-rv" id="r-cp-prom"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">Cuota Final Promedio s/IVA</span>
          <span class="be-rv" id="r-cf-sin-iva"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">IVA Promedio</span>
          <span class="be-rv" id="r-iva-prom"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row be-row-accent">
          <span class="be-rl be-rl-accent">Cuota Final Promedio</span>
          <span class="be-rv be-rv-accent" id="r-cf-prom"></span>
        </div>
        <div class="be-divider bp-divider-strong"></div>
        <div class="be-result-row">
          <span class="be-rl">Duration</span>
          <span class="be-rv" id="r-duration"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">Total capital</span>
          <span class="be-rv" id="r-total-cap"></span>
        </div>
        <div class="be-divider"></div>
        <div class="be-result-row">
          <span class="be-rl">Total intereses</span>
          <span class="be-rv" id="r-total-int"></span>
        </div>
        <div class="be-divider bp-divider-strong"></div>
        <div class="be-result-row be-row-accent">
          <span class="be-rl be-rl-accent">Total capital + intereses + gastos</span>
          <span class="be-rv be-rv-accent" id="r-total-all"></span>
        </div>
      </div>

      <div class="be-section-hdr" style="margin-top:20px">Cuadro de Marcha</div>
      <div class="be-table-wrap">
        <table class="be-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha pago</th>
              <th>Días</th>
              <th>Cuota Pura</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>IVA</th>
              <th>Cuota Final</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody id="be-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="be-empty" id="be-empty">
      Ingresá los datos del préstamo para simular
    </div>

    <div style="height:48px"></div>
  </div>
</div>`;

  /* ═══════════════════════════════════════════════════
     UTILIDADES DE FECHA
  ═══════════════════════════════════════════════════ */
  function addMonths(date, n) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }

  function daysDiff(d1, d2) {
    return Math.round((d2.getTime() - d1.getTime()) / 86400000);
  }

  function fmtDate(d) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  function toDateInput(d) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function parseDate(str) {
    if (!str) return null;
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /* ═══════════════════════════════════════════════════
     IRR — bisección para CFT
  ═══════════════════════════════════════════════════ */
  function irr(flows, times) {
    function npv(r) {
      let v = 0;
      for (let i = 0; i < flows.length; i++) {
        v += flows[i] / Math.pow(1 + r, times[i] / 365);
      }
      return v;
    }
    let lo = 0.0001, hi = 200;
    if (npv(lo) < 0 || npv(hi) > 0) return 0;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (npv(mid) > 0) lo = mid; else hi = mid;
      if (hi - lo < 1e-9) break;
    }
    return (lo + hi) / 2;
  }

  /* ═══════════════════════════════════════════════════
     CÁLCULO
  ═══════════════════════════════════════════════════ */
  function calcular() {
    if (!monto || !meses || !tnaFija || !fechaConst) return null;
    if (monto <= 0 || meses < 1 || tnaFija <= 0) return null;

    const TNA_F = tnaFija / 100;
    const TNA_V = (tnaVar > 0 ? tnaVar : tnaFija) / 100;
    const mesesFijaEff = (mesesFija > 0 ? Math.min(mesesFija, meses) : meses);

    // Frecuencia de capital en meses (1 mes = 30 días)
    const stepMeses = Math.max(1, Math.round(frecCapital / 30));

    // — Primera pasada: clasificar cada mes en 'grace', 'interest', 'capital' —
    const payTypes = [];   // 'grace' | 'interest' | 'capital'
    let firstNonGrace = -1;

    for (let k = 1; k <= meses; k++) {
      const date = addMonths(fechaConst, k);
      if (daysDiff(fechaConst, date) <= gracia) {
        payTypes.push('grace');
      } else {
        if (firstNonGrace < 0) firstNonGrace = k;
        const pos = k - firstNonGrace;         // 0-based position after grace
        const isLastMonth = (k === meses);
        const isCapitalStep = (pos % stepMeses === 0);
        payTypes.push((isCapitalStep || isLastMonth) ? 'capital' : 'interest');
      }
    }

    const n_capital = payTypes.filter(t => t === 'capital').length;
    if (n_capital === 0) return null;

    // — Segunda pasada: construir cuadro de marcha —
    let saldo = monto;
    let prevDate = fechaConst;
    let cuotasRestantes = n_capital;
    let diasAcum = 0;
    const rows = [];

    const cfTimes = [0];
    const cfFlows = [-monto];

    for (let k = 0; k < meses; k++) {
      const date = addMonths(fechaConst, k + 1);
      const dias = daysDiff(prevDate, date);
      diasAcum += dias;

      const monthNum = k + 1;
      const TNA = (monthNum <= mesesFijaEff) ? TNA_F : TNA_V;
      const payType = payTypes[k];

      const interes = saldo * TNA * dias / 365;
      const iva = interes * 0.21;

      let cuotaPura = 0, capital = 0;

      if (payType === 'capital') {
        const TEM = TNA * dias / 365;
        cuotaPura = saldo * TEM / (1 - Math.pow(1 + TEM, -cuotasRestantes));
        capital = cuotaPura - interes;
        cuotasRestantes--;
      }
      // grace / interest: cuotaPura=0, capital=0

      const cuotaFinal = (payType === 'grace')
        ? interes + iva
        : cuotaPura + iva;

      saldo = Math.max(0, saldo - capital);
      prevDate = date;

      rows.push({
        num: k + 1,
        fecha: date,
        dias,
        payType,
        cuotaPura,
        capital,
        interes,
        iva,
        cuotaFinal,
        saldo,
      });

      cfTimes.push(diasAcum);
      cfFlows.push(cuotaFinal - iva);
    }

    // — Resumen —
    const capitalRows = rows.filter(r => r.payType === 'capital');
    const cuotaPuraProm   = capitalRows.reduce((s, r) => s + r.cuotaPura, 0) / n_capital;
    const totalCuotas     = rows.reduce((s, r) => s + r.cuotaFinal, 0);
    const totalIntereses  = rows.reduce((s, r) => s + r.interes, 0);
    const totalIVA        = rows.reduce((s, r) => s + r.iva, 0);
    const cuotaFinalProm  = totalCuotas / meses;
    const ivaProm         = totalIVA / meses;
    const cfSinIVAProm    = (totalCuotas - totalIVA) / meses;

    // Duration Macaulay en meses
    const duration = rows.reduce((s, r, i) =>
      s + (cfTimes[i + 1] / 30) * r.cuotaFinal, 0) / totalCuotas;

    const cftTEA  = irr(cfFlows, cfTimes);
    const cftTNA30 = (Math.pow(1 + cftTEA, 30 / 365) - 1) * (365 / 30);

    return {
      cftTEA, cftTNA30,
      cuotaPuraProm, cfSinIVAProm, ivaProm, cuotaFinalProm,
      duration,
      totalCapital: monto,
      totalIntereses,
      totalAll: totalCuotas,
      rows,
    };
  }

  /* ═══════════════════════════════════════════════════
     FORMATO
  ═══════════════════════════════════════════════════ */
  const fmtARS = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const fmtNum = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });

  const fmtPct2 = v => (v * 100).toFixed(2).replace('.', ',') + '%';

  /* ═══════════════════════════════════════════════════
     UI
  ═══════════════════════════════════════════════════ */
  function updateResults() {
    const res     = calcular();
    const resEl   = document.getElementById('be-results');
    const emptyEl = document.getElementById('be-empty');
    if (!resEl || !emptyEl) return;

    if (!res) {
      resEl.style.display   = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    resEl.style.display   = 'block';
    emptyEl.style.display = 'none';

    document.getElementById('r-fija').textContent       = fmtPct2(tnaFija / 100);
    document.getElementById('r-cft-tea').textContent    = fmtPct2(res.cftTEA);
    document.getElementById('r-cft-tna').textContent    = fmtPct2(res.cftTNA30);
    document.getElementById('r-cp-prom').textContent    = fmtARS.format(res.cuotaPuraProm);
    document.getElementById('r-cf-sin-iva').textContent = fmtARS.format(res.cfSinIVAProm);
    document.getElementById('r-iva-prom').textContent   = fmtARS.format(res.ivaProm);
    document.getElementById('r-cf-prom').textContent    = fmtARS.format(res.cuotaFinalProm);
    document.getElementById('r-duration').textContent   = res.duration.toFixed(2).replace('.', ',') + ' meses';
    document.getElementById('r-total-cap').textContent  = fmtARS.format(res.totalCapital);
    document.getElementById('r-total-int').textContent  = fmtARS.format(res.totalIntereses);
    document.getElementById('r-total-all').textContent  = fmtARS.format(res.totalAll);

    const tbody = document.getElementById('be-tbody');
    if (tbody) {
      tbody.innerHTML = res.rows.map(r => `
        <tr class="${r.payType === 'grace' ? 'be-grace-row' : ''}">
          <td>${r.num}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td>${r.dias}</td>
          <td>${r.cuotaPura > 0 ? fmtNum.format(r.cuotaPura) : '—'}</td>
          <td>${r.capital  > 0 ? fmtNum.format(r.capital)  : '—'}</td>
          <td>${fmtNum.format(r.interes)}</td>
          <td>${fmtNum.format(r.iva)}</td>
          <td><strong>${fmtNum.format(r.cuotaFinal)}</strong></td>
          <td>${fmtNum.format(r.saldo)}</td>
        </tr>`).join('');
    }
  }

  function scheduleRecalc() {
    clearTimeout(debT);
    debT = setTimeout(updateResults, 150);
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  function init() {
    document.getElementById('be-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    // Fecha constitución: hoy por defecto
    const hoy = new Date();
    const elFecha = document.getElementById('be-fecha');
    if (elFecha) { elFecha.value = toDateInput(hoy); fechaConst = hoy; }

    // Defaults numéricos
    const elGracia = document.getElementById('be-gracia');
    const elFrec   = document.getElementById('be-frec');
    if (elGracia) elGracia.value = '0';
    if (elFrec)   elFrec.value   = '30';

    // Listeners
    document.getElementById('be-monto')
      ?.addEventListener('input', e => { monto = parseFloat(e.target.value) || 0; scheduleRecalc(); });

    document.getElementById('be-meses')
      ?.addEventListener('input', e => {
        meses = parseInt(e.target.value, 10) || 0;
        // Actualizar mesesFija al total si estaba sincronizado
        const elMF = document.getElementById('be-meses-fija');
        if (elMF && (!mesesFija || mesesFija >= meses)) {
          elMF.value = meses || '';
          mesesFija  = meses;
          updateTnaVarState();
        }
        scheduleRecalc();
      });

    elGracia?.addEventListener('input', e => { gracia = parseInt(e.target.value, 10) || 0; scheduleRecalc(); });
    elFrec?.addEventListener('input',   e => { frecCapital = parseInt(e.target.value, 10) || 30; scheduleRecalc(); });

    elFecha?.addEventListener('change', e => { fechaConst = parseDate(e.target.value); scheduleRecalc(); });

    document.getElementById('be-tna-fija')
      ?.addEventListener('input', e => { tnaFija = parseFloat(e.target.value) || 0; scheduleRecalc(); });

    document.getElementById('be-meses-fija')
      ?.addEventListener('input', e => {
        mesesFija = parseInt(e.target.value, 10) || 0;
        updateTnaVarState();
        scheduleRecalc();
      });

    document.getElementById('be-tna-var')
      ?.addEventListener('input', e => { tnaVar = parseFloat(e.target.value) || 0; scheduleRecalc(); });

    updateResults();
  }

  function updateTnaVarState() {
    const elVar = document.getElementById('be-tna-var');
    if (!elVar) return;
    const needsVar = mesesFija > 0 && meses > 0 && mesesFija < meses;
    elVar.disabled = !needsVar;
    if (!needsVar) { elVar.value = ''; tnaVar = 0; }
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    monto = 0; meses = 0; gracia = 0; frecCapital = 30;
    fechaConst = null;
    tnaFija = 0; mesesFija = 0; tnaVar = 0;
    clearTimeout(debT);
    document.getElementById('app').innerHTML = VIEW;
    init();
  }

  return { render };
})();
