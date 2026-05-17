const PDFViewer = (() => {
  'use strict';

  const PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* ════════════════════════════════════════════════
     INDEXEDDB  (v2)
     meta     → { nombre, size, cargadoEl, carpeta }
     data     → { nombre, buffer }
     carpetas → { nombre, creadaEl }
  ════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_pdf';
    const VER  = 2;

    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);

        r.onupgradeneeded = e => {
          const db  = e.target.result;
          const old = e.oldVersion;

          if (old < 1) {
            db.createObjectStore('meta', { keyPath: 'nombre' });
            db.createObjectStore('data', { keyPath: 'nombre' });
          }
          if (old < 2) {
            db.createObjectStore('carpetas', { keyPath: 'nombre' });
            if (old >= 1) {
              const cur = e.target.transaction.objectStore('meta').openCursor();
              cur.onsuccess = ev => {
                const c = ev.target.result;
                if (!c) return;
                if (c.value.carpeta === undefined) c.update({ ...c.value, carpeta: null });
                c.continue();
              };
            }
          }
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
      /* Preservar carpeta si el PDF ya existía */
      const existing = await new Promise(ok => {
        const r = db.transaction('meta', 'readonly').objectStore('meta').get(nombre);
        r.onsuccess = () => ok(r.result ?? null);
        r.onerror   = () => ok(null);
      });
      const carpeta = existing?.carpeta ?? null;
      return new Promise((ok, fail) => {
        const tx = db.transaction(['meta', 'data'], 'readwrite');
        tx.objectStore('meta').put({ nombre, size, cargadoEl: now, carpeta });
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

    async function getCarpetas() {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('carpetas', 'readonly').objectStore('carpetas').getAll();
        req.onsuccess = () => ok(req.result ?? []);
        req.onerror   = () => fail(req.error);
      });
    }

    async function saveCarpeta(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('carpetas', 'readwrite')
                      .objectStore('carpetas')
                      .put({ nombre, creadaEl: Date.now() });
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }

    async function deleteCarpeta(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx  = db.transaction(['carpetas', 'meta'], 'readwrite');
        tx.objectStore('carpetas').delete(nombre);
        const cur = tx.objectStore('meta').openCursor();
        cur.onsuccess = e => {
          const c = e.target.result;
          if (!c) return;
          if (c.value.carpeta === nombre) c.update({ ...c.value, carpeta: null });
          c.continue();
        };
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      });
    }

    async function setCarpeta(nombre, carpeta) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx  = db.transaction('meta', 'readwrite');
        const req = tx.objectStore('meta').get(nombre);
        req.onsuccess = () => {
          if (req.result) tx.objectStore('meta').put({ ...req.result, carpeta });
        };
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      });
    }

    return { getAll, getData, getCount, save, remove, getCarpetas, saveCarpeta, deleteCarpeta, setCarpeta };
  })();

  /* ════════════════════════════════════════════════
     PDF.JS
  ════════════════════════════════════════════════ */
  function loadPDFJS() {
    return new Promise((ok, fail) => {
      if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
      const s   = document.createElement('script');
      s.src     = PDFJS_URL;
      s.onload  = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL; ok(window.pdfjsLib); };
      s.onerror = () => fail(new Error('No se pudo cargar PDF.js.'));
      document.head.appendChild(s);
    });
  }

  /* ════════════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════════════ */
  const fmtSize = b => b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(2)+' MB';
  const escHtml = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════ */
  let allPDFs     = [];
  let allCarpetas = [];
  let currFolder  = null;   // null = root, string = folder name
  let selMode     = false;
  let selected    = new Set();
  let query       = '';
  let searchVisible = false;
  let debT        = null;
  let pdfDoc      = null;

  /* ════════════════════════════════════════════════
     COMPARTIR — Web Share API
  ════════════════════════════════════════════════ */
  async function compartirPDFs(nombres) {
    if (!nombres.length) return;
    try {
      const archivos = await Promise.all(nombres.map(async n => {
        const rec = await DB.getData(n);
        return new File([rec.buffer], n, { type: 'application/pdf' });
      }));
      if (navigator.canShare?.({ files: archivos })) {
        await navigator.share({
          files: archivos,
          title: archivos.length === 1 ? archivos[0].name : `${archivos.length} documentos PDF`,
        });
      } else {
        /* Fallback: abrir en nueva pestaña */
        for (const f of archivos) {
          const url = URL.createObjectURL(f);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 30000);
        }
      }
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('[PDF] share:', e);
    }
  }

  /* ════════════════════════════════════════════════
     FOLDER PICKER (bottom sheet)
  ════════════════════════════════════════════════ */
  function mostrarFolderPicker(cb) {
    document.getElementById('pv-sheet-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'pv-sheet-overlay';
    overlay.className = 'pv-sheet-overlay';

    const items = allCarpetas
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => `<button class="pv-sheet-item" data-val="${escHtml(c.nombre)}">
        <span class="pv-sheet-item-icon">📁</span>${escHtml(c.nombre)}</button>`).join('');

    overlay.innerHTML = `
      <div class="pv-sheet">
        <div class="pv-sheet-hdr">Mover a carpeta</div>
        <button class="pv-sheet-item" data-val="">
          <span class="pv-sheet-item-icon">📄</span>Sin carpeta</button>
        ${items}
        <button class="pv-sheet-cancel">Cancelar</button>
      </div>`;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target.classList.contains('pv-sheet-cancel') || e.target === overlay) {
        overlay.remove(); return;
      }
      const btn = e.target.closest('.pv-sheet-item');
      if (btn) { overlay.remove(); cb(btn.dataset.val || null); }
    });
  }

  /* ════════════════════════════════════════════════
     ITEM HTML
  ════════════════════════════════════════════════ */
  function pdfItemHTML(p, showBadge) {
    const sel    = selected.has(p.nombre);
    const chk    = selMode
      ? `<div class="pv-item-check${sel ? ' checked' : ''}"></div>`
      : '';
    const badge  = showBadge && p.carpeta
      ? `<span class="pv-item-badge">${escHtml(p.carpeta)}</span>`
      : '';
    const acts   = !selMode
      ? `<button class="pv-item-move" data-nombre="${escHtml(p.nombre)}" aria-label="Mover">📁</button>
         <button class="pv-item-del"  data-nombre="${escHtml(p.nombre)}" aria-label="Eliminar">🗑</button>`
      : '';
    return `
      <div class="pv-item${sel ? ' pv-item-sel' : ''}" data-nombre="${escHtml(p.nombre)}">
        ${chk}
        <div class="pv-item-icon">📄</div>
        <div class="pv-item-info">
          <div class="pv-item-nombre">${escHtml(p.nombre)}${badge}</div>
          <div class="pv-item-meta">${fmtSize(p.size)}</div>
        </div>
        ${acts}
      </div>`;
  }

  /* ════════════════════════════════════════════════
     SELECTION BAR
  ════════════════════════════════════════════════ */
  function actualizarSelBar() {
    const bar      = document.getElementById('pv-sel-bar');
    const countEl  = document.getElementById('pv-sel-count');
    const shareBtn = document.getElementById('pv-sel-share');
    const moverBtn = document.getElementById('pv-sel-mover');
    if (!bar) return;

    bar.style.display = selMode ? 'flex' : 'none';
    if (!selMode) return;

    const n = selected.size;
    if (countEl)  countEl.textContent = `${n} seleccionado${n !== 1 ? 's' : ''}`;
    if (shareBtn) shareBtn.disabled   = n === 0;
    if (moverBtn) {
      moverBtn.style.display = currFolder === null ? '' : 'none';
      moverBtn.disabled      = n === 0;
    }
  }

  /* ════════════════════════════════════════════════
     ROOT VIEW
  ════════════════════════════════════════════════ */
  const VIEW_ROOT = `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title">Documentos PDF</div></div>
    <button class="pv-icon-btn" id="pv-search-toggle" aria-label="Buscar">🔍</button>
    <button class="pv-icon-btn" id="pv-sel-toggle"    aria-label="Seleccionar">☑</button>
    <button class="pv-icon-btn" id="pv-new-folder"    aria-label="Nueva carpeta">📁+</button>
  </div>
  <div class="pv-search-row" id="pv-search-row" style="display:none">
    <input class="pv-search-input" id="pv-search-input"
           type="text" inputmode="search" placeholder="Buscar documento…" autocomplete="off">
    <button class="pv-search-clear" id="pv-search-clear">✕</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
  <div class="pv-sel-bar" id="pv-sel-bar" style="display:none">
    <span class="pv-sel-count" id="pv-sel-count">0 seleccionados</span>
    <button class="pv-sel-btn" id="pv-sel-mover">Mover ›</button>
    <button class="pv-sel-btn primary" id="pv-sel-share">Compartir ›</button>
  </div>
</div>`;

  function dibujarRoot() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll) return;

    const q = query.toLowerCase();
    let html = '';

    if (q) {
      const found = allPDFs
        .filter(p => p.nombre.toLowerCase().includes(q))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      html = found.length
        ? found.map(p => pdfItemHTML(p, true)).join('')
        : `<div class="pv-empty"><span class="pv-empty-icon">🔍</span><span>Sin coincidencias.</span></div>`;
    } else {
      const sorted   = [...allCarpetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const sinCarp  = allPDFs.filter(p => !p.carpeta).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      if (sorted.length) {
        html += `<div class="pv-section-hdr">Carpetas</div>`;
        html += sorted.map(c => {
          const n = allPDFs.filter(p => p.carpeta === c.nombre).length;
          return `
            <div class="pv-folder-item" data-carpeta="${escHtml(c.nombre)}">
              <span class="pv-folder-icon">📁</span>
              <div class="pv-folder-info">
                <div class="pv-folder-name">${escHtml(c.nombre)}</div>
                <div class="pv-folder-count">${n} documento${n !== 1 ? 's' : ''}</div>
              </div>
              <button class="pv-folder-act share" data-carpeta="${escHtml(c.nombre)}" aria-label="Compartir">🔗</button>
              <button class="pv-folder-act del"   data-carpeta="${escHtml(c.nombre)}" aria-label="Eliminar">🗑</button>
            </div>`;
        }).join('');
      }

      html += `<div class="pv-section-hdr">Sin carpeta</div>`;
      if (!allPDFs.length) {
        html += `<div class="pv-empty"><span class="pv-empty-icon">📄</span>
          <span>Sin documentos guardados.<br>Cargá PDFs desde <strong>Configuración</strong>.</span></div>`;
      } else if (!sinCarp.length) {
        html += `<div class="pv-empty-small">Todos los documentos están en carpetas.</div>`;
      } else {
        html += sinCarp.map(p => pdfItemHTML(p, false)).join('');
      }
    }

    scroll.innerHTML = html;
    actualizarSelBar();
  }

  function initRoot() {
    document.getElementById('pv-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    document.getElementById('pv-new-folder')
      ?.addEventListener('click', async () => {
        const nombre = prompt('Nombre de la carpeta:')?.trim();
        if (!nombre) return;
        if (allCarpetas.some(c => c.nombre === nombre)) {
          alert('Ya existe una carpeta con ese nombre.'); return;
        }
        await DB.saveCarpeta(nombre);
        allCarpetas.push({ nombre, creadaEl: Date.now() });
        dibujarRoot();
      });

    document.getElementById('pv-sel-toggle')
      ?.addEventListener('click', () => {
        selMode = !selMode; selected.clear(); dibujarRoot();
      });

    document.getElementById('pv-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('pv-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('pv-search-input')?.focus();
        else { query = ''; document.getElementById('pv-search-input').value = ''; dibujarRoot(); }
      });

    document.getElementById('pv-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarRoot(); }, 150);
      });

    document.getElementById('pv-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('pv-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarRoot();
      });

    document.getElementById('pv-sel-share')
      ?.addEventListener('click', () => compartirPDFs([...selected]));

    document.getElementById('pv-sel-mover')
      ?.addEventListener('click', () => {
        if (!selected.size) return;
        mostrarFolderPicker(async carpeta => {
          for (const nombre of selected) {
            await DB.setCarpeta(nombre, carpeta);
            const p = allPDFs.find(x => x.nombre === nombre);
            if (p) p.carpeta = carpeta;
          }
          selected.clear(); selMode = false; dibujarRoot();
        });
      });

    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        /* Carpeta — share */
        const fShare = e.target.closest('.pv-folder-act.share');
        if (fShare) {
          const carpeta = fShare.dataset.carpeta;
          await compartirPDFs(allPDFs.filter(p => p.carpeta === carpeta).map(p => p.nombre));
          return;
        }
        /* Carpeta — eliminar */
        const fDel = e.target.closest('.pv-folder-act.del');
        if (fDel) {
          const carpeta = fDel.dataset.carpeta;
          if (!confirm(`¿Eliminar la carpeta "${carpeta}"?\nLos documentos quedarán sin carpeta.`)) return;
          await DB.deleteCarpeta(carpeta);
          allCarpetas = allCarpetas.filter(c => c.nombre !== carpeta);
          allPDFs.forEach(p => { if (p.carpeta === carpeta) p.carpeta = null; });
          dibujarRoot(); return;
        }
        /* Carpeta — abrir */
        const fItem = e.target.closest('.pv-folder-item');
        if (fItem) { await renderFolder(fItem.dataset.carpeta); return; }

        /* PDF — mover */
        const moveBtn = e.target.closest('.pv-item-move');
        if (moveBtn) {
          mostrarFolderPicker(async carpeta => {
            const nombre = moveBtn.dataset.nombre;
            await DB.setCarpeta(nombre, carpeta);
            const p = allPDFs.find(x => x.nombre === nombre);
            if (p) p.carpeta = carpeta;
            dibujarRoot();
          }); return;
        }
        /* PDF — eliminar */
        const delBtn = e.target.closest('.pv-item-del');
        if (delBtn) {
          const nombre = delBtn.dataset.nombre;
          const el = document.querySelector(`.pv-item[data-nombre="${CSS.escape(nombre)}"]`);
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }
          await DB.remove(nombre);
          allPDFs = allPDFs.filter(p => p.nombre !== nombre);
          selected.delete(nombre);
          setTimeout(() => dibujarRoot(), 200); return;
        }
        /* PDF — seleccionar / abrir */
        const item = e.target.closest('.pv-item');
        if (item) {
          const nombre = item.dataset.nombre;
          if (selMode) {
            selected.has(nombre) ? selected.delete(nombre) : selected.add(nombre);
            dibujarRoot();
          } else {
            await abrirVisor(nombre);
          }
        }
      });
  }

  /* ════════════════════════════════════════════════
     FOLDER VIEW
  ════════════════════════════════════════════════ */
  function buildFolderView(nombre) {
    return `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title">${escHtml(nombre)}</div></div>
    <button class="pv-icon-btn" id="pv-sel-toggle"      aria-label="Seleccionar">☑</button>
    <button class="pv-icon-btn" id="pv-folder-share-all" aria-label="Compartir todo">🔗</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
  <div class="pv-sel-bar" id="pv-sel-bar" style="display:none">
    <span class="pv-sel-count" id="pv-sel-count">0 seleccionados</span>
    <button class="pv-sel-btn primary" id="pv-sel-share">Compartir ›</button>
  </div>
</div>`;
  }

  function dibujarFolder() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll) return;

    const pdfs = allPDFs
      .filter(p => p.carpeta === currFolder)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    scroll.innerHTML = pdfs.length
      ? pdfs.map(p => pdfItemHTML(p, false)).join('')
      : `<div class="pv-empty">
          <span class="pv-empty-icon">📂</span>
          <span>Carpeta vacía. Mové documentos acá desde la vista principal.</span>
        </div>`;

    actualizarSelBar();
  }

  async function renderFolder(nombre) {
    currFolder = nombre;
    selMode    = false;
    selected.clear();

    document.getElementById('app').innerHTML = buildFolderView(nombre);

    document.getElementById('pv-back')
      ?.addEventListener('click', () => { currFolder = null; selMode = false; selected.clear(); render(); });

    document.getElementById('pv-sel-toggle')
      ?.addEventListener('click', () => { selMode = !selMode; selected.clear(); dibujarFolder(); });

    document.getElementById('pv-folder-share-all')
      ?.addEventListener('click', async () => {
        const nombres = allPDFs.filter(p => p.carpeta === nombre).map(p => p.nombre);
        await compartirPDFs(nombres);
      });

    document.getElementById('pv-sel-share')
      ?.addEventListener('click', () => compartirPDFs([...selected]));

    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        const delBtn = e.target.closest('.pv-item-del');
        if (delBtn) {
          const n  = delBtn.dataset.nombre;
          const el = document.querySelector(`.pv-item[data-nombre="${CSS.escape(n)}"]`);
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }
          await DB.remove(n);
          allPDFs = allPDFs.filter(p => p.nombre !== n);
          selected.delete(n);
          setTimeout(() => dibujarFolder(), 200); return;
        }
        const item = e.target.closest('.pv-item');
        if (!item) return;
        const n = item.dataset.nombre;
        if (selMode) {
          selected.has(n) ? selected.delete(n) : selected.add(n);
          dibujarFolder();
        } else {
          await abrirVisor(n);
        }
      });

    dibujarFolder();
  }

  /* ════════════════════════════════════════════════
     VISOR PDF
  ════════════════════════════════════════════════ */
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

  async function abrirVisor(nombre) {
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
    document.getElementById('app').innerHTML = buildVisorView(nombre);

    document.getElementById('pv-visor-back')
      ?.addEventListener('click', () => {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        if (currFolder !== null) renderFolder(currFolder);
        else render();
      });

    document.getElementById('pv-share-btn')
      ?.addEventListener('click', () => compartirPDFs([nombre]));

    const indicator = document.getElementById('pv-page-indicator');
    const container = document.getElementById('pv-visor-scroll');

    try {
      const [pdfjsLib, record] = await Promise.all([loadPDFJS(), DB.getData(nombre)]);
      if (!record) throw new Error('PDF no encontrado.');

      const typedArray = new Uint8Array(record.buffer);
      pdfDoc           = await pdfjsLib.getDocument({ data: typedArray }).promise;
      const total      = pdfDoc.numPages;
      if (indicator) indicator.textContent = `Página 1 / ${total}`;

      const pageEls = [];
      for (let i = 1; i <= total; i++) {
        const div = document.createElement('div');
        div.className = 'pv-page'; div.dataset.page = String(i);
        container.appendChild(div); pageEls.push(div);
      }

      const io = new IntersectionObserver(entries => {
        let maxRatio = 0, curPage = 1;
        entries.forEach(en => {
          if (en.intersectionRatio > maxRatio) { maxRatio = en.intersectionRatio; curPage = parseInt(en.target.dataset.page, 10); }
        });
        if (indicator) indicator.textContent = `Página ${curPage} / ${total}`;
      }, { root: container, threshold: [0, 0.25, 0.5, 0.75, 1] });
      pageEls.forEach(el => io.observe(el));

      const renderWidth = container.clientWidth || window.screen.width;
      const dpr         = Math.min(window.devicePixelRatio || 1, 2);

      for (let i = 1; i <= total; i++) {
        if (!pdfDoc) break;
        try {
          const page     = await pdfDoc.getPage(i);
          const scale    = renderWidth / page.getViewport({ scale: 1 }).width;
          const viewport = page.getViewport({ scale: scale * dpr });
          const canvas   = document.createElement('canvas');
          canvas.width   = Math.floor(viewport.width);
          canvas.height  = Math.floor(viewport.height);
          canvas.style.width  = `${Math.floor(viewport.width  / dpr)}px`;
          canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          page.cleanup();
          if (!pdfDoc) break;
          const pageDiv = pageEls[i - 1];
          if (pageDiv) { pageDiv.innerHTML = ''; pageDiv.appendChild(canvas); pageDiv.style.height = ''; }
        } catch (pageErr) {
          if (pdfDoc) console.warn(`[PDF] pág ${i}:`, pageErr);
        }
      }
    } catch (err) {
      if (indicator) indicator.textContent = '';
      if (container) container.innerHTML = `<div class="pv-empty">
        <span class="pv-empty-icon">⚠️</span><span>${escHtml(err.message)}</span></div>`;
    }
  }

  /* ════════════════════════════════════════════════
     API PÚBLICA
  ════════════════════════════════════════════════ */
  async function cargarPDF(file) {
    const buffer = await file.arrayBuffer();
    await DB.save(file.name, buffer, file.size);
    const meta = { nombre: file.name, size: file.size, cargadoEl: Date.now(), carpeta: null };
    const idx  = allPDFs.findIndex(p => p.nombre === file.name);
    if (idx >= 0) { meta.carpeta = allPDFs[idx].carpeta; allPDFs[idx] = meta; }
    else allPDFs.push(meta);
    return meta;
  }

  async function getCount() { return DB.getCount(); }

  function render() {
    query = ''; searchVisible = false; clearTimeout(debT);
    if (currFolder === null) { selMode = false; selected.clear(); }
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }

    document.getElementById('app').innerHTML = VIEW_ROOT;

    Promise.all([DB.getAll(), DB.getCarpetas()])
      .then(([pdfs, carpetas]) => { allPDFs = pdfs; allCarpetas = carpetas; dibujarRoot(); initRoot(); })
      .catch(console.error);
  }

  return { render, cargarPDF, getCount };
})();
