const TasasManager = (() => {
  'use strict';

  const NIVELES = ['PIZARRA', 'GT ZONAL', 'GT REGIONAL', 'SGG FILIALES'];

  /* ═══════════════════════════════════════════════════
     INDEXEDDB
  ═══════════════════════════════════════════════════ */
  const DB = (() => {
    const NAME = 'cosoop_tasas';
    const VER  = 1;

    function open() {
      return new Promise((ok, fail) => {
        const r = indexedDB.open(NAME, VER);
        r.onupgradeneeded = e => {
          if (!e.target.result.objectStoreNames.contains('tabla'))
            e.target.result.createObjectStore('tabla', { keyPath: 'id' });
        };
        r.onsuccess = e => ok(e.target.result);
        r.onerror   = ()  => fail(r.error);
      });
    }

    async function get() {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('tabla', 'readonly')
                      .objectStore('tabla').get(1);
        req.onsuccess = () => ok(req.result || null);
        req.onerror   = () => fail(req.error);
      });
    }

    async function put(data) {
      const db = await open();
      return new Promise((ok, fail) => {
        const req = db.transaction('tabla', 'readwrite')
                      .objectStore('tabla').put({ id: 1, ...data });
        req.onsuccess = () => ok();
        req.onerror   = () => fail(req.error);
      });
    }

    return { get, put };
  })();

  /* ═══════════════════════════════════════════════════
     SHEETJS  — carga dinámica desde CDN
  ═══════════════════════════════════════════════════ */
  function loadXLSX() {
    return new Promise((ok, fail) => {
      if (window.XLSX) { ok(window.XLSX); return; }
      const s   = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload  = () => ok(window.XLSX);
      s.onerror = () => fail(new Error('No se pudo cargar el lector de Excel. Verificá tu conexión.'));
      document.head.appendChild(s);
    });
  }

  /* ═══════════════════════════════════════════════════
     PARSEO DEL XLSX
  ═══════════════════════════════════════════════════ */
  function esValido(val) {
    if (val == null) return false;
    const s = String(val).trim();
    return s !== '' && s !== '-' && !isNaN(parseFloat(s.replace(',', '.')));
  }

  async function parsear(file) {
    const XLSX = await loadXLSX();
    const buf  = await file.arrayBuffer();
    const wb   = XLSX.read(buf, { type: 'array' });
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const raw  = XLSX.utils.sheet_to_json(ws, { defval: null });

    if (!raw.length) throw new Error('El archivo está vacío.');

    // Detectar columna PPP y columnas de niveles (case-insensitive, ignora puntos y espacios extra)
    const headers = Object.keys(raw[0]);
    /* Normaliza: mayúsculas, sin puntos, espacios colapsados */
    const norm = h => h.trim().toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

    const pppKey = headers.find(h => norm(h) === 'PPP');
    if (!pppKey) throw new Error('No se encontró la columna PPP en el archivo.');

    /* Aliases: variantes de nombre aceptadas para cada nivel (normalizadas) */
    const ALIASES = {
      'PIZARRA':      ['PIZARRA'],
      'GT ZONAL':     ['GT ZONAL', 'ZONAL'],
      'GT REGIONAL':  ['GT REGIONAL', 'REGIONAL'],
      'SGG FILIALES': ['SGG FILIALES', 'SGG'],
    };

    const nivelKeys = {};
    for (const n of NIVELES) {
      const aliases = ALIASES[n].map(a => norm(a));
      nivelKeys[n] = headers.find(h => aliases.includes(norm(h))) || null;
    }

    // Normalizar filas
    const tabla = raw
      .map(row => {
        const ppp = parseInt(row[pppKey]);
        if (!ppp || isNaN(ppp)) return null;
        const entry = { ppp };
        for (const n of NIVELES) {
          const k    = nivelKeys[n];
          const val  = k ? row[k] : null;
          entry[n]   = esValido(val)
            ? parseFloat(String(val).replace(',', '.'))
            : null;
        }
        return entry;
      })
      .filter(Boolean)
      .sort((a, b) => a.ppp - b.ppp);

    if (!tabla.length) throw new Error('No se encontraron filas válidas en el archivo.');
    return tabla;
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */

  async function cargarArchivo(file) {
    const tabla = await parsear(file);
    await DB.put({ tabla, nombre: file.name, cargadoEl: Date.now() });
    return { tabla, nombre: file.name };
  }

  async function getTabla() {
    return DB.get();
  }

  /* Busca la TNA para un PPP dado y un nivel.
     Redondea PPP hacia arriba al tramo siguiente.
     Devuelve null si la celda es vacía o '-'. */
  function getRate(ppp, nivel, stored) {
    if (!stored?.tabla?.length) return null;
    const ceil  = Math.ceil(ppp);
    const tramo = stored.tabla.find(r => r.ppp >= ceil);
    if (!tramo) return null;                    // PPP fuera de rango
    return tramo[nivel] ?? null;
  }

  /* Niveles disponibles (con tasa válida) para un PPP dado */
  function getNivelesDisponibles(ppp, stored) {
    return NIVELES.filter(n => getRate(ppp, n, stored) !== null);
  }

  return { NIVELES, cargarArchivo, getTabla, getRate, getNivelesDisponibles };
})();
