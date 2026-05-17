/* ── HipUVATasas — IDB para tasas hipotecarias UVA ── */
const HipUVATasas = (() => {
  'use strict';

  const DB_NAME = 'cosoop_hip_uva';
  const STORE   = 'tasas';

  function openDB() {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = e => {
        e.target.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = e => ok(e.target.result);
      r.onerror   = () => fail(r.error);
    });
  }

  async function get() {
    const db = await openDB();
    return new Promise((ok, fail) => {
      const req = db.transaction(STORE, 'readonly')
                    .objectStore(STORE).get(1);
      req.onsuccess = () => ok(req.result?.tasas ?? null);
      req.onerror   = () => fail(req.error);
    });
  }

  async function put(tasas) {
    const db = await openDB();
    return new Promise((ok, fail) => {
      const req = db.transaction(STORE, 'readwrite')
                    .objectStore(STORE).put({ id: 1, tasas });
      req.onsuccess = () => ok();
      req.onerror   = () => fail(req.error);
    });
  }

  /* tasas = { v1si_habsi, v1si_habno, v1no_habsi, v1no_habno } */
  function getTNA(tasas, primerVivienda, cobraHaberes) {
    if (!tasas) return null;
    if (primerVivienda  && cobraHaberes)  return tasas.v1si_habsi;
    if (primerVivienda  && !cobraHaberes) return tasas.v1si_habno;
    if (!primerVivienda && cobraHaberes)  return tasas.v1no_habsi;
    return tasas.v1no_habno;
  }

  return { get, put, getTNA };
})();

