const Backup = (() => {
  'use strict';

  const FORMAT_VERSION = 1;
  const APP_ID         = 'BCO_CONSULTA';
  const JSZIP_CDN      = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  /* ── JSZip dinámico ── */
  function loadJSZip() {
    return new Promise((ok, fail) => {
      if (window.JSZip) { ok(window.JSZip); return; }
      const s = document.createElement('script');
      s.src     = JSZIP_CDN;
      s.onload  = () => ok(window.JSZip);
      s.onerror = () => fail(new Error('No se pudo cargar JSZip. Verificá tu conexión.'));
      document.head.appendChild(s);
    });
  }

  /* ════════════════════════════════════════════════
     IDB HELPERS GENÉRICOS
  ════════════════════════════════════════════════ */
  function idbOpenRead(name, version) {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = () => {};       /* no crear stores — sólo leer */
      r.onsuccess = e => ok(e.target.result);
      r.onerror   = () => fail(r.error);
    });
  }

  /* Abre (o crea) una DB con el schema completo — usado en restauración */
  function idbOpenSchema(name, version, stores) {
    return new Promise((ok, fail) => {
      const r = indexedDB.open(name, version);
      r.onupgradeneeded = e => {
        const db = e.target.result;
        stores.forEach(({ storeName, keyPath }) => {
          if (!db.objectStoreNames.contains(storeName))
            db.createObjectStore(storeName, { keyPath });
        });
      };
      r.onsuccess = e => ok(e.target.result);
      r.onerror   = () => fail(r.error);
    });
  }

  function idbGetAll(db, storeName) {
    return new Promise(ok => {
      try {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
        req.onsuccess = () => ok(req.result ?? []);
        req.onerror   = () => ok([]);
      } catch { ok([]); }
    });
  }

  function idbClearAndFill(db, storeName, records) {
    return new Promise((ok, fail) => {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        const st = tx.objectStore(storeName);
        st.clear();
        records.forEach(r => st.put(r));
        tx.oncomplete = () => ok();
        tx.onerror    = () => fail(tx.error);
      } catch (e) { fail(e); }
    });
  }

  /* ════════════════════════════════════════════════
     BASE64 ↔ ARRAYBUFFER
  ════════════════════════════════════════════════ */
  function bufToB64(buffer) {
    const bytes = new Uint8Array(buffer);
    let str = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK)
      str += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    return btoa(str);
  }

  function b64ToBuf(b64) {
    const str = atob(b64);
    const buf = new ArrayBuffer(str.length);
    const u8  = new Uint8Array(buf);
    for (let i = 0; i < str.length; i++) u8[i] = str.charCodeAt(i);
    return buf;
  }

  /* ════════════════════════════════════════════════
     EXPORTAR
  ════════════════════════════════════════════════ */
  async function exportar() {
    const JSZip = await loadJSZip();

    /* localStorage */
    const lsKeys = ['cosoop_uva']; /* cosoop_pin_hash excluido intencionalmente */
    const lsData = {};
    lsKeys.forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) lsData[k] = v;
    });

    /* cosoop_tasas */
    const dbTasas = await idbOpenRead('cosoop_tasas', 1).catch(() => null);
    const tabla = dbTasas ? await idbGetAll(dbTasas, 'tabla') : [];
    dbTasas?.close();

    /* cosoop_be */
    const dbBE = await idbOpenRead('cosoop_be', 1).catch(() => null);
    const beArchivo   = dbBE ? await idbGetAll(dbBE, 'archivo')   : [];
    const beFavoritos = dbBE ? await idbGetAll(dbBE, 'favoritos') : [];
    dbBE?.close();

    /* cosoop_bp */
    const dbBP = await idbOpenRead('cosoop_bp', 1).catch(() => null);
    const bpArchivo   = dbBP ? await idbGetAll(dbBP, 'archivo')   : [];
    const bpFavoritos = dbBP ? await idbGetAll(dbBP, 'favoritos') : [];
    dbBP?.close();

    /* cosoop_hip_uva */
    const dbHUVA = await idbOpenRead('cosoop_hip_uva', 1).catch(() => null);
    const huvaTasas = dbHUVA ? await idbGetAll(dbHUVA, 'tasas') : [];
    dbHUVA?.close();

    /* cosoop_pdf */
    const dbPDF = await idbOpenRead('cosoop_pdf', 3).catch(() => null);
    const pdfMeta     = dbPDF ? await idbGetAll(dbPDF, 'meta')     : [];
    const pdfDataRaw  = dbPDF ? await idbGetAll(dbPDF, 'data')     : [];
    const pdfCarpetas = dbPDF ? await idbGetAll(dbPDF, 'carpetas') : [];
    dbPDF?.close();

    /* ArrayBuffer → base64 */
    const pdfData = pdfDataRaw.map(r => ({
      nombre:     r.nombre,
      buffer_b64: bufToB64(r.buffer),
    }));

    const payload = {
      version:      FORMAT_VERSION,
      app:          APP_ID,
      exportadoEl:  Date.now(),
      localStorage: lsData,
      idb: {
        cosoop_tasas:   { tabla },
        cosoop_be:      { archivo: beArchivo,   favoritos: beFavoritos },
        cosoop_bp:      { archivo: bpArchivo,   favoritos: bpFavoritos },
        cosoop_hip_uva: { tasas:  huvaTasas },
        cosoop_pdf:     { meta:   pdfMeta, data: pdfData, carpetas: pdfCarpetas },
      },
    };

    /* Comprimir */
    const zip  = new JSZip();
    zip.file('backup.json', JSON.stringify(payload));
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    /* Nombre de archivo */
    const ds     = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const nombre = `BCO_CONSULTA_backup_${ds}.zip`;
    const zipFile = new File([blob], nombre, { type: 'application/zip' });

    /* Compartir / descargar */
    if (navigator.canShare?.({ files: [zipFile] })) {
      await navigator.share({ files: [zipFile], title: nombre });
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  /* ════════════════════════════════════════════════
     RESTAURAR
  ════════════════════════════════════════════════ */
  async function restaurar(file) {
    const JSZip = await loadJSZip();

    /* ── Descomprimir ── */
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch {
      throw new Error('El archivo no es un ZIP válido.');
    }

    const jsonEntry = zip.file('backup.json');
    if (!jsonEntry) throw new Error('El ZIP no contiene backup.json — no es un backup de esta app.');

    let payload;
    try {
      payload = JSON.parse(await jsonEntry.async('string'));
    } catch {
      throw new Error('El backup.json está corrupto o no se puede leer.');
    }

    /* ── Validar estructura — NUNCA restaurar parcialmente ── */
    if (payload.app !== APP_ID)
      throw new Error(`Backup de otra aplicación ("${payload.app}"). No se realizaron cambios.`);
    if (payload.version !== FORMAT_VERSION)
      throw new Error(`Versión de backup incompatible (v${payload.version}). No se realizaron cambios.`);
    if (!payload.idb || typeof payload.idb !== 'object')
      throw new Error('Estructura de backup inválida. No se realizaron cambios.');

    /* ── Escribir — a partir de aquí todo debe tener éxito ── */
    const idb = payload.idb;
    const ls  = payload.localStorage ?? {};

    /* localStorage — cosoop_pin_hash nunca se toca (ni escribe ni borra) */
    ['cosoop_uva'].forEach(k => {
      if (k in ls) localStorage.setItem(k, ls[k]);
      else         localStorage.removeItem(k);
    });

    /* cosoop_tasas */
    const dbTasas = await idbOpenSchema('cosoop_tasas', 1, [
      { storeName: 'tabla', keyPath: 'id' },
    ]);
    await idbClearAndFill(dbTasas, 'tabla', idb.cosoop_tasas?.tabla ?? []);
    dbTasas.close();

    /* cosoop_be */
    const dbBE = await idbOpenSchema('cosoop_be', 1, [
      { storeName: 'archivo',   keyPath: 'id' },
      { storeName: 'favoritos', keyPath: 'id' },
    ]);
    await idbClearAndFill(dbBE, 'archivo',   idb.cosoop_be?.archivo   ?? []);
    await idbClearAndFill(dbBE, 'favoritos', idb.cosoop_be?.favoritos ?? []);
    dbBE.close();

    /* cosoop_bp */
    const dbBP = await idbOpenSchema('cosoop_bp', 1, [
      { storeName: 'archivo',   keyPath: 'id' },
      { storeName: 'favoritos', keyPath: 'id' },
    ]);
    await idbClearAndFill(dbBP, 'archivo',   idb.cosoop_bp?.archivo   ?? []);
    await idbClearAndFill(dbBP, 'favoritos', idb.cosoop_bp?.favoritos ?? []);
    dbBP.close();

    /* cosoop_hip_uva */
    const dbHUVA = await idbOpenSchema('cosoop_hip_uva', 1, [
      { storeName: 'tasas', keyPath: 'id' },
    ]);
    await idbClearAndFill(dbHUVA, 'tasas', idb.cosoop_hip_uva?.tasas ?? []);
    dbHUVA.close();

    /* cosoop_pdf — base64 → ArrayBuffer */
    const pdfRaw  = idb.cosoop_pdf ?? {};
    const pdfData = (pdfRaw.data ?? []).map(r => ({
      nombre: r.nombre,
      buffer: b64ToBuf(r.buffer_b64),
    }));
    const dbPDF = await idbOpenSchema('cosoop_pdf', 3, [
      { storeName: 'meta',     keyPath: 'nombre' },
      { storeName: 'data',     keyPath: 'nombre' },
      { storeName: 'carpetas', keyPath: 'nombre' },
    ]);
    await idbClearAndFill(dbPDF, 'meta',     pdfRaw.meta     ?? []);
    await idbClearAndFill(dbPDF, 'data',     pdfData);
    await idbClearAndFill(dbPDF, 'carpetas', pdfRaw.carpetas ?? []);
    dbPDF.close();
  }

  return { exportar, restaurar };
})();
