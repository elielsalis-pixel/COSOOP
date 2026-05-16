const PDA_BP = (() => {
  'use strict';

  let monto = 0, cuotas = 0, tna = 0;
  let fechaConst = null, fechaVto1 = null;
  let ivaActivo = true, selladoPct = 1;
  let debT = null;

  /* ═══════════════════════════════════════════════════
     VIEW
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="bp-view">
  <div class="bp-topbar">
    <button class="bp-back" id="bp-back">&#8249;</button>
    <span class="bp-title">Préstamos Personales</span>
  </div>
  <div class="bp-scroll">

    <div class="bp-card">
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-monto">Monto</label>
        <div class="bp-input-wrap">
          <span class="bp-sym">$</span>
          <input id="bp-monto" class="bp-input" type="number"
                 inputmode="decimal" placeholder="0" min="1" step="0.01">
        </div>
      </div>
      <div class="bp-divider"></div>
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-cuotas">Cuotas</label>
        <div class="bp-input-wrap">
          <input id="bp-cuotas" class="bp-input bp-input-sm" type="number"
                 inputmode="numeric" placeholder="0" min="1" max="60" step="1">
          <span class="bp-sym">cuotas</span>
        </div>
      </div>
      <div class="bp-divider"></div>
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-tna">TNA</label>
        <div class="bp-input-wrap">
          <input id="bp-tna" class="bp-input bp-input-sm" type="number"
                 inputmode="decimal" placeholder="0,00" min="0.01" step="0.01">
          <span class="bp-sym">%</span>
        </div>
      </div>
      <div class="bp-divider"></div>
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-fecha-const">Fecha constitución</label>
        <input id="bp-fecha-const" class="bp-input-date" type="date">
      </div>
      <div class="bp-divider"></div>
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-fecha-vto1">Vto. 1ra cuota</label>
        <input id="bp-fecha-vto1" class="bp-input-date" type="date">
      </div>
    </div>

    <div class="bp-section-hdr">Tributos</div>
    <div class="bp-card">
      <div class="bp-field-row">
        <label class="bp-field-label">IVA (21%)</label>
        <button class="bp-toggle" id="bp-iva-toggle">SI</button>
      </div>
      <div class="bp-divider"></div>
      <div class="bp-field-row">
        <label class="bp-field-label" for="bp-sellado">Sellado</label>
        <div class="bp-input-wrap">
          <input id="bp-sellado" class="bp-input bp-input-sm" type="number"
                 inputmode="decimal" placeholder="1" min="0" step="0.01">
          <span class="bp-sym">%</span>
        </div>
      </div>
    </div>

    <div id="bp-results" style="display:none">
      <div class="bp-section-hdr">Resumen</div>
      <div class="bp-card bp-result-card">
        <div class="bp-result-row">
          <span class="bp-rl">Cuota promedio</span>
          <span class="bp-rv" id="r-cuota-prom"></span>
        </div>
        <div class="bp-divider"></div>
        <div class="bp-result-row">
          <span class="bp-rl">CFT TEA</span>
          <span class="bp-rv" id="r-cft-tea"></span>
        </div>
        <div class="bp-divider"></div>
        <div class="bp-result-row">
          <span class="bp-rl">CFT TNA (30d)</span>
          <span class="bp-rv" id="r-cft-tna"></span>
        </div>
        <div class="bp-divider"></div>
        <div class="bp-result-row">
          <span class="bp-rl">CFT TEA sin tributos</span>
          <span class="bp-rv" id="r-cft-sin"></span>
        </div>
        <div class="bp-divider bp-divider-strong"></div>
        <div class="bp-result-row">
          <span class="bp-rl">Sellado</span>
          <span class="bp-rv" id="r-sellado"></span>
        </div>
        <div class="bp-divider"></div>
        <div class="bp-result-row">
          <span class="bp-rl">Monto a acreditar</span>
          <span class="bp-rv" id="r-acreditar"></span>
        </div>
        <div class="bp-divider"></div>
        <div class="bp-result-row">
          <span class="bp-rl">Intereses totales</span>
          <span class="bp-rv" id="r-intereses"></span>
        </div>
        <div class="bp-divider bp-divider-strong"></div>
        <div class="bp-result-row bp-row-accent">
          <span class="bp-rl bp-rl-accent">Monto total de cuotas</span>
          <span class="bp-rv bp-rv-accent" id="r-total"></span>
        </div>
      </div>

      <div class="bp-section-hdr" style="margin-top:20px">Cuadro de Marcha</div>
      <div class="bp-table-wrap">
        <table class="bp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Vencimiento</th>
              <th>Días</th>
              <th>Saldo</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>IVA</th>
              <th>Cuota</th>
            </tr>
          </thead>
          <tbody id="bp-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="bp-empty" id="bp-empty">
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
    // si el día desbordó (ej: 31 ene + 1 mes → 3 mar), retroceder al último día del mes
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
     flows[0] < 0 (desembolso), resto > 0 (cuotas)
     times en días desde t=0
  ═══════════════════════════════════════════════════ */
  function irr(flows, times) {
    function npv(r) {
      let v = 0;
      for (let i = 0; i < flows.length; i++) {
        v += flows[i] / Math.pow(1 + r, times[i] / 365);
      }
      return v;
    }
    let lo = 0.0001, hi = 200; // buscar entre 0.01% y 20000% TEA
    if (npv(lo) < 0 || npv(hi) > 0) return 0;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (npv(mid) > 0) lo = mid;
      else hi = mid;
      if (hi - lo < 1e-9) break;
    }
    return (lo + hi) / 2;
  }

  /* ═══════════════════════════════════════════════════
     CÁLCULO
  ═══════════════════════════════════════════════════ */
  function calcular() {
    if (!monto || !cuotas || !tna || !fechaConst || !fechaVto1) return null;
    if (monto <= 0 || cuotas < 1 || cuotas > 60 || tna <= 0) return null;
    if (daysDiff(fechaConst, fechaVto1) <= 0) return null;

    const TNA = tna / 100;
    const n   = Math.round(cuotas);

    const sellado        = monto * selladoPct / 100;
    const montoAcreditar = monto - sellado;

    // Fechas de vencimiento: d0 = constitución, d1..dn = cuotas
    const dates = [fechaConst];
    for (let k = 1; k <= n; k++) {
      dates.push(addMonths(fechaVto1, k - 1));
    }

    // Días reales de cada período
    const periodDays = [];
    for (let k = 1; k <= n; k++) {
      periodDays.push(daysDiff(dates[k - 1], dates[k]));
    }

    // Cuota pura — sistema francés actuarial con días reales
    // C = monto / Σ[k=1..n]{ 1 / Π[j=1..k](1 + TNA×días_j/365) }
    // Garantiza saldo = 0 al período n exactamente
    let denom = 0, cumProd = 1;
    for (let k = 0; k < n; k++) {
      cumProd *= (1 + TNA * periodDays[k] / 365);
      denom   += 1 / cumProd;
    }
    const cuotaPura = monto / denom;

    // Cuadro de marcha
    let saldo = monto;
    const rows = [];
    let totalIntereses = 0, totalCuotas = 0;

    const cfTimes = [0];
    const cfCFT  = [-montoAcreditar];
    const cfPuro = [-monto];

    let diasAcum = 0;

    for (let k = 0; k < n; k++) {
      const dias    = periodDays[k];
      diasAcum     += dias;

      const interes  = saldo * TNA * dias / 365;
      const capital  = cuotaPura - interes;
      const iva      = ivaActivo ? interes * 0.21 : 0;
      const cuotaFin = cuotaPura + iva;

      totalIntereses += interes;
      totalCuotas    += cuotaFin;

      rows.push({
        num: k + 1,
        fecha: dates[k + 1],
        dias,
        saldoInicial: saldo,
        capital,
        interes,
        iva,
        cuotaFin,
      });

      saldo = Math.max(0, saldo - capital);

      cfTimes.push(diasAcum);
      cfCFT.push(cuotaFin);
      cfPuro.push(cuotaPura);
    }

    const cftTEA     = irr(cfCFT, cfTimes);
    const cftSinTrib = irr(cfPuro, cfTimes);
    const cftTNA30   = (Math.pow(1 + cftTEA, 30 / 365) - 1) * (365 / 30);
    const cuotaProm  = totalCuotas / n;

    return {
      cuotaPura, sellado, montoAcreditar,
      cuotaProm, cftTEA, cftTNA30, cftSinTrib,
      totalIntereses, totalCuotas,
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
    const resEl   = document.getElementById('bp-results');
    const emptyEl = document.getElementById('bp-empty');
    if (!resEl || !emptyEl) return;

    if (!res) {
      resEl.style.display   = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    resEl.style.display   = 'block';
    emptyEl.style.display = 'none';

    document.getElementById('r-cuota-prom').textContent = fmtARS.format(res.cuotaProm);
    document.getElementById('r-cft-tea').textContent    = fmtPct2(res.cftTEA);
    document.getElementById('r-cft-tna').textContent    = fmtPct2(res.cftTNA30);
    document.getElementById('r-cft-sin').textContent    = fmtPct2(res.cftSinTrib);
    document.getElementById('r-sellado').textContent    = fmtARS.format(res.sellado);
    document.getElementById('r-acreditar').textContent  = fmtARS.format(res.montoAcreditar);
    document.getElementById('r-intereses').textContent  = fmtARS.format(res.totalIntereses);
    document.getElementById('r-total').textContent      = fmtARS.format(res.totalCuotas);

    // Cuadro de marcha
    const tbody = document.getElementById('bp-tbody');
    if (tbody) {
      tbody.innerHTML = res.rows.map(r => `
        <tr>
          <td>${r.num}</td>
          <td>${fmtDate(r.fecha)}</td>
          <td>${r.dias}</td>
          <td>${fmtNum.format(r.saldoInicial)}</td>
          <td>${fmtNum.format(r.capital)}</td>
          <td>${fmtNum.format(r.interes)}</td>
          <td>${fmtNum.format(r.iva)}</td>
          <td><strong>${fmtNum.format(r.cuotaFin)}</strong></td>
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
    document.getElementById('bp-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    // Fechas por defecto: hoy y próximo mes
    const hoy       = new Date();
    const proximo   = addMonths(hoy, 1);
    const elConst   = document.getElementById('bp-fecha-const');
    const elVto1    = document.getElementById('bp-fecha-vto1');
    if (elConst) { elConst.value = toDateInput(hoy);     fechaConst = hoy; }
    if (elVto1)  { elVto1.value  = toDateInput(proximo); fechaVto1  = proximo; }

    // Valor por defecto de sellado
    const elSell = document.getElementById('bp-sellado');
    if (elSell) elSell.value = '1';

    // Listeners numéricos
    document.getElementById('bp-monto')
      ?.addEventListener('input', e => { monto = parseFloat(e.target.value) || 0; scheduleRecalc(); });

    document.getElementById('bp-cuotas')
      ?.addEventListener('input', e => { cuotas = parseInt(e.target.value, 10) || 0; scheduleRecalc(); });

    document.getElementById('bp-tna')
      ?.addEventListener('input', e => { tna = parseFloat(e.target.value) || 0; scheduleRecalc(); });

    elConst?.addEventListener('change', e => {
      fechaConst = parseDate(e.target.value);
      scheduleRecalc();
    });

    elVto1?.addEventListener('change', e => {
      fechaVto1 = parseDate(e.target.value);
      scheduleRecalc();
    });

    elSell?.addEventListener('input', e => {
      selladoPct = parseFloat(e.target.value) ?? 1;
      scheduleRecalc();
    });

    // Toggle IVA
    const ivaBtn = document.getElementById('bp-iva-toggle');
    ivaBtn?.addEventListener('click', () => {
      ivaActivo = !ivaActivo;
      ivaBtn.textContent = ivaActivo ? 'SI' : 'NO';
      ivaBtn.classList.toggle('off', !ivaActivo);
      scheduleRecalc();
    });

    updateResults();
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    monto = 0; cuotas = 0; tna = 0;
    fechaConst = null; fechaVto1 = null;
    ivaActivo = true; selladoPct = 1;
    clearTimeout(debT);
    document.getElementById('app').innerHTML = VIEW;
    init();
  }

  return { render };
})();
