const DEFAULT_WORLD_OFFSET = 0.45;
const DEFAULT_IMPACT_WORLD_OFFSET = 0.18;
const DEFAULT_ENTRY_LIFETIME = 1.05;
const DEFAULT_WORLD_FLOAT_SPEED = 0.6;
const DEFAULT_PIXEL_LIFT = 32;
const DEFAULT_HORIZONTAL_JITTER = 26;
const DEFAULT_START_SCALE = 1.15;
const DEFAULT_END_SCALE = 0.92;
const MIN_CLIP_W = 1e-5;

function resolveNumeric(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resolveWorldPosition(details) {
  if (!details) {
    return null;
  }

  const { enemy = null, context = null } = details;
  const impactPosition = context?.impact?.position ?? null;
  const worldPosition = new Float32Array(4);
  let resolved = false;

  if (impactPosition && impactPosition.length >= 3) {
    worldPosition[0] = resolveNumeric(impactPosition[0], 0);
    worldPosition[1] = resolveNumeric(impactPosition[1], 0);
    worldPosition[2] = resolveNumeric(impactPosition[2], 0);
    resolved = true;
  }

  if (!resolved && enemy?.bounds) {
    const bounds = enemy.bounds;
    worldPosition[0] =
      (resolveNumeric(bounds.minX, 0) + resolveNumeric(bounds.maxX, 0)) * 0.5;
    worldPosition[1] = resolveNumeric(bounds.maxY, 0);
    worldPosition[2] =
      (resolveNumeric(bounds.minZ, 0) + resolveNumeric(bounds.maxZ, 0)) * 0.5;
    resolved = true;
  }

  if (!resolved && enemy?.position && enemy.position.length >= 3) {
    worldPosition[0] = resolveNumeric(enemy.position[0], 0);
    worldPosition[1] = resolveNumeric(enemy.position[1], 0);
    worldPosition[2] = resolveNumeric(enemy.position[2], 0);
    resolved = true;
  }

  if (!resolved) {
    return null;
  }

  const offsetSource =
    details.worldOffset ?? enemy?.damageNumberOffset ?? enemy?.healthBarOffset;
  const offset = resolveNumeric(
    offsetSource,
    impactPosition ? DEFAULT_IMPACT_WORLD_OFFSET : DEFAULT_WORLD_OFFSET
  );

  worldPosition[1] += offset;
  worldPosition[3] = 1;
  return worldPosition;
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

function formatDamageText(value) {
  if (!Number.isFinite(value)) {
    return '';
  }
  const rounded = Math.round(value);
  if (Math.abs(rounded - value) < 0.05) {
    return String(rounded);
  }
  return value.toFixed(1);
}

export function createFloatingDamageNumbers(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  if (!mount) {
    return null;
  }

  const container = document.createElement('div');
  container.className = 'floating-damage-numbers';
  container.setAttribute('aria-hidden', 'true');
  container.hidden = true;
  mount.appendChild(container);

  const entries = [];
  const clipSpace = new Float32Array(4);
  const worldPosition = new Float32Array(4);

  function removeEntryAt(index) {
    const entry = entries[index];
    if (!entry) {
      return;
    }
    entry.element.remove();
    entries.splice(index, 1);
  }

  function spawn(details = {}) {
    const amount = Number(details.damage);
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const baseWorldPosition = resolveWorldPosition(details);
    if (!baseWorldPosition) {
      return null;
    }

    const lifetimeValue = resolveNumeric(details.lifetime, DEFAULT_ENTRY_LIFETIME);
    const lifetime = Math.max(lifetimeValue, 0.2);
    const element = document.createElement('div');
    element.className = 'floating-damage-number';
    element.textContent = formatDamageText(amount);
    element.style.opacity = '1';
    container.appendChild(element);

    entries.push({
      element,
      baseWorldPosition,
      worldFloatSpeed:
        resolveNumeric(details.worldFloatSpeed, DEFAULT_WORLD_FLOAT_SPEED) +
        (Math.random() - 0.5) * 0.15,
      pixelLift: DEFAULT_PIXEL_LIFT + Math.random() * 18,
      horizontalOffset: (Math.random() - 0.5) * DEFAULT_HORIZONTAL_JITTER,
      startScale: DEFAULT_START_SCALE + (Math.random() - 0.5) * 0.18,
      endScale: DEFAULT_END_SCALE + (Math.random() - 0.5) * 0.12,
      lifetime,
      age: 0
    });

    container.hidden = false;
    return element;
  }

  function update({
    deltaTime = 0,
    viewProjectionMatrix,
    viewportWidth,
    viewportHeight
  } = {}) {
    if (entries.length === 0) {
      container.hidden = true;
      return;
    }

    const validView =
      viewProjectionMatrix &&
      viewProjectionMatrix.length >= 16 &&
      Number.isFinite(viewportWidth) &&
      Number.isFinite(viewportHeight) &&
      viewportWidth > 0 &&
      viewportHeight > 0;

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      entry.age += Math.max(deltaTime, 0);
      const progress = entry.lifetime > 1e-5 ? entry.age / entry.lifetime : 1;

      if (progress >= 1) {
        removeEntryAt(i);
        continue;
      }

      const clampedProgress = Math.min(Math.max(progress, 0), 1);
      const fade = Math.max(1 - clampedProgress, 0);
      entry.element.style.opacity = fade.toFixed(3);

      if (!validView) {
        continue;
      }

      worldPosition[0] = entry.baseWorldPosition[0];
      worldPosition[1] = entry.baseWorldPosition[1] + entry.worldFloatSpeed * entry.age;
      worldPosition[2] = entry.baseWorldPosition[2];
      worldPosition[3] = 1;

      const screen = projectToScreen(
        worldPosition,
        viewProjectionMatrix,
        viewportWidth,
        viewportHeight,
        clipSpace
      );

      if (!screen) {
        entry.element.style.transform = 'translate(-50%, -50%)';
        continue;
      }

      const pixelLift = entry.pixelLift * clampedProgress;
      const scale =
        entry.startScale + (entry.endScale - entry.startScale) * clampedProgress;

      entry.element.style.left = `${screen.x}px`;
      entry.element.style.top = `${screen.y}px`;
      entry.element.style.transform = `translate(-50%, -50%) translate(${entry.horizontalOffset.toFixed(
        2
      )}px, ${(-pixelLift).toFixed(2)}px) scale(${Math.max(scale, 0.25).toFixed(3)})`;
    }

    container.hidden = entries.length === 0;
  }

  function clear() {
    if (entries.length === 0) {
      return;
    }
    while (entries.length > 0) {
      removeEntryAt(entries.length - 1);
    }
    container.hidden = true;
  }

  function dispose() {
    clear();
    container.remove();
  }

  return {
    spawn,
    update,
    clear,
    dispose
  };
}
