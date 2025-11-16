const DEFAULT_SMOOTHING = 0.9;
const FALLBACK_BG = 'rgba(5, 7, 10, 0.82)';

export function createFramerateDisplay({ parent = document.body, smoothing = DEFAULT_SMOOTHING } = {}) {
  const container = document.createElement('div');
  container.className = 'framerate-display';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'off');
  container.textContent = '— FPS';
  if (!container.style.background) {
    container.style.background = FALLBACK_BG;
  }

  if (parent) {
    parent.appendChild(container);
  }

  let smoothedFps = null;
  const clampedSmoothing = Math.min(Math.max(Number.isFinite(smoothing) ? smoothing : DEFAULT_SMOOTHING, 0), 0.99);

  const update = (deltaTimeSeconds) => {
    if (!container || !Number.isFinite(deltaTimeSeconds) || deltaTimeSeconds <= 0) {
      return;
    }
    const fps = 1 / deltaTimeSeconds;
    if (smoothedFps === null) {
      smoothedFps = fps;
    } else {
      smoothedFps = smoothedFps * clampedSmoothing + fps * (1 - clampedSmoothing);
    }
    container.textContent = `${Math.round(smoothedFps)} FPS`;
  };

  const destroy = () => {
    if (container?.parentElement) {
      container.parentElement.removeChild(container);
    }
  };

  return {
    element: container,
    update,
    destroy
  };
}
