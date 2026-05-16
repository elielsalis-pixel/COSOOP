const BancaPersonas = (() => {
  'use strict';

  /*
   * Solo se cargan estas tres hojas (por nombre normalizado).
   * El valor es el label que se muestra como "hoja" en la vista.
   * Cualquier otra hoja del archivo se ignora.
   */
  const HOJAS_BP = new Map([
    ['productos',                      'Productos'],
    ['convenios prestamos personales', 'Convenios'],
    ['hipotecarios',                   'Hipotecarios'],
  ]);

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
    const NAME = 'cosoop_bp';
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
        const req = db.transaction(store, 'readonly').objectStore(store).get(1);
        req.onsuccess = () => ok(req.result || null);
        req.onerror   = () => fail(req.error);
      });
    }
    async function put(store, data) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction(store, 'readwrite')
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
     Las celdas con fórmulas sin resolver (=C8, etc.)
     llegan como string que comienza con '='. Se muestra '—'.
  ═══════════════════════════════════════════════════ */
  function formatVal(v) {
    if (v == null) return '';
    if (typeof v === 'string') {
      if (v.startsWith('=')) return '—';
      return v.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    }
    if (typeof v === 'number') {
      if (v > 0 && v <= 2)     return (v * 100).toFixed(2).replace('.', ',') + ' %';
      if (Number.isInteger(v)) return String(v);
      return v.toLocaleString('es-AR', { maximumFractionDigits: 4 });
    }
    return String(v);
  }

  /* ═══════════════════════════════════════════════════
     PARSEO DEL XLSX
     Solo se procesan las hojas de HOJAS_BP.
     La lógica interna (detección de columnas, header,
     sub-secciones) es idéntica a TASAS_BE.
  ═══════════════════════════════════════════════════ */
  async function parsear(file) {
    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const secciones = [];

    for (const sheetName of wb.SheetNames) {
      const normSheet = normNombre(sheetName);
      if (!HOJAS_BP.has(normSheet)) continue;
      const label = HOJAS_BP.get(normSheet);   // label amigable para la vista

      const ws  = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const rows = raw.filter(r =>
        r.slice(1).some(c => c != null && String(c).trim() !== '')
      );
      if (rows.length < 2) continue;

      /* Columnas con al menos 2 apariciones de dato */
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

      /* Detección de fila de encabezado */
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
        headerVals = usedCols.map((_, i) => i === 0 ? 'Denominación' : `Col ${i + 1}`);
      }

      /* Iteración de datos: filas de sección vs filas de datos */
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
          current = {
            nombre:  String(vals[0]).trim(),
            hoja:    label,
            headers: headerVals,
            filas:   [],
          };
        } else if (current) {
          current.filas.push(vals.map(formatVal));
        }
      }
      if (current?.filas.length) hojaSecs.push(current);

      /* Sin sub-secciones → la hoja completa es una sección */
      if (!hojaSecs.length) {
        const allData = rows.slice(Math.max(0, headerIdx + 1))
          .map(r => extract(r).map(formatVal))
          .filter(r => r.some(c => c !== ''));
        if (allData.length)
          hojaSecs.push({ nombre: label, hoja: label, headers: headerVals, filas: allData });
      }
      secciones.push(...hojaSecs);
    }

    if (!secciones.length) throw new Error('No se encontraron secciones con datos.');
    return secciones;
  }

  /* ═══════════════════════════════════════════════════
     PREFERENCIAS
     Storage: {
       secciones : string[],           ← secciones favoritas completas
       filas     : [{seccion, denom}], ← filas individuales favoritas
       hidden    : string[],           ← secciones ocultas por el usuario
     }
  ═══════════════════════════════════════════════════ */
  async function loadFavoritos() {
    const raw = await DB.get('favoritos').catch(() => null);
    if (!raw) return { secciones: new Set(), filas: [], hidden: new Set() };
    return {
      secciones: new Set(raw.secciones ?? []),
      filas:     raw.filas   ?? [],
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

    /* Sin favoritos por defecto — el usuario los elige manualmente */
    const nuevosSecs  = new Set([...favsSecActuales].filter(n => nombres.has(n)));

    const nuevasFilas = favFilasActuales.filter(f => {
      const sec = secciones.find(s => s.nombre === f.seccion);
      if (!sec) return false;
      return sec.filas.some(r => String(r[0] ?? '').trim() === f.denom);
    });

    const nuevasHidden = new Set([...hiddenActuales].filter(n => nombres.has(n)));

    await Promise.all([
      DB.put('archivo', { secciones, nombre: file.name, cargadoEl: Date.now() }),
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
  let favSecciones  = new Set();
  let favFilas      = [];
  let hidden        = new Set();
  let showHidden    = false;
  let modo          = 'favs';
  let query         = '';
  let searchVisible = false;
  let collapsed     = new Set();
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
    div.className     = 'bp-section'
      + (isCollapsed ? ' bp-collapsed'  : '')
      + (isHiddenSec ? ' bp-hidden-sec' : '');

    const hdr = document.createElement('div');
    hdr.className      = 'bp-section-hdr';
    hdr.dataset.nombre = s.nombre;
    hdr.innerHTML = `
      <span class="bp-section-chevron">▾</span>
      <div class="bp-section-meta">
        <span class="bp-section-tag">${escHtml(s.hoja)}</span>
        <span class="bp-section-nombre">${escHtml(s.nombre)}</span>
      </div>
      ${isHiddenSec
        ? `<button class="bp-restore-btn" data-nombre="${escHtml(s.nombre)}" aria-label="Mostrar sección">↩ Mostrar</button>`
        : `<button class="bp-star${isSecFav ? ' bp-star-on' : ''}"
                   data-nombre="${escHtml(s.nombre)}" aria-label="Marcar sección favorita">
             ${isSecFav ? '★' : '☆'}
           </button>
           <button class="bp-hide-btn" data-nombre="${escHtml(s.nombre)}" aria-label="Ocultar sección">✕</button>`
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
            return `<td><div class="bp-row-cell bp-row-cont"><span>${escHtml(val)}</span></div></td>`;
          }
          const isRowFav = favFilas.some(f => f.seccion === s.nombre && f.denom === denom);
          return `<td><div class="bp-row-cell">` +
            `<button class="bp-row-star${isRowFav ? ' bp-row-star-on' : ''}" ` +
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
    wrap.className = 'bp-table-wrap';
    wrap.innerHTML = `<table class="bp-table">
      ${thCells ? `<thead><tr>${thCells}</tr></thead>` : ''}
      <tbody>${tbody}</tbody>
    </table>`;
    div.appendChild(wrap);
    return div;
  }

  function buildHiddenPill() {
    const n   = hidden.size;
    const div = document.createElement('div');
    div.className = 'bp-hidden-pill';
    div.id        = 'bp-hidden-pill';
    if (showHidden) {
      div.innerHTML =
        `<span>Mostrando ${n} secci${n > 1 ? 'ones' : 'ón'} oculta${n > 1 ? 's' : ''}</span>` +
        `<button class="bp-hidden-toggle">Ocultar</button>`;
    } else {
      div.innerHTML =
        `<span>${n} secci${n > 1 ? 'ones' : 'ón'} oculta${n > 1 ? 's' : ''}</span>` +
        `<button class="bp-hidden-toggle">Mostrar</button>`;
    }
    return div;
  }

  function dibujarSecciones() {
    const scroll = document.getElementById('bp-scroll');
    if (!scroll) return;
    scroll.innerHTML = '';

    document.getElementById('bp-tab-favs')?.classList.toggle('bp-tab-active', modo === 'favs');
    document.getElementById('bp-tab-todo')?.classList.toggle('bp-tab-active', modo === 'todo');

    /* Ícono plegar/desplegar */
    const _secs = seccionesFiltradas();
    const _allCollapsed = _secs.length > 0 && _secs.every(s => collapsed.has(s.nombre));
    const _foldBtn = document.getElementById('bp-fold-toggle');
    if (_foldBtn) {
      _foldBtn.textContent = _allCollapsed ? '⊞' : '⊟';
      _foldBtn.setAttribute('aria-label', _allCollapsed ? 'Desplegar todo' : 'Plegar todo');
    }

    if (!stored?.secciones?.length) {
      scroll.innerHTML = `<div class="bp-empty"><span class="bp-empty-icon">👤</span>
        <span>Sin datos cargados.<br>Cargá el archivo XLSX desde <strong>Configuración</strong>.</span></div>`;
      return;
    }

    if (!_secs.length && hidden.size === 0) {
      const [icon, msg] = query
        ? ['🔍', 'Sin coincidencias para esa búsqueda.']
        : ['⭐', 'No hay favoritos.<br>En <strong>Ver todo</strong> marcá ★ en una sección o en una fila individual.'];
      scroll.innerHTML = `<div class="bp-empty"><span class="bp-empty-icon">${icon}</span><span>${msg}</span></div>`;
      return;
    }

    _secs.forEach(s => scroll.appendChild(buildSeccion(s)));

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
    document.getElementById('bp-back')
      ?.addEventListener('click', () => App.navigateTo('tas'));

    document.getElementById('bp-fold-toggle')
      ?.addEventListener('click', () => {
        const secs = seccionesFiltradas();
        const allCollapsed = secs.length > 0 && secs.every(s => collapsed.has(s.nombre));
        secs.forEach(s => allCollapsed ? collapsed.delete(s.nombre) : collapsed.add(s.nombre));
        dibujarSecciones();
      });

    document.getElementById('bp-tab-favs')
      ?.addEventListener('click', () => { modo = 'favs'; dibujarSecciones(); });
    document.getElementById('bp-tab-todo')
      ?.addEventListener('click', () => { modo = 'todo'; dibujarSecciones(); });

    document.getElementById('bp-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('bp-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('bp-search-input')?.focus();
        else {
          query = '';
          const inp = document.getElementById('bp-search-input');
          if (inp) inp.value = '';
          dibujarSecciones();
        }
      });

    document.getElementById('bp-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarSecciones(); }, 150);
      });

    document.getElementById('bp-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('bp-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarSecciones();
      });

    /* Delegación única para todos los botones del scroll */
    document.getElementById('bp-scroll')?.addEventListener('click', async e => {
      const secBtn     = e.target.closest('.bp-star');
      const rowBtn     = e.target.closest('.bp-row-star');
      const hideBtn    = e.target.closest('.bp-hide-btn');
      const restoreBtn = e.target.closest('.bp-restore-btn');
      const toggleBtn  = e.target.closest('.bp-hidden-toggle');
      const hdrEl      = !secBtn && !rowBtn && !hideBtn && !restoreBtn && !toggleBtn
                         ? e.target.closest('.bp-section-hdr') : null;

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
        hidden.add(hideBtn.dataset.nombre);
        await saveFavoritos();
        dibujarSecciones();

      } else if (restoreBtn) {
        hidden.delete(restoreBtn.dataset.nombre);
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
        const secDiv = hdrEl.closest('.bp-section');
        if (secDiv) secDiv.classList.toggle('bp-collapsed', collapsed.has(nombre));
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

    const subEl = document.getElementById('bp-subtitle');
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
<div class="bp-view">
  <div class="bp-topbar">
    <button class="bp-back" id="bp-back">&#8249;</button>
    <div class="bp-titles">
      <div class="bp-title">Tasas Banca Personas</div>
      <div class="bp-subtitle" id="bp-subtitle"></div>
    </div>
    <button class="bp-icon-btn" id="bp-fold-toggle"   aria-label="Plegar todo">⊟</button>
    <button class="bp-icon-btn" id="bp-search-toggle" aria-label="Buscar">🔍</button>
  </div>
  <div class="bp-tabs">
    <button class="bp-tab bp-tab-active" id="bp-tab-favs">⭐ Favoritos</button>
    <button class="bp-tab"               id="bp-tab-todo">Ver todo</button>
  </div>
  <div class="bp-search-row" id="bp-search-row" style="display:none">
    <input class="bp-search-input" id="bp-search-input"
           type="text" inputmode="search"
           placeholder="Buscar producto…" autocomplete="off">
    <button class="bp-search-clear" id="bp-search-clear">✕</button>
  </div>
  <div class="bp-scroll" id="bp-scroll"></div>
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
