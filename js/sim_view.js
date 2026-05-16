const SimView = (() => {
  'use strict';

  const SIMS = [
    {
      id:       'dcpd',
      title:    'DCPD',
      subtitle: 'Descuento de Cheques de Pago Diferido',
      icon:     '🏦',
    },
    {
      id:       'pex',
      title:    'PEX',
      subtitle: 'Anticipo de Cupones de Tarjeta de Crédito',
      icon:     '💳',
    },
    {
      id:       'pf',
      title:    'Plazo Fijo',
      subtitle: 'Simulador de rendimiento a tasa nominal anual',
      icon:     '🏛️',
    },
  ];

  const VIEW = `
<div class="simv-view">
  <div class="simv-topbar">
    <button class="simv-back" id="simv-back">&#8249;</button>
    <span class="simv-title">Simuladores</span>
  </div>
  <div class="simv-scroll" id="simv-scroll"></div>
</div>`;

  function render() {
    document.getElementById('app').innerHTML = VIEW;

    document.getElementById('simv-back')
      ?.addEventListener('click', () => App.navigateTo('menu'));

    const scroll = document.getElementById('simv-scroll');
    if (!scroll) return;

    scroll.innerHTML = SIMS.map(s => `
      <div class="simv-card" data-id="${s.id}">
        <div class="simv-card-icon">${s.icon}</div>
        <div class="simv-card-info">
          <div class="simv-card-title">${s.title}</div>
          <div class="simv-card-sub">${s.subtitle}</div>
        </div>
        <div class="simv-card-arrow">&#8250;</div>
      </div>`).join('');

    scroll.addEventListener('click', e => {
      const card = e.target.closest('.simv-card');
      if (card) App.navigateTo(card.dataset.id);
    });
  }

  return { render };
})();
