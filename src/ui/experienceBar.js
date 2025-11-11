function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Math.round(value).toLocaleString('en-US');
}

function createExperienceBarElement() {
  const root = document.createElement('div');
  root.className = 'experience-bar';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="experience-bar__shell">
      <div class="experience-bar__fill"></div>
    </div>
    <div class="experience-bar__label">
      <span class="experience-bar__level">Level 1</span>
      <span class="experience-bar__progress">0 / 0 XP</span>
    </div>
    <div class="experience-bar__detail" hidden>Lifetime XP: 0</div>
  `;
  return root;
}

export function createExperienceBar(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  const element = createExperienceBarElement();
  const fill = element.querySelector('.experience-bar__fill');
  const levelLabel = element.querySelector('.experience-bar__level');
  const progressLabel = element.querySelector('.experience-bar__progress');
  const detailLabel = element.querySelector('.experience-bar__detail');

  if (mount) {
    mount.appendChild(element);
  }

  let lastLevel = null;
  let levelUpTimeout = null;

  const clearLevelUpGlow = () => {
    if (levelUpTimeout) {
      clearTimeout(levelUpTimeout);
      levelUpTimeout = null;
    }
    element.classList.remove('experience-bar--level-up');
  };

  const triggerLevelUpGlow = () => {
    clearLevelUpGlow();
    element.classList.add('experience-bar--level-up');
    levelUpTimeout = setTimeout(() => {
      element.classList.remove('experience-bar--level-up');
      levelUpTimeout = null;
    }, 900);
  };

  const setVisible = (visible) => {
    element.classList.toggle('is-visible', Boolean(visible));
  };

  const setState = (state = {}) => {
    const level = Number.isFinite(state.level) ? Math.max(1, Math.floor(state.level)) : 1;
    const currentXp = Math.max(0, Number(state.currentXp) || 0);
    const requiredXp = Number.isFinite(state.requiredXp) ? Math.max(0, state.requiredXp) : 0;
    const totalXp = Math.max(0, Number(state.totalXp) || 0);
    const progress = requiredXp > 0 ? clamp01(currentXp / requiredXp) : 1;

    fill.style.width = `${(progress * 100).toFixed(2)}%`;
    element.classList.toggle('experience-bar--maxed', requiredXp <= 0);

    if (levelLabel) {
      levelLabel.textContent = `Level ${formatNumber(level)}`;
    }

    if (progressLabel) {
      if (requiredXp > 0) {
        progressLabel.textContent = `${formatNumber(currentXp)} / ${formatNumber(requiredXp)} XP`;
      } else {
        progressLabel.textContent = `${formatNumber(currentXp)} XP`;
      }
    }

    if (detailLabel) {
      if (totalXp > 0) {
        detailLabel.textContent = `Lifetime XP: ${formatNumber(totalXp)}`;
        detailLabel.hidden = false;
      } else {
        detailLabel.textContent = '';
        detailLabel.hidden = true;
      }
    }

    if (lastLevel !== null && level > lastLevel) {
      triggerLevelUpGlow();
    }
    lastLevel = level;

    setVisible(true);
  };

  const destroy = () => {
    clearLevelUpGlow();
    element.remove();
  };

  return {
    element,
    setState,
    setVisible,
    destroy
  };
}
