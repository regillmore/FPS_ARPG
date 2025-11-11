const DEFAULT_WORLD_OFFSET = 0.35;
const DEFAULT_PIXEL_OFFSET = 16;
const MIN_CLIP_W = 1e-5;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function resolveNumeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveHealthValues(enemy) {
  if (!enemy) {
    return null;
  }

  let current = Number(enemy.health);
  if (!Number.isFinite(current) && typeof enemy.getHealth === 'function') {
    current = Number(enemy.getHealth());
  }

  let max = Number(enemy.maxHealth);
  if (!Number.isFinite(max) && typeof enemy.getMaxHealth === 'function') {
    max = Number(enemy.getMaxHealth());
  }

  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) {
    return null;
  }

  return { current, max };
}

function resolveAnchorPosition(enemy, out) {
  if (!enemy) {
    return null;
  }

  const bounds = enemy.bounds ?? null;
  const offset = resolveNumeric(enemy.healthBarOffset, DEFAULT_WORLD_OFFSET);

  if (bounds) {
    out[0] = (resolveNumeric(bounds.minX, 0) + resolveNumeric(bounds.maxX, 0)) * 0.5;
    out[1] = resolveNumeric(bounds.maxY, 0) + offset;
    out[2] = (resolveNumeric(bounds.minZ, 0) + resolveNumeric(bounds.maxZ, 0)) * 0.5;
    out[3] = 1;
    return out;
  }

  const position = enemy.position ?? null;
  if (position && position.length >= 3) {
    out[0] = resolveNumeric(position[0], 0);
    out[1] = resolveNumeric(position[1], 0) + offset + 1.0;
    out[2] = resolveNumeric(position[2], 0);
    out[3] = 1;
    return out;
  }

  return null;
}

function projectToScreen(worldPosition, viewProjectionMatrix, viewportWidth, viewportHeight, clipSpace) {
  clipSpace[0] =
    viewProjectionMatrix[0] * worldPosition[0] +
    viewProjectionMatrix[4] * worldPosition[1] +
    viewProjectionMatrix[8] * worldPosition[2] +
    viewProjectionMatrix[12] * worldPosition[3];
  clipSpace[1] =
    viewProjectionMatrix[1] * worldPosition[0] +
    viewProjectionMatrix[5] * worldPosition[1] +
    viewProjectionMatrix[9] * worldPosition[2] +
    viewProjectionMatrix[13] * worldPosition[3];
  clipSpace[2] =
    viewProjectionMatrix[2] * worldPosition[0] +
    viewProjectionMatrix[6] * worldPosition[1] +
    viewProjectionMatrix[10] * worldPosition[2] +
    viewProjectionMatrix[14] * worldPosition[3];
  clipSpace[3] =
    viewProjectionMatrix[3] * worldPosition[0] +
    viewProjectionMatrix[7] * worldPosition[1] +
    viewProjectionMatrix[11] * worldPosition[2] +
    viewProjectionMatrix[15] * worldPosition[3];

  const w = clipSpace[3];
  if (!Number.isFinite(w) || Math.abs(w) < MIN_CLIP_W || w <= 0) {
    return null;
  }

  const ndcX = clipSpace[0] / w;
  const ndcY = clipSpace[1] / w;
  const ndcZ = clipSpace[2] / w;

  if (ndcZ < -1 || ndcZ > 1 || ndcX < -1.15 || ndcX > 1.15 || ndcY < -1.15 || ndcY > 1.15) {
    return null;
  }

  const screenX = (ndcX * 0.5 + 0.5) * viewportWidth;
  const screenY = (1 - (ndcY * 0.5 + 0.5)) * viewportHeight;

  return { x: screenX, y: screenY };
}

function createBarElement() {
  const element = document.createElement('div');
  element.className = 'enemy-health-bar';
  element.setAttribute('role', 'presentation');

  const fill = document.createElement('div');
  fill.className = 'enemy-health-bar__fill';
  fill.style.width = '100%';

  const shell = document.createElement('div');
  shell.className = 'enemy-health-bar__shell';
  shell.appendChild(fill);
  element.appendChild(shell);

  return { element, fill };
}

export function createEnemyHealthBars(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  if (!mount) {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'enemy-health-bars';
  container.setAttribute('aria-hidden', 'true');
  container.hidden = true;
  mount.appendChild(container);

  const tracked = new Map();
  const seen = new Set();
  const worldPosition = new Float32Array(4);
  const clipSpace = new Float32Array(4);

  const detach = (enemy) => {
    const entry = tracked.get(enemy);
    if (!entry) {
      return;
    }
    entry.element.remove();
    tracked.delete(enemy);
  };

  const update = ({ enemies, viewProjectionMatrix, viewportWidth, viewportHeight } = {}) => {
    if (!Array.isArray(enemies) || enemies.length === 0) {
      for (const enemy of Array.from(tracked.keys())) {
        detach(enemy);
      }
      container.hidden = true;
      return;
    }

    if (
      !viewProjectionMatrix ||
      viewProjectionMatrix.length < 16 ||
      !Number.isFinite(viewportWidth) ||
      !Number.isFinite(viewportHeight) ||
      viewportWidth <= 0 ||
      viewportHeight <= 0
    ) {
      container.hidden = true;
      return;
    }

    seen.clear();
    let visibleCount = 0;

    for (const enemy of enemies) {
      if (!enemy) {
        continue;
      }

      if (typeof enemy.isDestroyed === 'function' && enemy.isDestroyed()) {
        detach(enemy);
        continue;
      }

      const healthValues = resolveHealthValues(enemy);
      if (!healthValues || healthValues.current >= healthValues.max) {
        detach(enemy);
        continue;
      }

      if (!resolveAnchorPosition(enemy, worldPosition)) {
        detach(enemy);
        continue;
      }

      const screenPoint = projectToScreen(
        worldPosition,
        viewProjectionMatrix,
        viewportWidth,
        viewportHeight,
        clipSpace
      );

      if (!screenPoint) {
        detach(enemy);
        continue;
      }

      let entry = tracked.get(enemy);
      if (!entry) {
        entry = createBarElement();
        tracked.set(enemy, entry);
        container.appendChild(entry.element);
      }

      seen.add(enemy);
      visibleCount += 1;

      const ratio = clamp(healthValues.current / healthValues.max, 0, 1);
      entry.fill.style.width = `${(ratio * 100).toFixed(2)}%`;

      const offsetY = DEFAULT_PIXEL_OFFSET;
      entry.element.style.transform = `translate(-50%, -100%) translate(${screenPoint.x.toFixed(2)}px, ${(screenPoint.y - offsetY).toFixed(2)}px)`;
    }

    for (const enemy of Array.from(tracked.keys())) {
      if (!seen.has(enemy)) {
        detach(enemy);
      }
    }

    container.hidden = visibleCount === 0;
  };

  const destroy = () => {
    for (const enemy of Array.from(tracked.keys())) {
      detach(enemy);
    }
    container.remove();
  };

  return {
    update,
    destroy
  };
}
