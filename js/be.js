const BancaEmpresa = (() => {
  'use strict';

  const DEFAULT_FAVS = [
    'Oferta Especial Capital de Trabajo',
    'Capital de Trabajo',
    'Préstamos para Inversión',
    'Convenios Leasing',
    'Convenios en Pesos',
    'Tasas de Referencia',
  ];

  const normNombre = s =>
    s.trim().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, ' ');

  const escHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ═══════════════════════════════════════════════════
     INDEXEDDB
  ═══════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_be';
    const VER  = 1;
    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);
        r.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('archivo'))
            db.createObjectStore('archivo',   { keyPath: 'id' });
          if (!db.objectStoreNames.contains('favoritos'))
            db.createObjectStore('favoritos', { keyPath: 'id' });
        };
        r.onsuccess = e => ok(e.target.result);
        r.onerror   = () => fail(r.error);
      });
    }
    async function get(store) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction(store,'readonly').objectStore(store).get(1);
        req.onsuccess = () => ok(req.result || null);
        req.onerror   = () => fail(req.error);
      });
    }
    async function put(store, data) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction(store,'readwrite')
                      .objectStore(store).put({ id: 1, ...data });
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }
    return { get, put };
  })();

  /* ═══════════════════════════════════════════════════
     SHEETJS
  ═══════════════════════════════════════════════════ */
  function loadXLSX() {
    return new Promise((ok, fail) => {
      if (window.XLSX) { ok(window.XLSX); return; }
      const s   = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload  = () => ok(window.XLSX);
      s.onerror = () => fail(new Error('No se pudo cargar el lector de Excel.'));
      document.head.appendChild(s);
    });
  }

  /* ═══════════════════════════════════════════════════
     FORMATO DE VALORES
  ═══════════════════════════════════════════════════ */
  function formatVal(v) {
    if (v == null) return '';
    if (typeof v === 'number') {
      if (v > 0 && v <= 2)     return (v * 100).toFixed(2).replace('.', ',') + ' %';
      if (Number.isInteger(v)) return String(v);
      return v.toLocaleString('es-AR', { maximumFractionDigits: 4 });
    }
    return String(v).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  /* ═══════════════════════════════════════════════════
     PARSEO DEL XLSX
     Todas las hojas y secciones se incluyen —
     el usuario decide qué ocultar con el botón ✕.
  ═══════════════════════════════════════════════════ */
  async function parsear(file) {
    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const secciones = [];

    for (const sheetName of wb.SheetNames) {
      const ws  = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const rows = raw.filter(r =>
        r.slice(1).some(c => c != null && String(c).trim() !== '')
      );
      if (rows.length < 2) continue;

      const freq = {};
      rows.forEach(r =>
        r.forEach((c, i) => {
          if (i > 0 && c != null && String(c).trim() !== '')
            freq[i] = (freq[i] || 0) + 1;
        })
      );
      const usedCols = Object.keys(freq)
        .map(Number).filter(i => freq[i] >= 2).sort((a, b) => a - b);
      if (!usedCols.length) continue;

      const extract = r => usedCols.map(i => (r[i] != null ? r[i] : null));

      let headerIdx  = -1;
      let headerVals = null;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const vals    = extract(rows[i]);
        const nonNull = vals.filter(v => v != null && String(v).trim() !== '');
        if (nonNull.length < 2) continue;
        const strCnt  = nonNull.filter(v =>
          typeof v === 'string' && isNaN(parseFloat(String(v).replace(',', '.')))
        ).length;
        if (strCnt >= nonNull.length * 0.5) {
          headerIdx  = i;
          headerVals = vals.map(v => v == null ? '' : String(v).trim());
          break;
        }
      }
      if (headerIdx === -1) {
        headerVals = usedCols.map((_, i) => i === 0 ? 'Denominación' : `Col ${i+1}`);
      }

      let current    = null;
      const hojaSecs = [];
      const start    = headerIdx + 1;

      for (let i = start < 0 ? 0 : start; i < rows.length; i++) {
        const vals    = extract(rows[i]);
        const nonNull = vals.filter(v => v != null && String(v).trim() !== '');
        if (!nonNull.length) continue;

        const esSec = nonNull.length === 1
          && vals[0] != null && String(vals[0]).trim() !== '';

        if (esSec) {
          if (current?.filas.length) hojaSecs.push(current);
          current = { nombre: String(vals[0]).trim(), hoja: sheetName, headers: headerVals, filas: [] };
        } else if (current) {
          current.filas.push(vals.map(formatVal));
        }
      }
      if (current?.filas.length) hojaSecs.push(current);

      if (!hojaSecs.length) {
        const allData = rows.slice(Math.max(0, headerIdx + 1))
          .map(r => extract(r).map(formatVal))
          .filter(r => r.some(c => c !== ''));
        if (allData.length)
          hojaSecs.push({ nombre: sheetName, hoja: sheetName, headers: headerVals, filas: allData });
      }
      secciones.push(...hojaSecs);
    }

    if (!secciones.length) throw new Error('No se encontraron secciones con datos.');
    return secciones;
  }

  /* ═══════════════════════════════════════════════════
     PREFERENCIAS
     Storage: {
       secciones : string[],          ← secciones favoritas completas
       filas     : [{seccion, denom}], ← filas individuales favoritas
       hidden    : string[],           ← secciones ocultas por el usuario
     }
     Migración automática del formato anterior (lista:[])
  ═══════════════════════════════════════════════════ */
  async function loadFavoritos() {
    const raw = await DB.get('favoritos').catch(() => null);
    if (!raw) return { secciones: new Set(), filas: [], hidden: new Set() };
    if (raw.lista && !raw.secciones) {
      const migrated = { secciones: raw.lista, filas: [], hidden: [] };
      await DB.put('favoritos', migrated).catch(() => {});
      return { secciones: new Set(raw.lista), filas: [], hidden: new Set() };
    }
    return {
      secciones: new Set(raw.secciones ?? []),
      filas:     raw.filas  ?? [],
      hidden:    new Set(raw.hidden ?? []),
    };
  }

  async function saveFavoritos() {
    await DB.put('favoritos', {
      secciones: [...favSecciones],
      filas:     favFilas,
      hidden:    [...hidden],
    }).catch(() => {});
  }

  /* ═══════════════════════════════════════════════════
     API DE ARCHIVO
  ═══════════════════════════════════════════════════ */
  async function cargarArchivo(file) {
    const secciones = await parsear(file);
    const nombres   = new Set(secciones.map(s => s.nombre));

    const { secciones: favsSecActuales, filas: favFilasActuales, hidden: hiddenActuales } =
      await loadFavoritos();

    const normDefaults = DEFAULT_FAVS.map(normNombre);
    let nuevosSecs;
    if (favsSecActuales.size === 0 && favFilasActuales.length === 0) {
      nuevosSecs = new Set(
        secciones.filter(s => normDefaults.includes(normNombre(s.nombre))).map(s => s.nombre)
      );
    } else {
      nuevosSecs = new Set([...favsSecActuales].filter(n => nombres.has(n)));
    }

    const nuevasFilas = favFilasActuales.filter(f => {
      const sec = secciones.find(s => s.nombre === f.seccion);
      if (!sec) return false;
      return sec.filas.some(r => String(r[0] ?? '').trim() === f.denom);
    });

    /* Limpiar ocultas que ya no existen en el nuevo archivo */
    const nuevasHidden = new Set([...hiddenActuales].filter(n => nombres.has(n)));

    await Promise.all([
      DB.put('archivo',   { secciones, nombre: file.name, cargadoEl: Date.now() }),
      DB.put('favoritos', {
        secciones: [...nuevosSecs],
        filas:     nuevasFilas,
        hidden:    [...nuevasHidden],
      }),
    ]);
    return { secciones, nombre: file.name };
  }

  async function getArchivo() { return DB.get('archivo'); }

  /* ═══════════════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════════════ */
  let stored        = null;
  let favSecciones  = new Set();   // secciones completas favoritas
  let favFilas      = [];          // [{seccion, denom}] — filas individuales favoritas
  let hidden        = new Set();   // secciones ocultas por el usuario
  let showHidden    = false;       // mostrar temporalmente las ocultas
  let modo          = 'favs';
  let query         = '';
  let searchVisible = false;
  let collapsed     = new Set();   // secciones colapsadas
  let debT          = null;

  /* ═══════════════════════════════════════════════════
     FILTRADO
  ═══════════════════════════════════════════════════ */
  function seccionesFiltradas() {
    if (!stored?.secciones) return [];
    const q = query.toLowerCase();

    if (modo === 'todo') {
      const visible = stored.secciones.filter(s => !hidden.has(s.nombre));
      if (!query) return visible;
      return visible.map(s => {
        if (s.nombre.toLowerCase().includes(q)) return s;
        const matches = s.filas.filter(r => r.some(c => String(c).toLowerCase().includes(q)));
        return matches.length ? { ...s, filas: matches } : null;
      }).filter(Boolean);
    }

    // modo 'favs'
    const result = [];
    for (const s of stored.secciones) {
      if (hidden.has(s.nombre)) continue;
      const isSecFav   = favSecciones.has(s.nombre);
      const filasIndiv = favFilas.filter(f => f.seccion === s.nombre);
      if (!isSecFav && filasIndiv.length === 0) continue;

      let filas;
      if (isSecFav) {
        filas = q
          ? (s.nombre.toLowerCase().includes(q)
              ? s.filas
              : s.filas.filter(r => r.some(c => String(c).toLowerCase().includes(q))))
          : s.filas;
      } else {
        const denoms = new Set(filasIndiv.map(f => f.denom));
        filas = [];
        for (let i = 0; i < s.filas.length; i++) {
          const denom = String(s.filas[i][0] ?? '').trim();
          if (denom && denoms.has(denom)) {
            if (!q || s.filas[i].some(c => String(c).toLowerCase().includes(q)))
              filas.push(s.filas[i]);
            for (let j = i + 1; j < s.filas.length; j++) {
              if (String(s.filas[j][0] ?? '').trim() === '') filas.push(s.filas[j]);
              else break;
            }
          }
        }
      }
      if (filas.length > 0 || isSecFav) result.push({ ...s, filas });
    }
    return result;
  }

  /* ═══════════════════════════════════════════════════
     CONSTRUCCIÓN DOM
  ═══════════════════════════════════════════════════ */
  function buildSeccion(s, isHiddenSec = false) {
    const isSecFav    = !isHiddenSec && favSecciones.has(s.nombre);
    const isCollapsed = collapsed.has(s.nombre);
    const div         = document.createElement('div');
    div.className     = 'be-section'
      + (isCollapsed ? ' be-collapsed'  : '')
      + (isHiddenSec ? ' be-hidden-sec' : '');

    /* Cabecera — clic en hdr colapsa, clic en botones actúa */
    const hdr = document.createElement('div');
    hdr.className    = 'be-section-hdr';
    hdr.dataset.nombre = s.nombre;
    hdr.innerHTML = `
      <span class="be-section-chevron">▾</span>
      <div class="be-section-meta">
        <span class="be-section-tag">${escHtml(s.hoja)}</span>
        <span class="be-section-nombre">${escHtml(s.nombre)}</span>
      </div>
      ${isHiddenSec
        ? `<button class="be-restore-btn" data-nombre="${escHtml(s.nombre)}" aria-label="Mostrar sección">↩ Mostrar</button>`
        : `<button class="be-star${isSecFav ? ' be-star-on' : ''}"
                   data-nombre="${escHtml(s.nombre)}" aria-label="Marcar sección favorita">
             ${isSecFav ? '★' : '☆'}
           </button>
           <button class="be-hide-btn" data-nombre="${escHtml(s.nombre)}" aria-label="Ocultar sección">✕</button>`
      }`;
    div.appendChild(hdr);

    if (!s.filas.length) return div;

    /* Columnas activas */
    const nCols      = s.headers?.length ?? (s.filas[0]?.length ?? 0);
    const colActive  = Array.from({ length: nCols }, (_, i) =>
      (s.headers?.[i] ?? '') !== '' || s.filas.some(r => (r[i] ?? '') !== '')
    );
    const colIndices = colActive.map((a, i) => a ? i : -1).filter(i => i >= 0);

    const thCells = s.headers
      ? colIndices.map(i => `<th>${escHtml(s.headers[i] ?? '')}</th>`).join('')
      : '';

    const tbody = s.filas.map(r => {
      const cells = colIndices.map((colIdx, pos) => {
        const val = String(r[colIdx] ?? '');
        if (pos === 0) {
          const denom = val.trim();
          if (!denom) {
            return `<td><div class="be-row-cell be-row-cont"><span>${escHtml(val)}</span></div></td>`;
          }
          const isRowFav = favFilas.some(f => f.seccion === s.nombre && f.denom === denom);
          return `<td><div class="be-row-cell">` +
            `<button class="be-row-star${isRowFav ? ' be-row-star-on' : ''}" ` +
              `data-seccion="${escHtml(s.nombre)}" data-denom="${escHtml(denom)}" ` +
              `aria-label="Marcar fila favorita">${isRowFav ? '★' : '☆'}</button>` +
            `<span>${escHtml(val)}</span>` +
            `</div></td>`;
        }
        return `<td>${escHtml(val)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    const wrap = document.createElement('div');
    wrap.className = 'be-table-wrap';
    wrap.innerHTML = `<table class="be-table">
      ${thCells ? `<thead><tr>${thCells}</tr></thead>` : ''}
      <tbody>${tbody}</tbody>
    </table>`;
    div.appendChild(wrap);
    return div;
  }

  function buildHiddenPill() {
    const n   = hidden.size;
    const div = document.createElement('div');
    div.className = 'be-hidden-pill';
    div.id        = 'be-hidden-pill';
    if (showHidden) {
      div.innerHTML =
        `<span>Mostrando ${n} secci${n > 1 ? 'ones' : 'ón'} oculta${n > 1 ? 's' : ''}</span>` +
        `<button class="be-hidden-toggle">Ocultar</button>`;
    } else {
      div.innerHTML =
        `<span>${n} secci${n > 1 ? 'ones' : 'ón'} oculta${n > 1 ? 's' : ''}</span>` +
        `<button class="be-hidden-toggle">Mostrar</button>`;
    }
    return div;
  }

  function dibujarSecciones() {
    const scroll = document.getElementById('be-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    document.getElementById('be-tab-favs')?.classList.toggle('be-tab-active', modo === 'favs');
    document.getElementById('be-tab-todo')?.classList.toggle('be-tab-active', modo === 'todo');

    /* Ícono plegar/desplegar según estado actual */
    const _secs = seccionesFiltradas();
    const _allCollapsed = _secs.length > 0 && _secs.every(s => collapsed.has(s.nombre));
    const _foldBtn = document.getElementById('be-fold-toggle');
    if (_foldBtn) {
      _foldBtn.textContent = _allCollapsed ? '⊞' : '⊟';
      _foldBtn.setAttribute('aria-label', _allCollapsed ? 'Desplegar todo' : 'Plegar todo');
    }

    if (!stored?.secciones?.length) {
      scroll.innerHTML = `<div class="be-empty"><span class="be-empty-icon">🏢</span>
        <span>Sin datos cargados.<br>Cargá el archivo XLSX desde <strong>Configuración</strong>.</span></div>`;
      return;
    }

    const secs = seccionesFiltradas();
    if (!secs.length && hidden.size === 0) {
      const [icon, msg] = query
        ? ['🔍', 'Sin coincidencias para esa búsqueda.']
        : ['⭐', 'No hay favoritos.<br>En <strong>Ver todo</strong> marcá ★ en una sección o en una fila individual.'];
      scroll.innerHTML = `<div class="be-empty"><span class="be-empty-icon">${icon}</span><span>${msg}</span></div>`;
      return;
    }

    secs.forEach(s => scroll.appendChild(buildSeccion(s)));

    /* Secciones ocultas + píldora */
    if (hidden.size > 0) {
      if (showHidden) {
        const hiddenSecs = stored.secciones.filter(s => hidden.has(s.nombre));
        hiddenSecs.forEach(s => scroll.appendChild(buildSeccion(s, true)));
      }
      scroll.appendChild(buildHiddenPill());
    }
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  async function init() {
    document.getElementById('be-back')
      ?.addEventListener('click', () => App.navigateTo('tas'));

    document.getElementById('be-fold-toggle')
      ?.addEventListener('click', () => {
        const secs = seccionesFiltradas();
        const allCollapsed = secs.length > 0 && secs.every(s => collapsed.has(s.nombre));
        secs.forEach(s => allCollapsed ? collapsed.delete(s.nombre) : collapsed.add(s.nombre));
        dibujarSecciones();
      });

    document.getElementById('be-tab-favs')
      ?.addEventListener('click', () => { modo = 'favs'; dibujarSecciones(); });
    document.getElementById('be-tab-todo')
      ?.addEventListener('click', () => { modo = 'todo'; dibujarSecciones(); });

    document.getElementById('be-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('be-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('be-search-input')?.focus();
        else {
          query = '';
          const inp = document.getElementById('be-search-input');
          if (inp) inp.value = '';
          dibujarSecciones();
        }
      });

    document.getElementById('be-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarSecciones(); }, 150);
      });

    document.getElementById('be-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('be-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarSecciones();
      });

    /* Delegación única para todos los botones del scroll */
    document.getElementById('be-scroll')?.addEventListener('click', async e => {
      const secBtn     = e.target.closest('.be-star');
      const rowBtn     = e.target.closest('.be-row-star');
      const hideBtn    = e.target.closest('.be-hide-btn');
      const restoreBtn = e.target.closest('.be-restore-btn');
      const toggleBtn  = e.target.closest('.be-hidden-toggle');
      const hdrEl      = !secBtn && !rowBtn && !hideBtn && !restoreBtn && !toggleBtn
                         ? e.target.closest('.be-section-hdr') : null;

      if (secBtn) {
        const nombre = secBtn.dataset.nombre;
        if (favSecciones.has(nombre)) favSecciones.delete(nombre);
        else                          favSecciones.add(nombre);
        await saveFavoritos();
        dibujarSecciones();

      } else if (rowBtn) {
        const seccion = rowBtn.dataset.seccion;
        const denom   = rowBtn.dataset.denom;
        const idx     = favFilas.findIndex(f => f.seccion === seccion && f.denom === denom);
        if (idx >= 0) favFilas.splice(idx, 1);
        else          favFilas.push({ seccion, denom });
        await saveFavoritos();
        dibujarSecciones();

      } else if (hideBtn) {
        const nombre = hideBtn.dataset.nombre;
        hidden.add(nombre);
        await saveFavoritos();
        dibujarSecciones();

      } else if (restoreBtn) {
        const nombre = restoreBtn.dataset.nombre;
        hidden.delete(nombre);
        await saveFavoritos();
        dibujarSecciones();

      } else if (toggleBtn) {
        showHidden = !showHidden;
        dibujarSecciones();

      } else if (hdrEl) {
        const nombre = hdrEl.dataset.nombre;
        if (!nombre) return;
        if (collapsed.has(nombre)) collapsed.delete(nombre);
        else                       collapsed.add(nombre);
        const secDiv = hdrEl.closest('.be-section');
        if (secDiv) secDiv.classList.toggle('be-collapsed', collapsed.has(nombre));
      }
    });

    /* Cargar datos */
    const [archivoStored, prefsData] = await Promise.all([
      getArchivo().catch(() => null),
      loadFavoritos(),
    ]);

    stored       = archivoStored;
    favSecciones = prefsData.secciones;
    favFilas     = prefsData.filas;
    hidden       = prefsData.hidden;

    const subEl = document.getElementById('be-subtitle');
    if (subEl && stored?.nombre) {
      const fecha = new Date(stored.cargadoEl).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      subEl.textContent = `${stored.nombre} · ${fecha}`;
    }

    dibujarSecciones();
  }

  /* ═══════════════════════════════════════════════════
     VIEW SHELL
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="be-view">
  <div class="be-topbar">
    <button class="be-back" id="be-back">&#8249;</button>
    <div class="be-titles">
      <div class="be-title">Tasas Banca Empresa</div>
      <div class="be-subtitle" id="be-subtitle"></div>
    </div>
    <button class="be-icon-btn" id="be-fold-toggle"   aria-label="Plegar todo">⊟</button>
    <button class="be-icon-btn" id="be-search-toggle" aria-label="Buscar">🔍</button>
  </div>
  <div class="be-tabs">
    <button class="be-tab be-tab-active" id="be-tab-favs">⭐ Favoritos</button>
    <button class="be-tab"               id="be-tab-todo">Ver todo</button>
  </div>
  <div class="be-search-row" id="be-search-row" style="display:none">
    <input class="be-search-input" id="be-search-input"
           type="text" inputmode="search"
           placeholder="Buscar producto…" autocomplete="off">
    <button class="be-search-clear" id="be-search-clear">✕</button>
  </div>
  <div class="be-scroll" id="be-scroll"></div>
</div>`;

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    stored = null; favSecciones = new Set(); favFilas = [];
    hidden = new Set(); showHidden = false;
    modo = 'favs'; query = ''; searchVisible = false;
    collapsed = new Set(); clearTimeout(debT);
    document.getElementById('app').innerHTML = VIEW;
    init().catch(console.error);
  }

  return { render, cargarArchivo, getArchivo };
})();