/* ── HipUVA — Simulador Hipotecario UVA ── */
const HipUVA = (() => {
  'use strict';

  /* ── Constantes de negocio ── */
  const MAX_MONTO    = 300_000_000;   // editar aqui si el limite cambia
  const MIN_INGRESOS = 3_500_000;

  /* ── UVA BCRA — cache diario en localStorage ── */
  const BCRA_UVA_ID = 31;
  const UVA_LS_KEY  = 'cosoop_uva';

  async function fetchJSON(url, timeoutMs) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchUVA() {
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(UVA_LS_KEY)); } catch {}

    const hoy = new Date().toISOString().slice(0, 10);
    if (cached?.fecha === hoy) return cached;

    /* 1. argentinadatos.com — CORS abierto, fuente primaria */
    try {
      const json = await fetchJSON('https://api.argentinadatos.com/v1/finanzas/indices/uva', 8000);
      if (Array.isArray(json) && json.length) {
        const last = json[json.length - 1];
        if (last?.fecha && last?.valor != null) {
          const entry = { fecha: last.fecha, valor: last.valor };
          try { localStorage.setItem(UVA_LS_KEY, JSON.stringify(entry)); } catch {}
          return entry;
        }
      }
    } catch {}

    /* 2. BCRA directo (puede fallar por CORS en móvil) */
    const hasta   = hoy;
    const desde   = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const bcraUrl = `https://api.bcra.gob.ar/estadisticas/v3.0/Monetarias/${BCRA_UVA_ID}?desde=${desde}&hasta=${hasta}`;
    try {
      const json = await fetchJSON(bcraUrl, 6000);
      const arr  = json?.results;
      if (arr?.length) {
        const last  = arr[arr.length - 1];
        const entry = { fecha: last.fecha, valor: last.valor };
        try { localStorage.setItem(UVA_LS_KEY, JSON.stringify(entry)); } catch {}
        return entry;
      }
    } catch {}

    /* 3. corsproxy.io como último recurso */
    try {
      const json = await fetchJSON(`https://corsproxy.io/?${encodeURIComponent(bcraUrl)}`, 10000);
      const arr  = json?.results;
      if (arr?.length) {
        const last  = arr[arr.length - 1];
        const entry = { fecha: last.fecha, valor: last.valor };
        try { localStorage.setItem(UVA_LS_KEY, JSON.stringify(entry)); } catch {}
        return entry;
      }
    } catch {}

    return cached;
  }

  /* ── Helpers ── */
  const fmt$    = v => '$ ' + Math.round(v).toLocaleString('es-AR');
  const fmtUVA  = v => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' UVA';
  const fmtPct  = v => v.toFixed(2).replace('.', ',') + ' %';
  const fmtDate = d => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fmt2    = v => v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const toISO   = d => d.toISOString().slice(0, 10);

  function addMonths(date, n) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + n);
    return d;
  }

  function irrBiseccion(flows, times) {
    function npv(r) {
      return flows.reduce((s, cf, k) => s + cf / Math.pow(1 + r, times[k] / 365), 0);
    }
    let lo = 0.0001, hi = 200;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      npv(mid) > 0 ? lo = mid : hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ── VIEW ── */
  const VIEW = `
<div class="huva-view">
  <div class="huva-topbar">
    <button class="huva-back" id="huva-back">&#8249;</button>
    <span class="huva-title">Hipotecario UVA</span>
  </div>
  <div class="huva-scroll" id="huva-scroll">

    <div class="huva-section-hdr">Préstamo</div>
    <div class="huva-card">
      <div class="huva-field-row">
        <span class="huva-field-label">Monto</span>
        <div class="huva-input-wrap">
          <span class="huva-sym">$</span>
          <input class="huva-input" id="huva-monto" type="number" inputmode="numeric" placeholder="0">
        </div>
      </div>
      <div class="huva-divider"></div>
      <div class="huva-field-row">
        <span class="huva-field-label">Cuotas</span>
        <div class="huva-input-wrap">
          <input class="huva-input huva-input-sm" id="huva-cuotas" type="number" inputmode="numeric" placeholder="240">
        </div>
      </div>
      <div class="huva-divider"></div>
      <div class="huva-field-row">
        <span class="huva-field-label">Valor UVA</span>
        <div class="huva-input-wrap">
          <input class="huva-input" id="huva-uva" type="number" inputmode="decimal" placeholder="cargando…">
        </div>
      </div>
      <div class="huva-uva-lbl" id="huva-uva-lbl">Consultando BCRA…</div>
    </div>

    <div class="huva-section-hdr">Fechas</div>
    <div class="huva-card">
      <div class="huva-field-row">
        <span class="huva-field-label">Fecha constitución</span>
        <input class="huva-input-date" id="huva-fecha-const" type="date">
      </div>
      <div class="huva-divider"></div>
      <div class="huva-field-row">
        <span class="huva-field-label">Vto. 1ra cuota</span>
        <input class="huva-input-date" id="huva-fecha-vto" type="date">
      </div>
    </div>

    <div class="huva-section-hdr">Condiciones</div>
    <div class="huva-card">
      <div class="huva-field-row">
        <span class="huva-field-label">Cobra haberes</span>
        <button class="huva-toggle" id="huva-hab-btn" data-val="si">SI</button>
      </div>
      <div class="huva-divider"></div>
      <div class="huva-field-row">
        <span class="huva-field-label">1era vivienda única</span>
        <button class="huva-toggle" id="huva-v1-btn" data-val="si">SI</button>
      </div>
      <div class="huva-divider"></div>
      <div class="huva-field-row">
        <span class="huva-field-label">Ingresos del solicitante</span>
        <div class="huva-input-wrap">
          <span class="huva-sym">$</span>
          <input class="huva-input" id="huva-ingresos" type="number" inputmode="numeric" placeholder="0">
        </div>
      </div>
    </div>

    <div class="huva-section-hdr">Tasa</div>
    <div class="huva-card">
      <div class="huva-field-row">
        <span class="huva-field-label">TNA</span>
        <div class="huva-input-wrap">
          <input class="huva-input huva-input-sm" id="huva-tna" type="number" inputmode="decimal" placeholder="0,00">
          <span class="huva-sym">%</span>
        </div>
      </div>
    </div>

    <div class="huva-error" id="huva-error" style="display:none"></div>
    <button class="huva-calc-btn" id="huva-calc">Calcular</button>

    <div id="huva-results" style="display:none">
      <div class="huva-section-hdr">Resumen</div>
      <div class="huva-card">
        <div class="huva-result-row">
          <span class="huva-rl">Monto en UVAs</span>
          <span class="huva-rv" id="r-monto-uva"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row">
          <span class="huva-rl">Cuota Pura (UVA)</span>
          <span class="huva-rv" id="r-cuota-pura"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row">
          <span class="huva-rl">Cuota Total (UVA)</span>
          <span class="huva-rv" id="r-cuota-total"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row huva-row-accent">
          <span class="huva-rl huva-rl-accent">Cuota en pesos hoy</span>
          <span class="huva-rv huva-rv-accent" id="r-cuota-pesos"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row">
          <span class="huva-rl">Cuota máx. según ingresos</span>
          <span class="huva-rv" id="r-cuota-max"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row">
          <span class="huva-rl">Viabilidad</span>
          <span class="huva-rv" id="r-viable"></span>
        </div>
        <div class="huva-divider"></div>
        <div class="huva-result-row">
          <span class="huva-rl">CFT TEA</span>
          <span class="huva-rv" id="r-cft"></span>
        </div>
      </div>

      <div class="huva-section-hdr">Tabla de amortización</div>
      <div class="huva-table-wrap">
        <table class="huva-table">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fecha</th>
              <th>Cuota (UVA)</th>
              <th>Capital (UVA)</th>
              <th>Interés (UVA)</th>
              <th>IVA (UVA)</th>
              <th>Total (UVA)</th>
              <th>Saldo (UVA)</th>
            </tr>
          </thead>
          <tbody id="huva-tbody"></tbody>
        </table>
      </div>
      <div class="huva-nota">Los valores en UVA se ajustan mensualmente según el índice UVA publicado por el BCRA. La cuota en pesos aquí mostrada corresponde al valor UVA ingresado.</div>
      <div style="height:32px"></div>
    </div>

  </div>
</div>`;

  /* ── CÁLCULO ── */
  function calcular(state) {
    const { monto, cuotas: n, valorUVA, tna, iva, ingresos, fechaConst, fechaVto } = state;

    const montoUVA  = monto / valorUVA;
    const TEM       = tna / 100 / 12;
    const tasaIVA   = iva ? 0.105 : 0;
    const cuotaPura = montoUVA * TEM / (1 - Math.pow(1 + TEM, -n));

    const rows    = [];
    const cfFlows = [-montoUVA];
    const cfTimes = [0];
    let saldo     = montoUVA;

    for (let k = 1; k <= n; k++) {
      const fechaK   = addMonths(fechaVto, k - 1);
      const diasAcum = Math.round((fechaK - fechaConst) / 86400000);

      const interes    = saldo * TEM;
      const capital    = cuotaPura - interes;
      saldo            = k === n ? 0 : saldo - capital;
      const ivaUVA     = interes * tasaIVA;
      const cuotaTotal = cuotaPura + ivaUVA;

      rows.push({ k, fechaK, cuotaPura, capital, interes, ivaUVA, cuotaTotal, saldo });
      cfFlows.push(cuotaTotal);
      cfTimes.push(diasAcum);
    }

    const cftTEA         = irrBiseccion(cfFlows, cfTimes);
    const cuotaEnPesos   = rows[0].cuotaTotal * valorUVA;
    const cuotaMaxIngres = ingresos > 0 ? ingresos * 0.25 : 0;
    const viable         = ingresos > 0 && cuotaEnPesos <= cuotaMaxIngres;

    return { montoUVA, cuotaPura, rows, cftTEA, cuotaEnPesos, cuotaMaxIngres, viable };
  }

  /* ── RENDER ── */
  async function render() {
    document.getElementById('app').innerHTML = VIEW;

    document.getElementById('huva-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    const hoy    = new Date();
    const mesSig = addMonths(hoy, 1);
    document.getElementById('huva-fecha-const').value = toISO(hoy);
    document.getElementById('huva-fecha-vto').value   = toISO(mesSig);

    /* UVA automático desde BCRA (con fallback proxy) */
    const uvaInp = document.getElementById('huva-uva');
    const uvaLbl = document.getElementById('huva-uva-lbl');

    fetchUVA().then(uva => {
      if (!uvaInp) return;
      if (uva?.valor) {
        uvaInp.value = uva.valor;
        const fechaFmt = new Date(uva.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        if (uvaLbl) uvaLbl.textContent = `BCRA · ${fechaFmt}`;
      } else {
        if (uvaLbl) uvaLbl.textContent = 'No disponible · ingresá manualmente';
      }
    }).catch(() => {
      if (uvaLbl) uvaLbl.textContent = 'No disponible · ingresá manualmente';
    });

    /* TNA desde tabla configurada */
    let tasasGuardadas = null;
    try { tasasGuardadas = await HipUVATasas.get(); } catch {}

    function actualizarTNA() {
      const habSI = document.getElementById('huva-hab-btn')?.dataset.val === 'si';
      const v1SI  = document.getElementById('huva-v1-btn')?.dataset.val  === 'si';
      const inp   = document.getElementById('huva-tna');
      if (inp && !inp.dataset.manual) {
        const tna = HipUVATasas.getTNA(tasasGuardadas, v1SI, habSI);
        if (tna !== null) inp.value = tna;
        else inp.value = '';
      }
    }

    ['huva-hab-btn', 'huva-v1-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', function () {
        const on    = this.dataset.val === 'si';
        this.dataset.val = on ? 'no' : 'si';
        this.textContent = on ? 'NO' : 'SI';
        this.classList.toggle('off', on);
        actualizarTNA();
      });
    });

    document.getElementById('huva-tna')
      ?.addEventListener('input', function () { this.dataset.manual = '1'; });

    actualizarTNA();

    /* Calcular */
    document.getElementById('huva-calc')?.addEventListener('click', () => {
      const monto    = parseFloat(document.getElementById('huva-monto').value)    || 0;
      const cuotas   = parseInt(document.getElementById('huva-cuotas').value)     || 0;
      const valorUVA = parseFloat(document.getElementById('huva-uva').value)      || 0;
      const tna      = parseFloat(document.getElementById('huva-tna').value)      || 0;
      const ingresos = parseFloat(document.getElementById('huva-ingresos').value) || 0;
      const v1SI     = document.getElementById('huva-v1-btn')?.dataset.val === 'si';
      const fcStr    = document.getElementById('huva-fecha-const').value;
      const fvStr    = document.getElementById('huva-fecha-vto').value;

      if (!monto || !cuotas || !valorUVA || !tna) {
        mostrarError('Completá todos los campos antes de calcular.');
        return;
      }
      if (cuotas < 1 || cuotas > 240) {
        mostrarError('Las cuotas deben estar entre 1 y 240.');
        return;
      }
      if (monto > MAX_MONTO) {
        mostrarError('El monto máximo es $ ' + MAX_MONTO.toLocaleString('es-AR') + '.');
        return;
      }
      if (ingresos > 0 && ingresos < MIN_INGRESOS) {
        mostrarError('El ingreso mínimo requerido es $ ' + MIN_INGRESOS.toLocaleString('es-AR') + '.');
        return;
      }

      ocultarError();
      const fechaConst = new Date(fcStr + 'T12:00:00');
      const fechaVto   = new Date(fvStr + 'T12:00:00');
      const res = calcular({ monto, cuotas, valorUVA, tna, iva: !v1SI, ingresos, fechaConst, fechaVto });
      mostrarResultados(res);
    });
  }

  function mostrarError(msg) {
    const el = document.getElementById('huva-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
  }

  function ocultarError() {
    const el = document.getElementById('huva-error');
    if (el) el.style.display = 'none';
  }

  function mostrarResultados(res) {
    const el = document.getElementById('huva-results');
    if (!el) return;
    el.style.display = '';

    document.getElementById('r-monto-uva').textContent   = fmtUVA(res.montoUVA);
    document.getElementById('r-cuota-pura').textContent  = fmtUVA(res.cuotaPura);
    document.getElementById('r-cuota-total').textContent = fmtUVA(res.rows[0].cuotaTotal);
    document.getElementById('r-cuota-pesos').textContent = fmt$(res.cuotaEnPesos);
    document.getElementById('r-cuota-max').textContent   = res.cuotaMaxIngres > 0 ? fmt$(res.cuotaMaxIngres) : '—';
    document.getElementById('r-cft').textContent         = fmtPct(res.cftTEA * 100);

    const viEl = document.getElementById('r-viable');
    if (res.cuotaMaxIngres > 0) {
      viEl.textContent = res.viable ? 'VIABLE' : 'NO VIABLE';
      viEl.className   = 'huva-rv ' + (res.viable ? 'huva-viable' : 'huva-no-viable');
    } else {
      viEl.textContent = '—';
      viEl.className   = 'huva-rv';
    }

    const tbody = document.getElementById('huva-tbody');
    tbody.innerHTML = res.rows.map(r => `
      <tr>
        <td>${r.k}</td>
        <td>${fmtDate(r.fechaK)}</td>
        <td>${fmt2(r.cuotaPura)}</td>
        <td>${fmt2(r.capital)}</td>
        <td>${fmt2(r.interes)}</td>
        <td>${fmt2(r.ivaUVA)}</td>
        <td>${fmt2(r.cuotaTotal)}</td>
        <td>${fmt2(r.saldo)}</td>
      </tr>`).join('');

    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return { render };
})();
