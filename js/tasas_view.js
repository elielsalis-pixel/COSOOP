const TasasView = (() => {
  'use strict';

  /* ═══════════════════════════════════════════════════
     CATÁLOGO  — agregar futuras tablas aquí
  ═══════════════════════════════════════════════════ */
  const TABLAS = [
    {
      id:          'dcpd',
      nombre:      'Flexibilidad DCPD',
      descripcion: 'Descuento de cheques por PPP y nivel de aprobación',
      icon:        '📋',
      cols: [
        { key: 'PIZARRA',      label: 'Pizarra'  },
        { key: 'GT ZONAL',     label: 'Zonal'    },
        { key: 'GT REGIONAL',  label: 'Regional' },
        { key: 'SGG FILIALES', label: 'SGG'      },
      ],
      getStored:   () => TasasManager.getTabla(),
      getEstado:   s  => s?.tabla?.length     ? `${s.tabla.length} tramos`      : null,
    },
    {
      id:          'be',
      nombre:      'Tasas Banca Empresa',
      descripcion: 'Tasas y condiciones para productos de Banca Empresa',
      icon:        '🏢',
      getStored:   () => BancaEmpresa.getArchivo(),
      getEstado:   s  => s?.secciones?.length ? `${s.secciones.length} secciones` : null,
      onOpen:      () => BancaEmpresa.render(),
    },
    {
      id:          'bp',
      nombre:      'Tasas Banca Personas',
      descripcion: 'Tasas y condiciones para productos de Banca Personas',
      icon:        '👤',
      getStored:   () => BancaPersonas.getArchivo(),
      getEstado:   s  => s?.secciones?.length ? `${s.secciones.length} secciones` : null,
      onOpen:      () => BancaPersonas.render(),
    },
    {
      id:          'hip_uva',
      nombre:      'Hipotecario UVA',
      descripcion: 'Tasas TNA para créditos hipotecarios UVA',
      icon:        '🏡',
      getStored:   async () => { const t = await HipUVATasas.get(); return t ? { tasas: t } : null; },
      getEstado:   s  => s ? '4 tasas configuradas' : null,
      onOpen:      () => renderHipUVADetalle(),
    },
  ];

  const fmtPct = v => (v * 100).toFixed(2).replace('.', ',') + ' %';

  /* ═══════════════════════════════════════════════════
     HUB  — pantalla con las tarjetas de cada tabla
  ═══════════════════════════════════════════════════ */
  const HUB_VIEW = `
<div class="tv-view">
  <div class="tv-topbar">
    <button class="tv-back" id="tv-back">&#8249;</button>
    <div class="tv-titles">
      <div class="tv-title">Tasas</div>
    </div>
  </div>
  <div class="tv-hub-scroll">
    <div class="tv-section-hdr">Tablas de referencia</div>
    <div id="tv-hub-list"></div>
  </div>
</div>`;

  async function initHub() {
    document.getElementById('tv-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    const list = document.getElementById('tv-hub-list');
    if (!list) return;

    for (const def of TABLAS) {
      const card = document.createElement('div');
      card.className = 'tv-hub-card';

      /* Estado: tramos / secciones cargadas */
      let estadoTxt = 'Sin datos · cargá desde Configuración';
      try {
        const stored = await def.getStored();
        const resumen = def.getEstado?.(stored);
        if (resumen) {
          estadoTxt = stored.cargadoEl
            ? `${resumen} · ${new Date(stored.cargadoEl).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
            : resumen;
        }
      } catch { /* sin DB */ }

      card.innerHTML = `
        <div class="tv-hub-icon">${def.icon}</div>
        <div class="tv-hub-info">
          <div class="tv-hub-nombre">${def.nombre}</div>
          <div class="tv-hub-desc">${def.descripcion}</div>
          <div class="tv-hub-estado">${estadoTxt}</div>
        </div>
        <div class="tv-hub-arrow">›</div>`;

      card.addEventListener('click', () => {
        if (def.onOpen) def.onOpen();
        else renderDetalle(def.id);
      });
      list.appendChild(card);
    }
  }

  /* ═══════════════════════════════════════════════════
     DETALLE  — tabla completa de un item del catálogo
  ═══════════════════════════════════════════════════ */
  async function renderDetalle(tablaId) {
    const def = TABLAS.find(t => t.id === tablaId);
    if (!def) return;

    document.getElementById('app').innerHTML = `
<div class="tv-view">
  <div class="tv-topbar">
    <button class="tv-back" id="tv-back-det">&#8249;</button>
    <div class="tv-titles">
      <div class="tv-title">${def.nombre}</div>
      <div class="tv-subtitle" id="tv-subtitle">Cargando…</div>
    </div>
  </div>
  <div class="tv-wrap" id="tv-wrap"></div>
</div>`;

    document.getElementById('tv-back-det')
      ?.addEventListener('click', () => render());   // vuelve al hub

    try {
      const stored = await def.getStored();
      buildTabla(def, stored);
    } catch {
      buildTabla(def, null);
    }
  }

  function buildTabla(def, stored) {
    const wrap  = document.getElementById('tv-wrap');
    const subEl = document.getElementById('tv-subtitle');
    if (!wrap) return;

    if (!stored?.tabla?.length) {
      if (subEl) subEl.textContent = 'Sin datos';
      wrap.innerHTML = `
        <div class="tv-empty">
          <span class="tv-empty-icon">${def.icon}</span>
          <span>Sin tabla cargada.<br>Cargá el archivo XLSX desde <strong>Configuración</strong>.</span>
        </div>`;
      return;
    }

    if (subEl) {
      const fecha = new Date(stored.cargadoEl).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      subEl.textContent = `${stored.nombre} · ${fecha}`;
    }

    const thCols = def.cols.map(c => `<th>${c.label}</th>`).join('');
    const thead  = `<thead><tr><th>PPP</th>${thCols}</tr></thead>`;

    const rows = stored.tabla.map(r => {
      const celdas = def.cols.map(c =>
        r[c.key] != null
          ? `<td>${fmtPct(r[c.key] / 100)}</td>`
          : `<td><span class="tv-null">—</span></td>`
      ).join('');
      return `<tr><td>${r.ppp}</td>${celdas}</tr>`;
    }).join('');

    wrap.innerHTML = `<table class="tv-table">${thead}<tbody>${rows}</tbody></table>`;
  }

  /* ═══════════════════════════════════════════════════
     DETALLE HipUVA — vista de lectura de tasas 2×2
  ═══════════════════════════════════════════════════ */
  async function renderHipUVADetalle() {
    document.getElementById('app').innerHTML = `
<div class="tv-view">
  <div class="tv-topbar">
    <button class="tv-back" id="tv-back-det">&#8249;</button>
    <div class="tv-titles">
      <div class="tv-title">Hipotecario UVA</div>
      <div class="tv-subtitle">Tasas TNA según condiciones</div>
    </div>
  </div>
  <div class="tv-wrap" id="tv-huva-wrap"></div>
</div>`;

    document.getElementById('tv-back-det')
      ?.addEventListener('click', () => render());

    let tasas = null;
    try { tasas = await HipUVATasas.get(); } catch {}

    const wrap = document.getElementById('tv-huva-wrap');
    if (!tasas) {
      wrap.innerHTML = `
        <div class="tv-empty">
          <span class="tv-empty-icon">🏡</span>
          <span>Sin tasas configuradas.<br>Cargalas desde <strong>Configuración</strong>.</span>
        </div>`;
      return;
    }

    const fmtT = v => (v != null && !isNaN(v))
      ? v.toFixed(2).replace('.', ',') + ' %'
      : '<span class="tv-null">—</span>';

    wrap.innerHTML = `
      <table class="tv-table">
        <thead>
          <tr>
            <th></th>
            <th>1era Viv. SI</th>
            <th>1era Viv. NO</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cobra Hab. SI</td>
            <td>${fmtT(tasas.v1si_habsi)}</td>
            <td>${fmtT(tasas.v1no_habsi)}</td>
          </tr>
          <tr>
            <td>Cobra Hab. NO</td>
            <td>${fmtT(tasas.v1si_habno)}</td>
            <td>${fmtT(tasas.v1no_habno)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  /* ═══════════════════════════════════════════════════
     API PÚBLICA
  ═══════════════════════════════════════════════════ */
  function render() {
    document.getElementById('app').innerHTML = HUB_VIEW;
    initHub().catch(console.error);
  }

  return { render };
})();
