const PDFViewer = (() => {
  'use strict';

  /*
   * PDF.js se carga desde CDN pero queda pre-cacheado por el Service Worker
   * en la instalación → disponible offline luego de la primera visita.
   */
  const PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* ═══════════════════════════════════════════════════
     INDEXEDDB
     meta  → { nombre, size, cargadoEl }          — para la lista
     data  → { nombre, buffer: ArrayBuffer }       — para el visor
  ═══════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_pdf';
    const VER  = 1;

    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);
        r.onupgradeneeded = e => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('meta'))
            db.createObjectStore('meta', { keyPath: 'nombre' });
          if (!db.objectStoreNames.contains('data'))
            db.createObjectStore('data', { keyPath: 'nombre' });
        };
        r.onsuccess = e => ok(e.target.result);
        r.onerror   = () => fail(r.error);
      });
    }

    async function getAll() {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('meta', 'readonly').objectStore('meta').getAll();
        req.onsuccess = () => ok(req.result ?? []);
        req.onerror   = () => fail(req.error);
      });
    }

    async function getData(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('data', 'readonly').objectStore('data').get(nombre);
        req.onsuccess = () => ok(req.result ?? null);
        req.onerror   = () => fail(req.error);
      });
    }

    async function getCount() {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('meta', 'readonly').objectStore('meta').count();
        req.onsuccess = () => ok(req.result);
        req.onerror   = () => fail(req.error);
      });
    }

    async function save(nombre, buffer, size) {
      const db  = await open();
      const now = Date.now();
      return new Promise((ok, fail) => {
        const tx = db.transaction(['meta', 'data'], 'readwrite');
        tx.objectStore('meta').put({ nombre, size, cargadoEl: now });
        tx.objectStore('data').put({ nombre, buffer });
        tx.oncomplete = ok;
        tx.onerror    = () => fail(tx.error);
      });
    }

    async function remove(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx = db.transaction(['meta', 'data'], 'readwrite');
        tx.objectStore('meta').delete(nombre);
        tx.objectStore('data').delete(nombre);
        tx.oncomplete = ok;
        tx.onerror    = () => fail(tx.error);
      });
    }

    return { getAll, getData, getCount, save, remove };
  })();

  /* ═══════════════════════════════════════════════════
     PDF.JS — carga dinámica
  ═══════════════════════════════════════════════════ */
  function loadPDFJS() {
    return new Promise((ok, fail) => {
      if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
      const s   = document.createElement('script');
      s.src     = PDFJS_URL;
      s.onload  = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
        ok(window.pdfjsLib);
      };
      s.onerror = () => fail(new Error('No se pudo cargar PDF.js. Verificá la conexión.'));
      document.head.appendChild(s);
    });
  }

  /* ═══════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════ */
  const fmtSize = b => {
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const escHtml = s => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ═══════════════════════════════════════════════════
     STATE
  ═══════════════════════════════════════════════════ */
  let allPDFs       = [];     // [{nombre, size, cargadoEl}]
  let query         = '';
  let searchVisible = false;
  let debT          = null;
  let pdfDoc        = null;   // instancia de PDF.js

  /* ═══════════════════════════════════════════════════
     REPOSITORIO — SHELL
  ═══════════════════════════════════════════════════ */
  const VIEW_REPO = `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles">
      <div class="pv-title">Documentos PDF</div>
    </div>
    <button class="pv-icon-btn" id="pv-search-toggle" aria-label="Buscar">🔍</button>
  </div>
  <div class="pv-search-row" id="pv-search-row" style="display:none">
    <input class="pv-search-input" id="pv-search-input"
           type="text" inputmode="search"
           placeholder="Buscar documento…" autocomplete="off">
    <button class="pv-search-clear" id="pv-search-clear">✕</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
</div>`;

  /* ═══════════════════════════════════════════════════
     REPOSITORIO — LISTA
  ═══════════════════════════════════════════════════ */
  function dibujarLista() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll) return;

    const q      = query.toLowerCase();
    const sorted = [...allPDFs]
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    if (!sorted.length) {
      const [icon, msg] = q
        ? ['🔍', 'Sin coincidencias.']
        : ['📄', 'Sin documentos guardados.<br>Cargá PDFs desde <strong>Configuración</strong>.'];
      scroll.innerHTML = `<div class="pv-empty">
        <span class="pv-empty-icon">${icon}</span><span>${msg}</span></div>`;
      return;
    }

    scroll.innerHTML = sorted.map(p => `
      <div class="pv-item" data-nombre="${escHtml(p.nombre)}">
        <div class="pv-item-icon">📄</div>
        <div class="pv-item-info">
          <div class="pv-item-nombre">${escHtml(p.nombre)}</div>
          <div class="pv-item-meta">${fmtSize(p.size)}</div>
        </div>
        <button class="pv-item-del" data-nombre="${escHtml(p.nombre)}" aria-label="Eliminar">🗑</button>
      </div>`).join('');
  }

  /* ═══════════════════════════════════════════════════
     REPOSITORIO — INIT
  ═══════════════════════════════════════════════════ */
  function initRepo() {
    document.getElementById('pv-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    /* Buscador */
    document.getElementById('pv-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('pv-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('pv-search-input')?.focus();
        else {
          query = '';
          const inp = document.getElementById('pv-search-input');
          if (inp) inp.value = '';
          dibujarLista();
        }
      });

    document.getElementById('pv-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarLista(); }, 150);
      });

    document.getElementById('pv-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('pv-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarLista();
      });

    /* Delegación: abrir o eliminar */
    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        const delBtn = e.target.closest('.pv-item-del');
        const item   = !delBtn ? e.target.closest('.pv-item') : null;

        if (delBtn) {
          const nombre = delBtn.dataset.nombre;
          /* Animación de salida antes de eliminar */
          const el = document.querySelector(`.pv-item[data-nombre="${CSS.escape(nombre)}"]`);
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }
          await DB.remove(nombre);
          allPDFs = allPDFs.filter(p => p.nombre !== nombre);
          dibujarLista();
        } else if (item) {
          await abrirVisor(item.dataset.nombre);
        }
      });
  }

  /* ═══════════════════════════════════════════════════
     VISOR — SHELL
  ═══════════════════════════════════════════════════ */
  function buildVisorView(nombre) {
    return `
<div class="pv-view pv-visor-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-visor-back">&#8249;</button>
    <div class="pv-titles">
      <div class="pv-title pv-visor-title">${escHtml(nombre)}</div>
    </div>
    <button class="pv-icon-btn" id="pv-share-btn" aria-label="Compartir">🔗</button>
  </div>
  <div class="pv-page-indicator" id="pv-page-indicator">Cargando…</div>
  <div class="pv-visor-scroll" id="pv-visor-scroll"></div>
</div>`;
  }

  /* ═══════════════════════════════════════════════════
     VISOR — RENDERIZADO
  ═══════════════════════════════════════════════════ */
  async function abrirVisor(nombre) {
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }

    document.getElementById('app').innerHTML = buildVisorView(nombre);

    /* Volver al repositorio */
    document.getElementById('pv-visor-back')
      ?.addEventListener('click', () => {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        render();
      });

    /* Compartir — abre el PDF en el visor nativo de Chrome (sin descargar) */
    document.getElementById('pv-share-btn')
      ?.addEventListener('click', async () => {
        const record = await DB.getData(nombre);
        if (!record) return;
        const blob = new Blob([record.buffer], { type: 'application/pdf' });
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      });

    const indicator = document.getElementById('pv-page-indicator');
    const container = document.getElementById('pv-visor-scroll');

    try {
      const [pdfjsLib, record] = await Promise.all([
        loadPDFJS(),
        DB.getData(nombre),
      ]);

      if (!record) throw new Error('PDF no encontrado.');

      const typedArray = new Uint8Array(record.buffer);
      const loadTask   = pdfjsLib.getDocument({ data: typedArray });
      pdfDoc           = await loadTask.promise;

      const total = pdfDoc.numPages;
      if (indicator) indicator.textContent = `Página 1 / ${total}`;

      /* Crear contenedores para todas las páginas */
      const pageEls = [];
      for (let i = 1; i <= total; i++) {
        const div = document.createElement('div');
        div.className    = 'pv-page';
        div.dataset.page = String(i);
        container.appendChild(div);
        pageEls.push(div);
      }

      /* IntersectionObserver → indicador de página actual */
      const io = new IntersectionObserver(entries => {
        let maxRatio = 0;
        let curPage  = 1;
        entries.forEach(en => {
          if (en.intersectionRatio > maxRatio) {
            maxRatio = en.intersectionRatio;
            curPage  = parseInt(en.target.dataset.page, 10);
          }
        });
        if (indicator) indicator.textContent = `Página ${curPage} / ${total}`;
      }, { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] });

      pageEls.forEach(el => io.observe(el));

      /* Renderizar páginas secuencialmente */
      const renderWidth = container.clientWidth || window.screen.width;
      const dpr         = Math.min(window.devicePixelRatio || 1, 2); // cap 2× para ahorrar memoria

      for (let i = 1; i <= total; i++) {
        if (!pdfDoc) break; // usuario volvió atrás

        try {
          const page     = await pdfDoc.getPage(i);
          const vp0      = page.getViewport({ scale: 1 });
          const scale    = renderWidth / vp0.width;
          const viewport = page.getViewport({ scale: scale * dpr });

          const canvas        = document.createElement('canvas');
          canvas.width        = Math.floor(viewport.width);
          canvas.height       = Math.floor(viewport.height);
          canvas.style.width  = `${Math.floor(viewport.width  / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;

          await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport,
          }).promise;
          page.cleanup();

          if (!pdfDoc) break; // verificar de nuevo tras render asíncrono

          const pageDiv = pageEls[i - 1];
          if (pageDiv) {
            pageDiv.innerHTML = '';
            pageDiv.appendChild(canvas);
            pageDiv.style.height = ''; // quitar height de placeholder
          }
        } catch (pageErr) {
          if (pdfDoc) console.warn(`[PDF] Error en página ${i}:`, pageErr);
        }
      }

    } catch (err) {
      if (indicator) indicator.textContent = '';
      if (container) container.innerHTML = `
        <div class="pv-empty">
          <span class="pv-empty-icon">⚠️</span>
          <span>${escHtml(err.message)}</span>
        </div>`;
    }
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  async function cargarPDF(file) {
    const buffer = await file.arrayBuffer();
    await DB.save(file.name, buffer, file.size);
    /* Actualizar caché en memoria */
    const meta = { nombre: file.name, size: file.size, cargadoEl: Date.now() };
    const idx  = allPDFs.findIndex(p => p.nombre === file.name);
    if (idx >= 0) allPDFs[idx] = meta;
    else          allPDFs.push(meta);
    return meta;
  }

  async function getCount() { return DB.getCount(); }

  function render() {
    query = ''; searchVisible = false; clearTimeout(debT);
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }

    document.getElementById('app').innerHTML = VIEW_REPO;

    DB.getAll()
      .then(list => { allPDFs = list; dibujarLista(); initRepo(); })
      .catch(console.error);
  }

  return { render, cargarPDF, getCount };
})();
