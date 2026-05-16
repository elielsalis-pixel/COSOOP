const Config = (() => {
  'use strict';

  /* ═══════════════════════════════════════════════════
     VIEW  (embebida — funciona offline)
  ═══════════════════════════════════════════════════ */
  const VIEW = `
<div class="cfg-view">
  <div class="cfg-topbar">
    <button class="cfg-back" id="cfg-back">&#8249;</button>
    <span class="cfg-title">Configuración</span>
  </div>

  <div class="cfg-scroll">

    <!-- Tabla de tasas -->
    <div class="cfg-section-hdr">Tabla de tasas</div>
    <div class="cfg-card">
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Flexibilidad DCPD</div>
          <div class="cfg-row-sub" id="cfg-tabla-estado">Cargando…</div>
        </div>
      </div>
      <div class="cfg-divider"></div>
      <label class="cfg-row cfg-action" for="cfg-file-input">
        <span class="cfg-row-icon">📂</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Cargar archivo XLSX</div>
          <div class="cfg-row-sub">Reemplaza la tabla actual</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </label>
      <input id="cfg-file-input" type="file" accept=".xlsx,.xls" style="display:none">
    </div>
    <div class="cfg-hint" id="cfg-file-msg"></div>

    <!-- Banca Empresa -->
    <div class="cfg-section-hdr">Tasas Banca Empresa</div>
    <div class="cfg-card">
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Archivo cargado</div>
          <div class="cfg-row-sub" id="cfg-be-estado">Cargando…</div>
        </div>
      </div>
      <div class="cfg-divider"></div>
      <label class="cfg-row cfg-action" for="cfg-be-input">
        <span class="cfg-row-icon">📂</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Cargar archivo XLSX</div>
          <div class="cfg-row-sub">Múltiples hojas — cada hoja es una sección</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </label>
      <input id="cfg-be-input" type="file" accept=".xlsx,.xls" style="display:none">
    </div>
    <div class="cfg-hint" id="cfg-be-msg"></div>

    <!-- Banca Personas -->
    <div class="cfg-section-hdr">Tasas Banca Personas</div>
    <div class="cfg-card">
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Archivo cargado</div>
          <div class="cfg-row-sub" id="cfg-bp-estado">Cargando…</div>
        </div>
      </div>
      <div class="cfg-divider"></div>
      <label class="cfg-row cfg-action" for="cfg-bp-input">
        <span class="cfg-row-icon">📂</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Cargar archivo XLSX</div>
          <div class="cfg-row-sub">Productos · Convenios · Hipotecarios</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </label>
      <input id="cfg-bp-input" type="file" accept=".xlsx,.xls" style="display:none">
    </div>
    <div class="cfg-hint" id="cfg-bp-msg"></div>

    <!-- Hipotecario UVA -->
    <div class="cfg-section-hdr">Tasas Hipotecario UVA</div>
    <div class="cfg-card">
      <div class="cfg-huva-grid">
        <div class="cfg-huva-corner"></div>
        <div class="cfg-huva-col-hdr">1era Viv. SI</div>
        <div class="cfg-huva-col-hdr">1era Viv. NO</div>
        <div class="cfg-huva-row-hdr">Cobra Hab. SI</div>
        <div class="cfg-huva-cell">
          <input id="cfg-huva-v1si-habsi" class="cfg-huva-inp" type="number" inputmode="decimal" placeholder="0,00">
        </div>
        <div class="cfg-huva-cell">
          <input id="cfg-huva-v1no-habsi" class="cfg-huva-inp" type="number" inputmode="decimal" placeholder="0,00">
        </div>
        <div class="cfg-huva-row-hdr">Cobra Hab. NO</div>
        <div class="cfg-huva-cell">
          <input id="cfg-huva-v1si-habno" class="cfg-huva-inp" type="number" inputmode="decimal" placeholder="0,00">
        </div>
        <div class="cfg-huva-cell">
          <input id="cfg-huva-v1no-habno" class="cfg-huva-inp" type="number" inputmode="decimal" placeholder="0,00">
        </div>
      </div>
      <div class="cfg-divider"></div>
      <button class="cfg-row cfg-action" id="cfg-huva-save">
        <span class="cfg-row-icon">💾</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Guardar tasas</div>
          <div class="cfg-row-sub" id="cfg-huva-estado">Cargando…</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </button>
    </div>
    <div class="cfg-hint" id="cfg-huva-msg"></div>

    <!-- Visor PDF -->
    <div class="cfg-section-hdr">Visor PDF</div>
    <div class="cfg-card">
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Documentos guardados</div>
          <div class="cfg-row-sub" id="cfg-pdf-estado">Cargando…</div>
        </div>
      </div>
      <div class="cfg-divider"></div>
      <label class="cfg-row cfg-action" for="cfg-pdf-input">
        <span class="cfg-row-icon">📂</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Agregar PDF</div>
          <div class="cfg-row-sub">Mismo nombre reemplaza el anterior</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </label>
      <input id="cfg-pdf-input" type="file" accept=".pdf" style="display:none">
    </div>
    <div class="cfg-hint" id="cfg-pdf-msg"></div>

    <!-- Seguridad -->
    <div class="cfg-section-hdr">Seguridad</div>
    <div class="cfg-card">
      <button class="cfg-row cfg-action" id="cfg-pin-btn">
        <span class="cfg-row-icon">🔑</span>
        <div class="cfg-row-info">
          <div class="cfg-row-label">Cambiar PIN</div>
          <div class="cfg-row-sub">Reconfigurar acceso</div>
        </div>
        <span class="cfg-row-arrow">›</span>
      </button>
    </div>
    <div class="cfg-hint">Deberás volver a ingresar un PIN nuevo.</div>

    <!-- Acerca de -->
    <div class="cfg-section-hdr">Acerca de</div>
    <div class="cfg-card">
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Cosoop</div>
          <div class="cfg-row-sub">v1.0 · Banco Credicoop Coop. Ltdo.</div>
        </div>
      </div>
      <div class="cfg-divider"></div>
      <div class="cfg-row">
        <div class="cfg-row-info">
          <div class="cfg-row-label">Funciona sin conexión</div>
          <div class="cfg-row-sub">PWA instalable · Datos locales en el dispositivo</div>
        </div>
      </div>
    </div>

    <div style="height:48px"></div>
  </div>
</div>`;

  /* ═══════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════ */
  async function mostrarEstadoTabla() {
    const el = document.getElementById('cfg-tabla-estado');
    if (!el) return;
    try {
      const stored = await TasasManager.getTabla();
      if (!stored?.tabla?.length) {
        el.textContent = 'Sin tabla cargada';
      } else {
        const fecha = new Date(stored.cargadoEl).toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        el.textContent = `${stored.nombre} · ${stored.tabla.length} tramos · ${fecha}`;
      }
    } catch {
      el.textContent = 'Error al leer la tabla';
    }
  }

  async function mostrarEstadoBE() {
    const el = document.getElementById('cfg-be-estado');
    if (!el) return;
    try {
      const stored = await BancaEmpresa.getArchivo();
      if (!stored?.secciones?.length) {
        el.textContent = 'Sin archivo cargado';
      } else {
        const fecha = new Date(stored.cargadoEl).toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        el.textContent = `${stored.nombre} · ${stored.secciones.length} secciones · ${fecha}`;
      }
    } catch {
      el.textContent = 'Error al leer el archivo';
    }
  }

  async function mostrarEstadoHUVA() {
    const el = document.getElementById('cfg-huva-estado');
    if (!el) return;
    try {
      const tasas = await HipUVATasas.get();
      el.textContent = tasas ? '4 tasas configuradas' : 'Sin tasas configuradas';
      if (tasas) {
        const ids = ['cfg-huva-v1si-habsi', 'cfg-huva-v1no-habsi', 'cfg-huva-v1si-habno', 'cfg-huva-v1no-habno'];
        const keys = ['v1si_habsi', 'v1no_habsi', 'v1si_habno', 'v1no_habno'];
        ids.forEach((id, i) => {
          const inp = document.getElementById(id);
          if (inp && tasas[keys[i]] != null) inp.value = tasas[keys[i]];
        });
      }
    } catch {
      el.textContent = 'Error al leer las tasas';
    }
  }

  async function mostrarEstadoPDF() {
    const el = document.getElementById('cfg-pdf-estado');
    if (!el) return;
    try {
      const n = await PDFViewer.getCount();
      el.textContent = n === 0 ? 'Sin documentos guardados'
        : `${n} documento${n > 1 ? 's' : ''} guardado${n > 1 ? 's' : ''}`;
    } catch {
      el.textContent = 'Error al leer los documentos';
    }
  }

  async function mostrarEstadoBP() {
    const el = document.getElementById('cfg-bp-estado');
    if (!el) return;
    try {
      const stored = await BancaPersonas.getArchivo();
      if (!stored?.secciones?.length) {
        el.textContent = 'Sin archivo cargado';
      } else {
        const fecha = new Date(stored.cargadoEl).toLocaleDateString('es-AR', {
          day: '2-digit', month: '2-digit', year: 'numeric',
        });
        el.textContent = `${stored.nombre} · ${stored.secciones.length} secciones · ${fecha}`;
      }
    } catch {
      el.textContent = 'Error al leer el archivo';
    }
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  async function init() {
    document.getElementById('cfg-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    await Promise.all([mostrarEstadoTabla(), mostrarEstadoBE(), mostrarEstadoBP(), mostrarEstadoPDF(), mostrarEstadoHUVA()]);

    /* File picker — Flexibilidad DCPD */
    document.getElementById('cfg-file-input')
      ?.addEventListener('change', async e => {
        const file  = e.target.files?.[0];
        if (!file) return;
        const msgEl = document.getElementById('cfg-file-msg');
        if (msgEl) { msgEl.textContent = 'Procesando…'; msgEl.className = 'cfg-hint'; }
        try {
          await TasasManager.cargarArchivo(file);
          if (msgEl) { msgEl.textContent = `Tabla cargada: ${file.name} ✓`; msgEl.className = 'cfg-hint cfg-hint-ok'; }
          await mostrarEstadoTabla();
        } catch (err) {
          if (msgEl) { msgEl.textContent = `Error: ${err.message}`; msgEl.className = 'cfg-hint cfg-hint-err'; }
        }
        e.target.value = '';
      });

    /* File picker — Banca Empresa */
    document.getElementById('cfg-be-input')
      ?.addEventListener('change', async e => {
        const file  = e.target.files?.[0];
        if (!file) return;
        const msgEl = document.getElementById('cfg-be-msg');
        if (msgEl) { msgEl.textContent = 'Procesando…'; msgEl.className = 'cfg-hint'; }
        try {
          await BancaEmpresa.cargarArchivo(file);
          if (msgEl) { msgEl.textContent = `Archivo cargado: ${file.name} ✓`; msgEl.className = 'cfg-hint cfg-hint-ok'; }
          await mostrarEstadoBE();
        } catch (err) {
          if (msgEl) { msgEl.textContent = `Error: ${err.message}`; msgEl.className = 'cfg-hint cfg-hint-err'; }
        }
        e.target.value = '';
      });

    /* File picker — Banca Personas */
    document.getElementById('cfg-bp-input')
      ?.addEventListener('change', async e => {
        const file  = e.target.files?.[0];
        if (!file) return;
        const msgEl = document.getElementById('cfg-bp-msg');
        if (msgEl) { msgEl.textContent = 'Procesando…'; msgEl.className = 'cfg-hint'; }
        try {
          await BancaPersonas.cargarArchivo(file);
          if (msgEl) { msgEl.textContent = `Archivo cargado: ${file.name} ✓`; msgEl.className = 'cfg-hint cfg-hint-ok'; }
          await mostrarEstadoBP();
        } catch (err) {
          if (msgEl) { msgEl.textContent = `Error: ${err.message}`; msgEl.className = 'cfg-hint cfg-hint-err'; }
        }
        e.target.value = '';
      });

    /* File picker — Visor PDF */
    document.getElementById('cfg-pdf-input')
      ?.addEventListener('change', async e => {
        const file  = e.target.files?.[0];
        if (!file) return;
        const msgEl = document.getElementById('cfg-pdf-msg');
        if (msgEl) { msgEl.textContent = 'Guardando…'; msgEl.className = 'cfg-hint'; }
        try {
          await PDFViewer.cargarPDF(file);
          if (msgEl) { msgEl.textContent = `Guardado: ${file.name} ✓`; msgEl.className = 'cfg-hint cfg-hint-ok'; }
          await mostrarEstadoPDF();
        } catch (err) {
          if (msgEl) { msgEl.textContent = `Error: ${err.message}`; msgEl.className = 'cfg-hint cfg-hint-err'; }
        }
        e.target.value = '';
      });

    /* Hipotecario UVA — guardar tasas */
    document.getElementById('cfg-huva-save')
      ?.addEventListener('click', async () => {
        const msgEl = document.getElementById('cfg-huva-msg');
        const v1si_habsi = parseFloat(document.getElementById('cfg-huva-v1si-habsi')?.value);
        const v1no_habsi = parseFloat(document.getElementById('cfg-huva-v1no-habsi')?.value);
        const v1si_habno = parseFloat(document.getElementById('cfg-huva-v1si-habno')?.value);
        const v1no_habno = parseFloat(document.getElementById('cfg-huva-v1no-habno')?.value);
        if ([v1si_habsi, v1no_habsi, v1si_habno, v1no_habno].some(isNaN)) {
          if (msgEl) { msgEl.textContent = 'Completá las 4 tasas antes de guardar.'; msgEl.className = 'cfg-hint cfg-hint-err'; }
          return;
        }
        try {
          await HipUVATasas.put({ v1si_habsi, v1no_habsi, v1si_habno, v1no_habno });
          if (msgEl) { msgEl.textContent = 'Tasas guardadas ✓'; msgEl.className = 'cfg-hint cfg-hint-ok'; }
          await mostrarEstadoHUVA();
        } catch (err) {
          if (msgEl) { msgEl.textContent = `Error: ${err.message}`; msgEl.className = 'cfg-hint cfg-hint-err'; }
        }
      });

    /* Cambiar PIN */
    document.getElementById('cfg-pin-btn')
      ?.addEventListener('click', () => App.reiniciar());
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    document.getElementById('app').innerHTML = VIEW;
    init().catch(console.error);
  }

  return { render };
})();
