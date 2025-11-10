const DEFAULT_PRIMARY_COLOR = 'rgba(255, 255, 255, 0.92)';
const DEFAULT_ACCENT_COLOR = 'rgba(78, 196, 112, 0.95)';

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function floatColorToCss(color, fallback) {
  if (!Array.isArray(color) || color.length < 3) {
    return fallback;
  }

  const [r, g, b, a] = color;
  const rByte = Math.round(clamp01(r) * 255);
  const gByte = Math.round(clamp01(g) * 255);
  const bByte = Math.round(clamp01(b) * 255);
  if (typeof a === 'number') {
    const alpha = clamp01(a);
    return `rgba(${rByte}, ${gByte}, ${bByte}, ${alpha.toFixed(3)})`;
  }
  return `rgb(${rByte}, ${gByte}, ${bByte})`;
}

function resolveCssColor(color, fallback) {
  if (typeof color === 'string' && color.trim().length > 0) {
    return color;
  }
  return floatColorToCss(color, fallback);
}

function createCrosshairElement() {
  const root = document.createElement('div');
  root.className = 'hud-reticle';
  root.setAttribute('aria-hidden', 'true');

  root.innerHTML = `
    <div class="hud-reticle__crosshair">
      <div class="hud-reticle__arm hud-reticle__arm--top"></div>
      <div class="hud-reticle__arm hud-reticle__arm--bottom"></div>
      <div class="hud-reticle__arm hud-reticle__arm--left"></div>
      <div class="hud-reticle__arm hud-reticle__arm--right"></div>
      <div class="hud-reticle__dot"></div>
    </div>
  `;

  return root;
}

export function createHudReticle(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  const element = createCrosshairElement();

  if (mount) {
    mount.appendChild(element);
  }

  const setPrimaryColor = (color) => {
    element.style.setProperty(
      '--hud-reticle-primary',
      resolveCssColor(color, DEFAULT_PRIMARY_COLOR)
    );
  };

  const setAccentColor = (color) => {
    element.style.setProperty(
      '--hud-reticle-accent',
      resolveCssColor(color, DEFAULT_ACCENT_COLOR)
    );
  };

  const api = {
    element,
    setTheme(theme = {}) {
      if (theme.primaryColor !== undefined) {
        setPrimaryColor(theme.primaryColor);
      } else {
        setPrimaryColor(DEFAULT_PRIMARY_COLOR);
      }

      if (theme.accentColor !== undefined) {
        setAccentColor(theme.accentColor);
      } else {
        setAccentColor(DEFAULT_ACCENT_COLOR);
      }
    },
    setVisible(isVisible) {
      if (isVisible) {
        element.classList.add('is-visible');
      } else {
        element.classList.remove('is-visible');
      }
    },
    destroy() {
      element.remove();
    }
  };

  api.setTheme({});
  api.setVisible(false);

  return api;
}
