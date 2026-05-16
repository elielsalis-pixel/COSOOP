const Menu = (() => {
  /*
   * SECTIONS — única fuente de verdad para los módulos.
   * Para agregar una sección nueva: agregar un objeto a este array.
   * Campos: id, title, subtitle, icon, color (blue | green | red)
   */
  /*
   * ready: true  → módulo disponible (sin badge "Próximamente")
   * ready: false → en desarrollo
   */
  const SECTIONS = [
    {
      id:       'sim',
      title:    'Simuladores',
      subtitle: 'DCPD · Anticipo PEX · Tarjetas de Crédito',
      icon:     '📊',
      color:    'blue',
      ready:    true,
    },
    {
      id:       'tas',
      title:    'Tasas',
      subtitle: 'Flexibilidad DCPD · Banca Empresa · Banca Personas',
      icon:     '📈',
      color:    'green',
      ready:    true,
    },
    {
      id:       'pdf',
      title:    'Visor PDF',
      subtitle: 'Documentos',
      icon:     '📄',
      color:    'red',
      ready:    true,
    },
  ];

  function render() {
    const grid = document.getElementById('menu-grid');
    if (!grid) return;

    /* Garantiza layout horizontal independientemente del CSS cacheado */
    grid.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

    grid.innerHTML = '';
    SECTIONS.forEach(s => {
      const card = document.createElement('div');
      card.className = 'menu-card';
      card.dataset.color = s.color;
      card.dataset.section = s.id;
      card.style.cssText = 'display:flex;flex-direction:row;align-items:center;min-height:unset;';
      card.innerHTML = `
        <div class="card-icon-wrap">${s.icon}</div>
        <div class="card-info">
          <div class="card-title">${s.title}</div>
          <div class="card-subtitle">${s.subtitle}</div>
          ${!s.ready ? '<div class="card-badge">Próximamente</div>' : ''}
        </div>
        <div class="card-arrow">&#8250;</div>
      `;
      card.addEventListener('click', () => App.navigateTo(s.id));
      grid.appendChild(card);
    });
  }

  return { render, SECTIONS };
})();
