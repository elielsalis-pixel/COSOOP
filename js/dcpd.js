const DCPD = (() => {
  'use strict';

  /* ═══════════════════════════════════════════════════
     STATE  — se resetea en cada render()
  ═══════════════════════════════════════════════════ */
  let hoy        = null;   // Date, medianoche local
  let tna        = 0;      // decimal, ej. 0.85
  let cheques    = [];     // [{id, fecha (Date|null), monto (number)}]
  let holidays   = [];     // ['YYYY-MM-DD', ...]
  let nextId     = 1;
  let debT       = null;
  let nivel      = '';     // 'PIZARRA' | 'GT ZONAL' | 'GT REGIONAL' | 'SGG FILIALES'
  let tablaCache = null;   // resultado de TasasManager.getTabla()

  /* ═══════════════════════════════════════════════════
     INDEXEDDB  — caché de feriados por año
  ═══════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_db';
    const VER  = 1;

    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);
        r.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('feriados'))
            db.createObjectStore('feriados', { keyPath: 'year' });
        };
        r.onsuccess = e => ok(e.target.result);
        r.onerror   = ()  => fail(r.error);
      });
    }

    async function get(year) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('feriados', 'readonly')
                      .objectStore('feriados').get(year);
        req.onsuccess = () => ok(req.result || null);
        req.onerror   = () => fail(req.error);
      });
    }

    async function put(year, list) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('feriados', 'readwrite')
                      .objectStore('feriados')
                      .put({ year, list, ts: Date.now() });
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }

    return { get, put };
  })();

  /* ═══════════════════════════════════════════════════
     FERIADOS  — API + IndexedDB + fallback fijos
  ═══════════════════════════════════════════════════ */
  const Feriados = (() => {
    const API_BASE = 'https://api.argentinadatos.com/v1/feriados/';
    const STALE    = 180 * 86_400_000;               // 180 días en ms

    /* Feriados nacionales fijos MM-DD (usado si nunca hubo conexión) */
    const FIJOS = ['01-01','03-24','04-02','05-01','05-25',
                   '06-20','07-09','12-08','12-25'];

    function fallback(year) {
      return FIJOS.map(d => `${year}-${d}`);
    }

    async function fetchYear(year) {
      const res = await fetch(`${API_BASE}${year}`);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      // [{fecha:'YYYY-MM-DD', nombre:'...', tipo:'...'}, ...]
      return data.map(f => f.fecha);
    }

    async function forYear(year) {
      let cached = null;
      try { cached = await DB.get(year); } catch {}

      // Caché vigente (< 180 días)
      if (cached && Date.now() - cached.ts < STALE) return cached.list;

      // Intenta API
      try {
        const fresh = await fetchYear(year);
        try { await DB.put(year, fresh); } catch {}
        return fresh;
      } catch {}

      // Sin red: usa caché vencida o feriados fijos
      return cached ? cached.list : fallback(year);
    }

    async function load(years) {
      const arrs = await Promise.all(years.map(forYear));
      return arrs.flat();
    }

    return { load };
  })();

  /* ═══════════════════════════════════════════════════
     ENGINE
  ═══════════════════════════════════════════════════ */

  /* Formato YYYY-MM-DD en tiempo local (sin desfase UTC) */
  function strDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${D}`;
  }

  /* Helpers de fecha — formato DD/MM/AAAA para el input de texto */
  function formatDateDisplay(d) {
    const D = String(d.getDate()).padStart(2, '0');
    const M = String(d.getMonth() + 1).padStart(2, '0');
    return `${D}/${M}/${d.getFullYear()}`;
  }

  function autoFormatDate(digits) {
    // Recibe solo dígitos (máx 8), devuelve DD/MM/AAAA
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return `${digits.slice(0,2)}/${digits.slice(2)}`;
    return `${digits.slice(0,2)}/${digits.slice(2,4)}/${digits.slice(4,8)}`;
  }

  function parseDisplayDate(str) {
    // Acepta "DD/MM/AAAA"
    const p = str.split('/');
    if (p.length !== 3) return null;
    const [d, m, y] = p.map(Number);
    if (!d || !m || !y || y < 2000 || m > 12 || d > 31) return null;
    const date = new Date(y, m - 1, d);
    if (date.getMonth() !== m - 1) return null;   // fecha inválida
    return date;
  }

  /* Réplica exacta de WORKDAY(startDate, n, feriados) de Excel */
  function workday(start, n, hSet) {
    let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let rem = n;
    while (rem > 0) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      const dow = d.getDay();                              // 0=Dom, 6=Sáb
      if (dow !== 0 && dow !== 6 && !hSet.has(strDate(d))) rem--;
    }
    return d;
  }

  function calcular() {
    const validos = cheques.filter(c => c.fecha && c.monto > 0);
    if (!validos.length || tna <= 0) return null;

    const hSet = new Set(holidays);

    const rows = validos.map(c => {
      /* H = WORKDAY(fecha_vto, 1, feriados) − hoy */
      const wd     = workday(c.fecha, 1, hSet);
      const h      = Math.round((wd - hoy) / 86_400_000);    // días enteros
      if (h <= 0) return null;

      /* Interés por cheque: J * TNA * H/365 / (1 + TNA * H/365) */
      const factor  = tna * h / 365;
      const interes = c.monto * factor / (1 + factor);
      return { h, monto: c.monto, interes };
    }).filter(Boolean);

    if (!rows.length) return null;

    /* K17 */ const nominal   = rows.reduce((s, r) => s + r.monto,   0);
    /* K19 */ const intereses = rows.reduce((s, r) => s + r.interes, 0);
    /* K21 */ const neto      = nominal - intereses;
    /* K16 */ const ppp       = rows.reduce((s, r) => s + r.h * r.monto, 0) / nominal;
    /* K22 */ const cft       = Math.pow(nominal / neto, 365 / ppp) - 1;

    return {
      /* K15 */ cantidad: rows.length,
      /* K16 */ ppp,
      /* K17 */ nominal,
      /* K19 */ intereses,
      /* K21 */ neto,
      /* K22 */ cft,
    };
  }

  /* ═══════════════════════════════════════════════════
     FORMATO
  ═══════════════════════════════════════════════════ */
  const fmtARS = new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const fmtPct  = v => (v * 100).toFixed(2).replace('.', ',') + ' %';
  const fmtDias = v => Math.round(v) + ' días';

  /* ═══════════════════════════════════════════════════
     VIEW HTML  (embebido — funciona offline)
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="dcpd-view">
  <div class="dcpd-topbar">
    <button class="dcpd-back" id="dcpd-back">&#8249;</button>
    <span class="dcpd-title">Simulador DCPD</span>
    <span class="dcpd-status" id="dcpd-status"></span>
  </div>

  <div class="dcpd-scroll">

    <!-- Configuración -->
    <div class="dcpd-card">
      <div class="dcpd-field-row">
        <span class="dcpd-field-label">Fecha de operación</span>
        <span class="dcpd-field-static" id="dcpd-hoy"></span>
      </div>
      <div class="dcpd-divider"></div>
      <div class="dcpd-field-row">
        <label class="dcpd-field-label" for="dcpd-tna">TNA</label>
        <div class="dcpd-tna-wrap">
          <input id="dcpd-tna" class="dcpd-tna-input"
            type="number" inputmode="decimal"
            placeholder="0,00" min="0.01" step="0.01">
          <span class="dcpd-tna-sym">%</span>
        </div>
      </div>
      <div class="dcpd-divider"></div>
      <div class="dcpd-nivel-row">
        <div class="dcpd-nivel-label">Nivel de aprobación</div>
        <div id="dcpd-niveles" class="dcpd-nivel-btns">
          <button class="dcpd-nivel-btn" data-nivel="PIZARRA">Pizarra</button>
          <button class="dcpd-nivel-btn" data-nivel="GT ZONAL">Zonal</button>
          <button class="dcpd-nivel-btn" data-nivel="GT REGIONAL">Regional</button>
          <button class="dcpd-nivel-btn" data-nivel="SGG FILIALES">SGG Fil.</button>
        </div>
        <div id="dcpd-nivel-hint" class="dcpd-nivel-hint"></div>
      </div>
    </div>

    <!-- Lista de cheques -->
    <div class="dcpd-section-hdr">
      <span>Cheques</span>
      <span class="dcpd-badge" id="dcpd-badge"></span>
    </div>

    <div id="dcpd-list"></div>

    <button class="dcpd-add-btn" id="dcpd-add">
      <span class="dcpd-add-icon">+</span>Agregar cheque
    </button>

    <!-- Resultados -->
    <div id="dcpd-results" style="display:none">
      <div class="dcpd-section-hdr">Resultado</div>
      <div class="dcpd-card dcpd-result-card">
        <div class="dcpd-result-row">
          <span class="dcpd-rl">Cantidad</span>
          <span class="dcpd-rv" id="r-cantidad"></span>
        </div>
        <div class="dcpd-divider"></div>
        <div class="dcpd-result-row">
          <span class="dcpd-rl">Plazo prom. ponderado</span>
          <span class="dcpd-rv" id="r-ppp"></span>
        </div>
        <div class="dcpd-divider"></div>
        <div class="dcpd-result-row">
          <span class="dcpd-rl">Monto nominal</span>
          <span class="dcpd-rv" id="r-nominal"></span>
        </div>
        <div class="dcpd-divider"></div>
        <div class="dcpd-result-row dcpd-row-neg">
          <span class="dcpd-rl">Intereses</span>
          <span class="dcpd-rv" id="r-intereses"></span>
        </div>
        <div class="dcpd-divider"></div>
        <div class="dcpd-result-row dcpd-row-pos">
          <span class="dcpd-rl">Neto a acreditar</span>
          <span class="dcpd-rv" id="r-neto"></span>
        </div>
        <div class="dcpd-divider"></div>
        <div class="dcpd-result-row">
          <span class="dcpd-rl">CFT (EA)</span>
          <span class="dcpd-rv" id="r-cft"></span>
        </div>
      </div>
    </div>

    <!-- Estado vacío -->
    <div class="dcpd-empty" id="dcpd-empty">
      Ingresá la TNA y agregá al menos un cheque para simular
    </div>

    <div style="height:48px"></div>
  </div>
</div>`;

  /* ═══════════════════════════════════════════════════
     UI — helpers
  ═══════════════════════════════════════════════════ */
  function setStatus(msg) {
    const el = document.getElementById('dcpd-status');
    if (el) el.textContent = msg;
  }

  function refreshBadge() {
    const el = document.getElementById('dcpd-badge');
    if (el) el.textContent = cheques.length ? String(cheques.length) : '';
  }

  function buildRow(ch) {
    const div = document.createElement('div');
    div.className = 'dcpd-cheque-row';
    div.dataset.id = ch.id;
    div.innerHTML = `
      <div class="dcpd-fecha-group">
        <input class="dcpd-ch-fecha-txt" type="text" inputmode="numeric"
               placeholder="DD/MM/AAAA" maxlength="10" autocomplete="off"
               value="${ch.fecha ? formatDateDisplay(ch.fecha) : ''}"
               data-id="${ch.id}">
        <div class="dcpd-cal-wrap">
          <span class="dcpd-cal-icon">📅</span>
          <input class="dcpd-ch-fecha" type="date"
                 value="${ch.fecha ? strDate(ch.fecha) : ''}"
                 data-id="${ch.id}">
        </div>
      </div>
      <input class="dcpd-ch-monto" type="number" inputmode="decimal"
             placeholder="Importe" value="${ch.monto || ''}"
             data-id="${ch.id}" min="1" step="0.01">
      <button class="dcpd-ch-del" data-id="${ch.id}" aria-label="Eliminar">&#x1F5D1;</button>`;
    return div;
  }

  function refreshList() {
    const list = document.getElementById('dcpd-list');
    if (!list) return;
    list.innerHTML = '';
    cheques.forEach(ch => list.appendChild(buildRow(ch)));
    refreshBadge();
  }

  /* PPP sin TNA — igual al cálculo de calcular() pero sólo la parte del plazo */
  function calcularPPP() {
    const validos = cheques.filter(c => c.fecha && c.monto > 0);
    if (!validos.length || !hoy) return null;
    const hSet = new Set(holidays);
    const rows = validos.map(c => {
      const wd = workday(c.fecha, 1, hSet);
      const h  = Math.round((wd - hoy) / 86_400_000);
      return h > 0 ? { h, monto: c.monto } : null;
    }).filter(Boolean);
    if (!rows.length) return null;
    const nominal = rows.reduce((s, r) => s + r.monto, 0);
    return rows.reduce((s, r) => s + r.h * r.monto, 0) / nominal;
  }

  /* Habilita/deshabilita botones de nivel según PPP + tabla */
  function actualizarNiveles() {
    const nivelesEl = document.getElementById('dcpd-niveles');
    const hintEl    = document.getElementById('dcpd-nivel-hint');
    if (!nivelesEl) return;

    const sinTabla    = !tablaCache?.tabla?.length;
    const ppp         = calcularPPP();
    const disponibles = (!sinTabla && ppp !== null)
      ? TasasManager.getNivelesDisponibles(ppp, tablaCache)
      : TasasManager.NIVELES;

    if (hintEl) {
      hintEl.textContent = sinTabla
        ? 'Sin tabla · cargá el archivo desde Configuración'
        : '';
    }

    nivelesEl.querySelectorAll('.dcpd-nivel-btn').forEach(btn => {
      const n         = btn.dataset.nivel;
      const available = disponibles.includes(n);
      btn.disabled    = !available || sinTabla;
      btn.classList.toggle('dcpd-nivel-active', n === nivel);
    });

    /* Si el nivel activo dejó de estar disponible, limpiarlo */
    if (nivel && (!disponibles.includes(nivel) || sinTabla)) nivel = '';
  }

  /* Autocompleta TNA desde la tabla según nivel + PPP actual */
  function autoFillTNA() {
    if (!nivel || !tablaCache?.tabla?.length) return;
    const ppp = calcularPPP();
    if (ppp === null) return;
    const rate = TasasManager.getRate(ppp, nivel, tablaCache);
    if (rate === null) return;
    tna = rate / 100;
    const input = document.getElementById('dcpd-tna');
    if (input) input.value = rate.toFixed(2);
  }

  /* fromTNA=true: el usuario editó la TNA manualmente → no volver a autocomplete */
  function scheduleRecalc(fromTNA = false) {
    clearTimeout(debT);
    debT = setTimeout(() => {
      actualizarNiveles();
      if (!fromTNA) autoFillTNA();
      updateResults();
    }, 120);
  }

  function updateResults() {
    const res     = calcular();
    const resEl   = document.getElementById('dcpd-results');
    const emptyEl = document.getElementById('dcpd-empty');
    if (!resEl || !emptyEl) return;

    if (!res) {
      resEl.style.display   = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    resEl.style.display   = 'block';
    emptyEl.style.display = 'none';

    document.getElementById('r-cantidad').textContent  =
      `${res.cantidad} cheque${res.cantidad !== 1 ? 's' : ''}`;
    document.getElementById('r-ppp').textContent       = fmtDias(res.ppp);
    document.getElementById('r-nominal').textContent   = fmtARS.format(res.nominal);
    document.getElementById('r-intereses').textContent = fmtARS.format(res.intereses);
    document.getElementById('r-neto').textContent      = fmtARS.format(res.neto);
    document.getElementById('r-cft').textContent       = fmtPct(res.cft);
  }

  /* ═══════════════════════════════════════════════════
     INIT  (async — carga feriados sin bloquear UI)
  ═══════════════════════════════════════════════════ */
  async function init() {
    const d = new Date();
    hoy = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    document.getElementById('dcpd-hoy').textContent =
      hoy.toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });

    document.getElementById('dcpd-back')
      ?.addEventListener('click', () => App.navigateTo('sim'));

    document.getElementById('dcpd-tna')
      ?.addEventListener('input', e => {
        tna = (parseFloat(e.target.value) || 0) / 100;
        scheduleRecalc(true);   // el usuario escribió TNA → no sobreescribir
      });

    document.getElementById('dcpd-niveles')
      ?.addEventListener('click', e => {
        const btn = e.target.closest('.dcpd-nivel-btn');
        if (!btn || btn.disabled) return;
        const n = btn.dataset.nivel;
        nivel = (nivel === n) ? '' : n;   // toggle
        actualizarNiveles();
        autoFillTNA();
        scheduleRecalc(true);             // actualiza resultados sin volver a autoFill
      });

    document.getElementById('dcpd-add')
      ?.addEventListener('click', () => {
        cheques.push({ id: nextId++, fecha: null, monto: 0 });
        refreshList();
        const rows = document.querySelectorAll('.dcpd-cheque-row');
        rows[rows.length - 1]?.querySelector('.dcpd-ch-fecha-txt')?.focus();
        scheduleRecalc();
      });

    const list = document.getElementById('dcpd-list');

    /* input: fecha texto (auto-formato DD/MM/AAAA) + monto */
    list?.addEventListener('input', e => {
      const id = +e.target.dataset.id;
      const ch = cheques.find(c => c.id === id);
      if (!ch) return;

      if (e.target.classList.contains('dcpd-ch-fecha-txt')) {
        const digits    = e.target.value.replace(/\D/g, '').slice(0, 8);
        const formatted = autoFormatDate(digits);
        e.target.value  = formatted;
        if (digits.length === 8) {
          const date = parseDisplayDate(formatted);
          ch.fecha = date || null;
          /* sincroniza el picker oculto */
          if (date) {
            const picker = e.target.closest('.dcpd-fecha-group')
                                   ?.querySelector('.dcpd-ch-fecha');
            if (picker) picker.value = strDate(date);
          }
        } else {
          ch.fecha = null;
        }
        scheduleRecalc();
        return;
      }

      if (e.target.classList.contains('dcpd-ch-monto')) {
        ch.monto = parseFloat(e.target.value) || 0;
        scheduleRecalc();
      }
    });

    /* change: input date nativo (picker calendario) → sincroniza texto */
    list?.addEventListener('change', e => {
      if (!e.target.classList.contains('dcpd-ch-fecha')) return;
      const id = +e.target.dataset.id;
      const ch = cheques.find(c => c.id === id);
      if (!ch) return;
      if (e.target.value) {
        const [y, m, day] = e.target.value.split('-').map(Number);
        ch.fecha = new Date(y, m - 1, day);
        const txt = e.target.closest('.dcpd-fecha-group')
                             ?.querySelector('.dcpd-ch-fecha-txt');
        if (txt) txt.value = formatDateDisplay(ch.fecha);
      } else {
        ch.fecha = null;
      }
      scheduleRecalc();
    });

    /* click: eliminar cheque */
    list?.addEventListener('click', e => {
      const del = e.target.closest('.dcpd-ch-del');
      if (!del) return;
      cheques = cheques.filter(c => c.id !== +del.dataset.id);
      refreshList();
      scheduleRecalc();
    });

    refreshList();
    updateResults();

    /* Cargar feriados y tabla en paralelo — no bloquea la UI */
    setStatus('⟳');
    try {
      const year = hoy.getFullYear();
      [holidays, tablaCache] = await Promise.all([
        Feriados.load([year, year + 1]).catch(() => []),
        TasasManager.getTabla().catch(() => null),
      ]);
    } catch {
      holidays   = [];
      tablaCache = null;
    }
    setStatus('');
    actualizarNiveles();
    scheduleRecalc(true);
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    hoy        = null;
    tna        = 0;
    cheques    = [];
    holidays   = [];
    nextId     = 1;
    nivel      = '';
    tablaCache = null;
    clearTimeout(debT);

    document.getElementById('app').innerHTML = VIEW;
    init().catch(console.error);
  }

  return { render };
})();
