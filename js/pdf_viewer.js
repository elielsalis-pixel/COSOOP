const PDFViewer = (() => {
  'use strict';

  const PDFJS_URL  = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  /* ════════════════════════════════════════════════
     INDEXEDDB  v3
     meta     → { nombre, size, cargadoEl }
     data     → { nombre, buffer }
     carpetas → { nombre, creadaEl, pdfs: [nombre, …] }
  ════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_pdf';
    const VER  = 3;

    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);

        r.onupgradeneeded = e => {
          const db  = e.target.result;
          const tx  = e.target.transaction;
          const old = e.oldVersion;

          /* v1: crear stores base */
          if (old < 1) {
            db.createObjectStore('meta', { keyPath: 'nombre' });
            db.createObjectStore('data', { keyPath: 'nombre' });
          }
          /* v2: crear carpetas (modelo antiguo sin pdfs[]) */
          if (old < 2) {
            db.createObjectStore('carpetas', { keyPath: 'nombre' });
          }
          /* v3: migrar carpetas para que tengan pdfs:[],
                 leyendo asignaciones del campo carpeta en meta */
          if (old < 3) {
            const assignments = {};
            const metaStore   = tx.objectStore('meta');
            const carpStore   = tx.objectStore('carpetas');

            const pdfCur = metaStore.openCursor();
            pdfCur.onsuccess = ev => {
              const c = ev.target.result;
              if (c) {
                const nombre  = c.value.nombre;
                const carpeta = c.value.carpeta;
                if (carpeta) {
                  if (!assignments[carpeta]) assignments[carpeta] = [];
                  assignments[carpeta].push(nombre);
                }
                c.continue();
              } else {
                /* Todos los PDFs recorridos → actualizar carpetas */
                const carpCur = carpStore.openCursor();
                carpCur.onsuccess = ev2 => {
                  const c2 = ev2.target.result;
                  if (!c2) return;
                  if (c2.value.pdfs === undefined) {
                    c2.update({ ...c2.value, pdfs: assignments[c2.value.nombre] || [] });
                  }
                  c2.continue();
                };
              }
            };
          }
        };

        r.onsuccess = e => ok(e.target.result);
        r.onerror   = () => fail(r.error);
      });
    }

    /* ── PDFs ── */
    async function getAllPDFs() {
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

    async function savePDF(nombre, buffer, size) {
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

    /* Elimina PDF de biblioteca y de todas las carpetas */
    async function deletePDF(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx        = db.transaction(['meta', 'data', 'carpetas'], 'readwrite');
        tx.objectStore('meta').delete(nombre);
        tx.objectStore('data').delete(nombre);
        const carpCur = tx.objectStore('carpetas').openCursor();
        carpCur.onsuccess = e => {
          const c = e.target.result;
          if (!c) return;
          const rec = c.value;
          if (rec.pdfs?.includes(nombre)) {
            c.update({ ...rec, pdfs: rec.pdfs.filter(n => n !== nombre) });
          }
          c.continue();
        };
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      });
    }

    /* ── Carpetas ── */
    async function getAllCarpetas() {
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
                      .put({ nombre, creadaEl: Date.now(), pdfs: [] });
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }

    async function deleteCarpeta(nombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('carpetas', 'readwrite')
                      .objectStore('carpetas').delete(nombre);
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }

    /* Agrega PDFs a una carpeta (ignora duplicados) */
    async function addPDFsToCarpeta(carpetaNombre, pdfsNombres) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx    = db.transaction('carpetas', 'readwrite');
        const store = tx.objectStore('carpetas');
        const req   = store.get(carpetaNombre);
        req.onsuccess = () => {
          const rec    = req.result;
          if (!rec) return;
          const set    = new Set(rec.pdfs);
          pdfsNombres.forEach(n => set.add(n));
          store.put({ ...rec, pdfs: [...set] });
        };
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      });
    }

    /* Quita un PDF de una carpeta */
    async function removePDFFromCarpeta(carpetaNombre, pdfNombre) {
      const db = await open();
      return new Promise((ok, fail) => {
        const tx    = db.transaction('carpetas', 'readwrite');
        const store = tx.objectStore('carpetas');
        const req   = store.get(carpetaNombre);
        req.onsuccess = () => {
          const rec = req.result;
          if (!rec) return;
          store.put({ ...rec, pdfs: rec.pdfs.filter(n => n !== pdfNombre) });
        };
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      });
    }

    return {
      getAllPDFs, getData, getCount, savePDF, deletePDF,
      getAllCarpetas, saveCarpeta, deleteCarpeta, addPDFsToCarpeta, removePDFFromCarpeta,
    };
  })();

  /* ════════════════════════════════════════════════
     PDF.JS
  ════════════════════════════════════════════════ */
  function loadPDFJS() {
    return new Promise((ok, fail) => {
      if (window.pdfjsLib) { ok(window.pdfjsLib); return; }
      const s = document.createElement('script');
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
  const esc     = s => String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  /* ════════════════════════════════════════════════
     STATE
  ════════════════════════════════════════════════ */
  let allPDFs     = [];   // [{nombre, size, cargadoEl}]
  let allCarpetas = [];   // [{nombre, creadaEl, pdfs:[]}]
  let currFolder  = null; // null = hub | objeto carpeta | 'biblioteca'
  let selMode     = false;
  let selected    = new Set();
  let query       = '';
  let searchVisible = false;
  let debT        = null;
  let pdfDoc      = null;

  /* ════════════════════════════════════════════════
     COMPARTIR
  ════════════════════════════════════════════════ */
  async function compartirPDFs(nombres) {
    if (!nombres.length) return;
    try {
      const files = await Promise.all(nombres.map(async n => {
        const rec = await DB.getData(n);
        return new File([rec.buffer], n, { type: 'application/pdf' });
      }));
      if (navigator.canShare?.({ files })) {
        await navigator.share({
          files,
          title: files.length === 1 ? files[0].name : `${files.length} documentos PDF`,
        });
      } else {
        for (const f of files) {
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
     FOLDER PICKER — bottom sheet
     Usado desde biblioteca para agregar un PDF a una carpeta.
  ════════════════════════════════════════════════ */
  function mostrarFolderPicker(pdfNombres, cb) {
    document.getElementById('pv-sheet')?.remove();

    if (!allCarpetas.length) {
      alert('Creá al menos una carpeta primero.'); return;
    }

    const sheet = document.createElement('div');
    sheet.id        = 'pv-sheet';
    sheet.className = 'pv-sheet-overlay';

    const items = [...allCarpetas]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => `
        <button class="pv-sheet-item" data-val="${esc(c.nombre)}">
          <span class="pv-sheet-item-icon">📁</span>${esc(c.nombre)}
        </button>`).join('');

    sheet.innerHTML = `
      <div class="pv-sheet-box">
        <div class="pv-sheet-hdr">Agregar a carpeta</div>
        ${items}
        <button class="pv-sheet-cancel">Cancelar</button>
      </div>`;

    document.body.appendChild(sheet);

    sheet.addEventListener('click', e => {
      if (e.target === sheet || e.target.classList.contains('pv-sheet-cancel')) {
        sheet.remove(); return;
      }
      const btn = e.target.closest('.pv-sheet-item');
      if (btn) { sheet.remove(); cb(btn.dataset.val); }
    });
  }

  /* ════════════════════════════════════════════════
     LIBRARY PICKER — overlay pantalla completa
     Usado desde una carpeta para agregar PDFs de la biblioteca.
  ════════════════════════════════════════════════ */
  function mostrarLibraryPicker(carpetaObj) {
    document.getElementById('pv-lib-picker')?.remove();

    const enCarpeta = new Set(carpetaObj.pdfs);
    const sorted    = [...allPDFs].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const picking   = new Set();

    const overlay = document.createElement('div');
    overlay.id        = 'pv-lib-picker';
    overlay.className = 'pv-lib-picker';

    function html() {
      if (!sorted.length) {
        return `<div class="pv-empty">
          <span class="pv-empty-icon">📄</span>
          <span>La biblioteca está vacía.</span></div>`;
      }
      return sorted.map(p => {
        const ya  = enCarpeta.has(p.nombre);
        const sel = picking.has(p.nombre);
        return `
          <div class="pv-pick-item${ya ? ' ya' : sel ? ' sel' : ''}"
               data-nombre="${esc(p.nombre)}" data-ya="${ya}">
            <div class="pv-pick-check${ya ? ' ya' : sel ? ' sel' : ''}">
              ${ya ? '✓' : sel ? '✓' : ''}
            </div>
            <div class="pv-pick-info">
              <div class="pv-pick-nombre">${esc(p.nombre)}</div>
              <div class="pv-pick-meta">${fmtSize(p.size)}${ya ? ' · ya incluido' : ''}</div>
            </div>
          </div>`;
      }).join('');
    }

    function refreshBtn() {
      const btn = overlay.querySelector('.pv-pick-confirm');
      if (btn) btn.textContent = picking.size
        ? `Agregar ${picking.size} documento${picking.size > 1 ? 's' : ''} ›`
        : 'Agregar ›';
      if (btn) btn.disabled = picking.size === 0;
    }

    overlay.innerHTML = `
      <div class="pv-lib-picker-view">
        <div class="pv-topbar">
          <button class="pv-back" id="pv-pick-cancel">&#8249;</button>
          <div class="pv-titles">
            <div class="pv-title">Agregar a <em>${esc(carpetaObj.nombre)}</em></div>
          </div>
        </div>
        <div class="pv-scroll" id="pv-pick-list">${html()}</div>
        <div class="pv-sel-bar">
          <button class="pv-sel-btn primary pv-pick-confirm" disabled>Agregar ›</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    overlay.querySelector('#pv-pick-cancel').addEventListener('click', () => overlay.remove());

    overlay.querySelector('#pv-pick-list').addEventListener('click', e => {
      const item = e.target.closest('.pv-pick-item');
      if (!item || item.dataset.ya === 'true') return;
      const nombre = item.dataset.nombre;
      picking.has(nombre) ? picking.delete(nombre) : picking.add(nombre);
      overlay.querySelector('#pv-pick-list').innerHTML = html();
      refreshBtn();
    });

    overlay.querySelector('.pv-pick-confirm').addEventListener('click', async () => {
      if (!picking.size) return;
      const arr = [...picking];
      await DB.addPDFsToCarpeta(carpetaObj.nombre, arr);
      arr.forEach(n => { if (!carpetaObj.pdfs.includes(n)) carpetaObj.pdfs.push(n); });
      overlay.remove();
      dibujarCarpeta();
    });
  }

  /* ════════════════════════════════════════════════
     BARRA DE SELECCIÓN
  ════════════════════════════════════════════════ */
  function actualizarSelBar() {
    const bar     = document.getElementById('pv-sel-bar');
    const countEl = document.getElementById('pv-sel-count');
    if (!bar) return;

    bar.style.display = selMode ? 'flex' : 'none';
    if (!selMode) return;

    const n = selected.size;
    if (countEl) countEl.textContent = `${n} seleccionado${n !== 1 ? 's' : ''}`;

    const shareBtn = document.getElementById('pv-sel-share');
    const addBtn   = document.getElementById('pv-sel-add');
    if (shareBtn)  shareBtn.disabled = n === 0;
    if (addBtn)    addBtn.disabled   = n === 0;
  }

  /* ════════════════════════════════════════════════
     HUB VIEW
  ════════════════════════════════════════════════ */
  const VIEW_HUB = `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title">Documentos PDF</div></div>
    <button class="pv-icon-btn" id="pv-search-toggle" aria-label="Buscar">🔍</button>
    <button class="pv-icon-btn" id="pv-new-folder" aria-label="Nueva carpeta">📁+</button>
  </div>
  <div class="pv-search-row" id="pv-search-row" style="display:none">
    <input class="pv-search-input" id="pv-search-input"
           type="text" inputmode="search" placeholder="Buscar carpeta o documento…" autocomplete="off">
    <button class="pv-search-clear" id="pv-search-clear">✕</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
</div>`;

  function dibujarHub() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll) return;

    const q = query.toLowerCase();

    if (q) {
      /* Modo búsqueda: carpetas + PDFs que coincidan */
      const matchCarp = allCarpetas.filter(c => c.nombre.toLowerCase().includes(q))
                                   .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      const matchPDFs = allPDFs.filter(p => p.nombre.toLowerCase().includes(q))
                                .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

      if (!matchCarp.length && !matchPDFs.length) {
        scroll.innerHTML = `<div class="pv-empty">
          <span class="pv-empty-icon">🔍</span><span>Sin coincidencias.</span></div>`;
        return;
      }

      let html = '';
      if (matchCarp.length) {
        html += `<div class="pv-section-hdr">Carpetas</div>`;
        html += matchCarp.map(c => hubCardHTML(c)).join('');
      }
      if (matchPDFs.length) {
        html += `<div class="pv-section-hdr">Documentos</div>`;
        html += matchPDFs.map(p => `
          <div class="pv-item pv-item-search" data-nombre="${esc(p.nombre)}">
            <div class="pv-item-icon">📄</div>
            <div class="pv-item-info">
              <div class="pv-item-nombre">${esc(p.nombre)}</div>
              <div class="pv-item-meta">${fmtSize(p.size)}</div>
            </div>
          </div>`).join('');
      }
      scroll.innerHTML = html;
      return;
    }

    /* Vista normal */
    const sorted = [...allCarpetas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    let html = hubBibliotecaCard();

    if (sorted.length) {
      html += `<div class="pv-section-hdr">Carpetas</div>`;
      html += sorted.map(c => hubCardHTML(c)).join('');
    } else {
      html += `<div class="pv-empty-small">Sin carpetas. Usá 📁+ para crear una.</div>`;
    }

    scroll.innerHTML = html;
  }

  function hubBibliotecaCard() {
    const n = allPDFs.length;
    return `
      <div class="pv-hub-card biblioteca" id="pv-hub-biblio">
        <div class="pv-hub-icon">📚</div>
        <div class="pv-hub-info">
          <div class="pv-hub-name">Biblioteca</div>
          <div class="pv-hub-count">${n} documento${n !== 1 ? 's' : ''}</div>
        </div>
        <div class="pv-hub-arrow">›</div>
      </div>`;
  }

  function hubCardHTML(c) {
    const n = c.pdfs.length;
    return `
      <div class="pv-hub-card" data-carpeta="${esc(c.nombre)}">
        <div class="pv-hub-icon">📁</div>
        <div class="pv-hub-info">
          <div class="pv-hub-name">${esc(c.nombre)}</div>
          <div class="pv-hub-count">${n} documento${n !== 1 ? 's' : ''}</div>
        </div>
        <button class="pv-hub-act share" data-carpeta="${esc(c.nombre)}" aria-label="Compartir">🔗</button>
        <button class="pv-hub-act del"   data-carpeta="${esc(c.nombre)}" aria-label="Eliminar">🗑</button>
        <div class="pv-hub-arrow">›</div>
      </div>`;
  }

  function initHub() {
    document.getElementById('pv-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    document.getElementById('pv-new-folder')
      ?.addEventListener('click', async () => {
        const nombre = prompt('Nombre de la carpeta:')?.trim();
        if (!nombre) return;
        if (allCarpetas.some(c => c.nombre === nombre)) {
          alert('Ya existe una carpeta con ese nombre.'); return;
        }
        const nueva = { nombre, creadaEl: Date.now(), pdfs: [] };
        await DB.saveCarpeta(nombre);
        allCarpetas.push(nueva);
        dibujarHub();
      });

    document.getElementById('pv-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('pv-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('pv-search-input')?.focus();
        else { query = ''; document.getElementById('pv-search-input').value = ''; dibujarHub(); }
      });

    document.getElementById('pv-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarHub(); }, 150);
      });

    document.getElementById('pv-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('pv-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarHub();
      });

    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        /* Compartir carpeta */
        const shareBtn = e.target.closest('.pv-hub-act.share');
        if (shareBtn) {
          const c = allCarpetas.find(x => x.nombre === shareBtn.dataset.carpeta);
          if (c) await compartirPDFs(c.pdfs);
          return;
        }
        /* Eliminar carpeta */
        const delBtn = e.target.closest('.pv-hub-act.del');
        if (delBtn) {
          const nombre = delBtn.dataset.carpeta;
          if (!confirm(`¿Eliminar la carpeta "${nombre}"?\nLos documentos quedan en la Biblioteca.`)) return;
          await DB.deleteCarpeta(nombre);
          allCarpetas = allCarpetas.filter(c => c.nombre !== nombre);
          if (currFolder?.nombre === nombre) currFolder = null;
          dibujarHub(); return;
        }
        /* Abrir biblioteca */
        if (e.target.closest('#pv-hub-biblio')) {
          await renderBiblioteca(); return;
        }
        /* Abrir carpeta */
        const card = e.target.closest('.pv-hub-card[data-carpeta]');
        if (card) {
          const c = allCarpetas.find(x => x.nombre === card.dataset.carpeta);
          if (c) await renderCarpeta(c);
          return;
        }
        /* Abrir PDF desde búsqueda */
        const item = e.target.closest('.pv-item-search');
        if (item) await abrirVisor(item.dataset.nombre);
      });
  }

  /* ════════════════════════════════════════════════
     BIBLIOTECA VIEW
  ════════════════════════════════════════════════ */
  const VIEW_BIBLIOTECA = `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title">Biblioteca</div></div>
    <button class="pv-icon-btn" id="pv-search-toggle" aria-label="Buscar">🔍</button>
    <button class="pv-icon-btn" id="pv-sel-toggle" aria-label="Seleccionar">☑</button>
  </div>
  <div class="pv-search-row" id="pv-search-row" style="display:none">
    <input class="pv-search-input" id="pv-search-input"
           type="text" inputmode="search" placeholder="Buscar documento…" autocomplete="off">
    <button class="pv-search-clear" id="pv-search-clear">✕</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
  <div class="pv-sel-bar" id="pv-sel-bar" style="display:none">
    <span class="pv-sel-count" id="pv-sel-count">0 seleccionados</span>
    <button class="pv-sel-btn" id="pv-sel-add">Agregar a carpeta ›</button>
    <button class="pv-sel-btn primary" id="pv-sel-share">Compartir ›</button>
  </div>
</div>`;

  function dibujarBiblioteca() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll) return;

    const q = query.toLowerCase();
    const list = allPDFs
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    if (!list.length) {
      scroll.innerHTML = q
        ? `<div class="pv-empty"><span class="pv-empty-icon">🔍</span><span>Sin coincidencias.</span></div>`
        : `<div class="pv-empty"><span class="pv-empty-icon">📄</span>
            <span>Sin documentos. Cargá PDFs desde <strong>Configuración</strong>.</span></div>`;
      return;
    }

    scroll.innerHTML = list.map(p => {
      const sel = selected.has(p.nombre);
      const chk = selMode
        ? `<div class="pv-item-check${sel ? ' checked' : ''}"></div>` : '';
      const acts = !selMode
        ? `<button class="pv-item-add" data-nombre="${esc(p.nombre)}" aria-label="Agregar a carpeta">📁+</button>
           <button class="pv-item-del" data-nombre="${esc(p.nombre)}" aria-label="Eliminar">🗑</button>`
        : '';
      return `
        <div class="pv-item${sel ? ' pv-item-sel' : ''}" data-nombre="${esc(p.nombre)}">
          ${chk}
          <div class="pv-item-icon">📄</div>
          <div class="pv-item-info">
            <div class="pv-item-nombre">${esc(p.nombre)}</div>
            <div class="pv-item-meta">${fmtSize(p.size)}</div>
          </div>
          ${acts}
        </div>`;
    }).join('');

    actualizarSelBar();
  }

  async function renderBiblioteca() {
    currFolder    = 'biblioteca';
    selMode       = false;
    selected.clear();
    query         = '';
    searchVisible = false;

    document.getElementById('app').innerHTML = VIEW_BIBLIOTECA;

    document.getElementById('pv-back')
      ?.addEventListener('click', () => { currFolder = null; render(); });

    document.getElementById('pv-sel-toggle')
      ?.addEventListener('click', () => { selMode = !selMode; selected.clear(); dibujarBiblioteca(); });

    document.getElementById('pv-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('pv-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('pv-search-input')?.focus();
        else { query = ''; document.getElementById('pv-search-input').value = ''; dibujarBiblioteca(); }
      });

    document.getElementById('pv-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarBiblioteca(); }, 150);
      });

    document.getElementById('pv-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('pv-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarBiblioteca();
      });

    document.getElementById('pv-sel-share')
      ?.addEventListener('click', () => compartirPDFs([...selected]));

    document.getElementById('pv-sel-add')
      ?.addEventListener('click', () => {
        if (!selected.size) return;
        mostrarFolderPicker([...selected], async carpetaNombre => {
          await DB.addPDFsToCarpeta(carpetaNombre, [...selected]);
          const c = allCarpetas.find(x => x.nombre === carpetaNombre);
          if (c) [...selected].forEach(n => { if (!c.pdfs.includes(n)) c.pdfs.push(n); });
          selected.clear(); selMode = false; dibujarBiblioteca();
        });
      });

    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        /* Agregar a carpeta */
        const addBtn = e.target.closest('.pv-item-add');
        if (addBtn) {
          const nombre = addBtn.dataset.nombre;
          mostrarFolderPicker([nombre], async carpetaNombre => {
            await DB.addPDFsToCarpeta(carpetaNombre, [nombre]);
            const c = allCarpetas.find(x => x.nombre === carpetaNombre);
            if (c && !c.pdfs.includes(nombre)) c.pdfs.push(nombre);
          });
          return;
        }
        /* Eliminar de biblioteca */
        const delBtn = e.target.closest('.pv-item-del');
        if (delBtn) {
          const nombre = delBtn.dataset.nombre;
          if (!confirm(`¿Eliminar "${nombre}" de la biblioteca?\nSe quitará de todas las carpetas.`)) return;
          const el = document.querySelector(`.pv-item[data-nombre="${CSS.escape(nombre)}"]`);
          if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }
          await DB.deletePDF(nombre);
          allPDFs = allPDFs.filter(p => p.nombre !== nombre);
          allCarpetas.forEach(c => { c.pdfs = c.pdfs.filter(n => n !== nombre); });
          selected.delete(nombre);
          setTimeout(() => dibujarBiblioteca(), 200);
          return;
        }
        /* Seleccionar / abrir */
        const item = e.target.closest('.pv-item');
        if (!item) return;
        const nombre = item.dataset.nombre;
        if (selMode) {
          selected.has(nombre) ? selected.delete(nombre) : selected.add(nombre);
          dibujarBiblioteca();
        } else {
          await abrirVisor(nombre);
        }
      });

    dibujarBiblioteca();
  }

  /* ════════════════════════════════════════════════
     CARPETA VIEW
  ════════════════════════════════════════════════ */
  function buildCarpetaView(nombre) {
    return `
<div class="pv-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title">${esc(nombre)}</div></div>
    <button class="pv-icon-btn" id="pv-search-toggle" aria-label="Buscar">🔍</button>
    <button class="pv-icon-btn" id="pv-sel-toggle" aria-label="Seleccionar">☑</button>
    <button class="pv-icon-btn" id="pv-share-all" aria-label="Compartir todo">🔗</button>
  </div>
  <div class="pv-search-row" id="pv-search-row" style="display:none">
    <input class="pv-search-input" id="pv-search-input"
           type="text" inputmode="search" placeholder="Buscar documento…" autocomplete="off">
    <button class="pv-search-clear" id="pv-search-clear">✕</button>
  </div>
  <div class="pv-scroll" id="pv-scroll"></div>
  <div class="pv-sel-bar" id="pv-sel-bar" style="display:none">
    <span class="pv-sel-count" id="pv-sel-count">0 seleccionados</span>
    <button class="pv-sel-btn" id="pv-sel-quitar">Quitar ›</button>
    <button class="pv-sel-btn primary" id="pv-sel-share">Compartir ›</button>
  </div>
</div>`;
  }

  function dibujarCarpeta() {
    const scroll = document.getElementById('pv-scroll');
    if (!scroll || !currFolder || currFolder === 'biblioteca') return;

    const c = currFolder;
    const q = query.toLowerCase();

    /* PDFs de la carpeta, resolviendo metadata desde allPDFs */
    const pdfsEnCarpeta = c.pdfs
      .map(nombre => allPDFs.find(p => p.nombre === nombre))
      .filter(Boolean)
      .filter(p => !q || p.nombre.toLowerCase().includes(q))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    if (!pdfsEnCarpeta.length) {
      const msg = q
        ? `<div class="pv-empty"><span class="pv-empty-icon">🔍</span><span>Sin coincidencias.</span></div>`
        : `<div class="pv-empty"><span class="pv-empty-icon">📂</span>
            <span>Carpeta vacía.<br>Usá el botón 📚 para agregar documentos.</span></div>`;
      scroll.innerHTML = msg + (q ? '' : `
        <div class="pv-add-row">
          <button class="pv-add-btn" id="pv-agregar-btn">📚 Agregar de biblioteca</button>
        </div>`);
    } else {
      scroll.innerHTML = pdfsEnCarpeta.map(p => {
        const sel = selected.has(p.nombre);
        const chk = selMode
          ? `<div class="pv-item-check${sel ? ' checked' : ''}"></div>` : '';
        const acts = !selMode
          ? `<button class="pv-item-quitar" data-nombre="${esc(p.nombre)}" aria-label="Quitar de carpeta">✕</button>`
          : '';
        return `
          <div class="pv-item${sel ? ' pv-item-sel' : ''}" data-nombre="${esc(p.nombre)}">
            ${chk}
            <div class="pv-item-icon">📄</div>
            <div class="pv-item-info">
              <div class="pv-item-nombre">${esc(p.nombre)}</div>
              <div class="pv-item-meta">${fmtSize(p.size)}</div>
            </div>
            ${acts}
          </div>`;
      }).join('') + (!q ? `
        <div class="pv-add-row">
          <button class="pv-add-btn" id="pv-agregar-btn">📚 Agregar de biblioteca</button>
        </div>` : '');
    }

    actualizarSelBar();

    document.getElementById('pv-agregar-btn')
      ?.addEventListener('click', () => mostrarLibraryPicker(c));
  }

  async function renderCarpeta(carpetaObj) {
    currFolder    = carpetaObj;
    selMode       = false;
    selected.clear();
    query         = '';
    searchVisible = false;

    document.getElementById('app').innerHTML = buildCarpetaView(carpetaObj.nombre);

    document.getElementById('pv-back')
      ?.addEventListener('click', () => { currFolder = null; render(); });

    document.getElementById('pv-share-all')
      ?.addEventListener('click', () => compartirPDFs(carpetaObj.pdfs));

    document.getElementById('pv-sel-toggle')
      ?.addEventListener('click', () => { selMode = !selMode; selected.clear(); dibujarCarpeta(); });

    document.getElementById('pv-search-toggle')
      ?.addEventListener('click', () => {
        searchVisible = !searchVisible;
        const row = document.getElementById('pv-search-row');
        if (row) row.style.display = searchVisible ? 'flex' : 'none';
        if (searchVisible) document.getElementById('pv-search-input')?.focus();
        else { query = ''; document.getElementById('pv-search-input').value = ''; dibujarCarpeta(); }
      });

    document.getElementById('pv-search-input')
      ?.addEventListener('input', e => {
        clearTimeout(debT);
        debT = setTimeout(() => { query = e.target.value.trim(); dibujarCarpeta(); }, 150);
      });

    document.getElementById('pv-search-clear')
      ?.addEventListener('click', () => {
        query = '';
        const inp = document.getElementById('pv-search-input');
        if (inp) { inp.value = ''; inp.focus(); }
        dibujarCarpeta();
      });

    document.getElementById('pv-sel-share')
      ?.addEventListener('click', () => compartirPDFs([...selected]));

    document.getElementById('pv-sel-quitar')
      ?.addEventListener('click', async () => {
        for (const nombre of selected) {
          await DB.removePDFFromCarpeta(carpetaObj.nombre, nombre);
          carpetaObj.pdfs = carpetaObj.pdfs.filter(n => n !== nombre);
        }
        selected.clear(); selMode = false; dibujarCarpeta();
      });

    document.getElementById('pv-scroll')
      ?.addEventListener('click', async e => {
        const quitarBtn = e.target.closest('.pv-item-quitar');
        if (quitarBtn) {
          const nombre = quitarBtn.dataset.nombre;
          await DB.removePDFFromCarpeta(carpetaObj.nombre, nombre);
          carpetaObj.pdfs = carpetaObj.pdfs.filter(n => n !== nombre);
          dibujarCarpeta(); return;
        }
        const item = e.target.closest('.pv-item');
        if (!item) return;
        const nombre = item.dataset.nombre;
        if (selMode) {
          selected.has(nombre) ? selected.delete(nombre) : selected.add(nombre);
          dibujarCarpeta();
        } else {
          await abrirVisor(nombre);
        }
      });

    dibujarCarpeta();
  }

  /* ════════════════════════════════════════════════
     VISOR PDF
  ════════════════════════════════════════════════ */
  function buildVisorView(nombre) {
    return `
<div class="pv-view pv-visor-view">
  <div class="pv-topbar">
    <button class="pv-back" id="pv-visor-back">&#8249;</button>
    <div class="pv-titles"><div class="pv-title pv-visor-title">${esc(nombre)}</div></div>
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
        if (currFolder === 'biblioteca') renderBiblioteca();
        else if (currFolder)             renderCarpeta(currFolder);
        else                             render();
      });

    document.getElementById('pv-share-btn')
      ?.addEventListener('click', () => compartirPDFs([nombre]));

    const indicator = document.getElementById('pv-page-indicator');
    const container = document.getElementById('pv-visor-scroll');

    try {
      const [pdfjsLib, record] = await Promise.all([loadPDFJS(), DB.getData(nombre)]);
      if (!record) throw new Error('PDF no encontrado.');

      pdfDoc     = await pdfjsLib.getDocument({ data: new Uint8Array(record.buffer) }).promise;
      const total = pdfDoc.numPages;
      if (indicator) indicator.textContent = `Página 1 / ${total}`;

      const pageEls = [];
      for (let i = 1; i <= total; i++) {
        const div = document.createElement('div');
        div.className = 'pv-page'; div.dataset.page = String(i);
        container.appendChild(div); pageEls.push(div);
      }

      const io = new IntersectionObserver(entries => {
        let maxR = 0, cur = 1;
        entries.forEach(en => {
          if (en.intersectionRatio > maxR) { maxR = en.intersectionRatio; cur = +en.target.dataset.page; }
        });
        if (indicator) indicator.textContent = `Página ${cur} / ${total}`;
      }, { root: container, threshold: [0,.25,.5,.75,1] });
      pageEls.forEach(el => io.observe(el));

      const rw  = container.clientWidth || window.screen.width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      for (let i = 1; i <= total; i++) {
        if (!pdfDoc) break;
        try {
          const page = await pdfDoc.getPage(i);
          const sc   = rw / page.getViewport({ scale: 1 }).width;
          const vp   = page.getViewport({ scale: sc * dpr });
          const cv   = document.createElement('canvas');
          cv.width  = Math.floor(vp.width);  cv.height  = Math.floor(vp.height);
          cv.style.width  = `${Math.floor(vp.width  / dpr)}px`;
          cv.style.height = `${Math.floor(vp.height / dpr)}px`;
          await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
          page.cleanup();
          if (!pdfDoc) break;
          const pd = pageEls[i-1];
          if (pd) { pd.innerHTML = ''; pd.appendChild(cv); pd.style.height = ''; }
        } catch (er) { if (pdfDoc) console.warn(`[PDF] pág ${i}:`, er); }
      }
    } catch (err) {
      if (indicator) indicator.textContent = '';
      if (container) container.innerHTML = `<div class="pv-empty">
        <span class="pv-empty-icon">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
  }

  /* ════════════════════════════════════════════════
     API PÚBLICA
  ════════════════════════════════════════════════ */
  async function cargarPDF(file) {
    const buffer = await file.arrayBuffer();
    await DB.savePDF(file.name, buffer, file.size);
    const meta = { nombre: file.name, size: file.size, cargadoEl: Date.now() };
    const idx  = allPDFs.findIndex(p => p.nombre === file.name);
    if (idx >= 0) allPDFs[idx] = meta; else allPDFs.push(meta);
    return meta;
  }

  async function getCount() { return DB.getCount(); }

  function render() {
    query = ''; searchVisible = false; clearTimeout(debT);
    currFolder = null; selMode = false; selected.clear();
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }

    document.getElementById('app').innerHTML = VIEW_HUB;

    Promise.all([DB.getAllPDFs(), DB.getAllCarpetas()])
      .then(([pdfs, carpetas]) => { allPDFs = pdfs; allCarpetas = carpetas; dibujarHub(); initHub(); })
      .catch(console.error);
  }

  return { render, cargarPDF, getCount };
})();
