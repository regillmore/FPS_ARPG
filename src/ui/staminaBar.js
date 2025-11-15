const clamp01 = (value) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
};

const createStaminaBarElement = () => {
  const root = document.createElement('div');
  root.className = 'stamina-bar';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="stamina-bar__shell">
      <div class="stamina-bar__fill"></div>
    </div>
    <div class="stamina-bar__label">
      <span class="stamina-bar__label-text">Stamina</span>
      <span class="stamina-bar__value">100%</span>
    </div>
  `;
  return root;
};

export function createStaminaBar(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  const element = createStaminaBarElement();
  const fill = element.querySelector('.stamina-bar__fill');
  const valueLabel = element.querySelector('.stamina-bar__value');

  if (mount) {
    mount.appendChild(element);
  }

  const setVisible = (visible) => {
    element.classList.toggle('is-visible', Boolean(visible));
  };

  const setState = (state = {}) => {
    const maxStamina = Number.isFinite(state.maxStamina) && state.maxStamina > 0 ? state.maxStamina : 100;
    const stamina = Number.isFinite(state.stamina) ? Math.min(Math.max(state.stamina, 0), maxStamina) : maxStamina;
    const normalized = clamp01(state.normalized ?? stamina / maxStamina);
    const isSprinting = Boolean(state.isSprinting);
    const isLow = normalized <= 0.25;
    const isDepleted = normalized <= 0.05 || Boolean(state.isDepleted);

    if (fill) {
      fill.style.width = `${(normalized * 100).toFixed(1)}%`;
    }

    if (valueLabel) {
      valueLabel.textContent = `${Math.round(normalized * 100)}%`;
    }

    element.classList.toggle('stamina-bar--sprinting', isSprinting);
    element.classList.toggle('stamina-bar--low', isLow);
    element.classList.toggle('stamina-bar--depleted', isDepleted);

    setVisible(true);
  };

  const destroy = () => {
    element.remove();
  };

  return {
    element,
    setState,
    setVisible,
    destroy
  };
}
