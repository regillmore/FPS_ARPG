import { mat4FromRotationTranslation } from '../../math.js';

const FLOATS_PER_VERTEX = 10;
const SEGMENT_COUNT = 16;
const BODY_RADIUS = 0.4;
const BODY_HEIGHT = 1.05;
const BAND_HEIGHT = 0.08;
const RIM_HEIGHT = 0.06;
const DEFAULT_HEALTH = 60;
const DEFAULT_IMPACT_DAMAGE = 6;
const MAX_RADIUS = BODY_RADIUS * 1.05;

const COLORS = Object.freeze({
  wood: [0.62, 0.38, 0.18],
  woodDark: [0.42, 0.24, 0.12],
  metal: [0.55, 0.55, 0.6]
});

const UNIT_X = new Float32Array([1, 0, 0]);
const UNIT_Y = new Float32Array([0, 1, 0]);
const UNIT_Z = new Float32Array([0, 0, 1]);

const LOCAL_BOUNDS = Object.freeze({
  minX: -MAX_RADIUS,
  maxX: MAX_RADIUS,
  minY: 0,
  maxY: BODY_HEIGHT + RIM_HEIGHT * 2,
  minZ: -MAX_RADIUS,
  maxZ: MAX_RADIUS
});

function pushVertex(target, position, normal, color) {
  target.push(
    position[0],
    position[1],
    position[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2],
    0
  );
}

function addSideStrip(target, bottomRadius, topRadius, bottomY, topY, color) {
  const segmentStep = (Math.PI * 2) / SEGMENT_COUNT;

  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const angle0 = i * segmentStep;
    const angle1 = (i + 1) * segmentStep;

    const cos0 = Math.cos(angle0);
    const sin0 = Math.sin(angle0);
    const cos1 = Math.cos(angle1);
    const sin1 = Math.sin(angle1);

    const bottom0 = [bottomRadius * cos0, bottomY, bottomRadius * sin0];
    const bottom1 = [bottomRadius * cos1, bottomY, bottomRadius * sin1];
    const top1 = [topRadius * cos1, topY, topRadius * sin1];
    const top0 = [topRadius * cos0, topY, topRadius * sin0];

    const normal0 = [cos0, 0, sin0];
    const normal1 = [cos1, 0, sin1];

    pushVertex(target, bottom0, normal0, color);
    pushVertex(target, top1, normal1, color);
    pushVertex(target, bottom1, normal1, color);

    pushVertex(target, bottom0, normal0, color);
    pushVertex(target, top0, normal0, color);
    pushVertex(target, top1, normal1, color);
  }
}

function addCap(target, radius, y, normal, color, invert = false) {
  const segmentStep = (Math.PI * 2) / SEGMENT_COUNT;
  const center = [0, y, 0];

  for (let i = 0; i < SEGMENT_COUNT; i += 1) {
    const angle0 = i * segmentStep;
    const angle1 = (i + 1) * segmentStep;

    const cos0 = Math.cos(angle0);
    const sin0 = Math.sin(angle0);
    const cos1 = Math.cos(angle1);
    const sin1 = Math.sin(angle1);

    const edge0 = [radius * cos0, y, radius * sin0];
    const edge1 = [radius * cos1, y, radius * sin1];

    if (invert) {
      pushVertex(target, center, normal, color);
      pushVertex(target, edge0, normal, color);
      pushVertex(target, edge1, normal, color);
    } else {
      pushVertex(target, center, normal, color);
      pushVertex(target, edge1, normal, color);
      pushVertex(target, edge0, normal, color);
    }
  }
}

function createBarrelGeometry(device) {
  const vertices = [];

  const rimBottom = 0;
  const bodyBottom = rimBottom + RIM_HEIGHT;
  const bodyTop = bodyBottom + BODY_HEIGHT;
  const rimTop = bodyTop + RIM_HEIGHT;

  addSideStrip(vertices, BODY_RADIUS * 0.92, BODY_RADIUS, rimBottom, bodyBottom, COLORS.woodDark);
  addSideStrip(vertices, BODY_RADIUS, BODY_RADIUS, bodyBottom, bodyTop, COLORS.wood);
  addSideStrip(vertices, BODY_RADIUS, BODY_RADIUS * 0.92, bodyTop, rimTop, COLORS.woodDark);

  const bandOffset = BODY_HEIGHT / 3;
  const lowerBandBottom = bodyBottom + bandOffset - BAND_HEIGHT / 2;
  const lowerBandTop = lowerBandBottom + BAND_HEIGHT;
  const upperBandBottom = bodyBottom + 2 * bandOffset - BAND_HEIGHT / 2;
  const upperBandTop = upperBandBottom + BAND_HEIGHT;

  addSideStrip(vertices, BODY_RADIUS * 1.03, BODY_RADIUS * 1.03, lowerBandBottom, lowerBandTop, COLORS.metal);
  addSideStrip(vertices, BODY_RADIUS * 1.03, BODY_RADIUS * 1.03, upperBandBottom, upperBandTop, COLORS.metal);

  addCap(vertices, BODY_RADIUS * 0.96, rimTop, [0, 1, 0], COLORS.wood, false);
  addCap(vertices, BODY_RADIUS * 0.96, rimBottom, [0, -1, 0], COLORS.wood, true);

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  return {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX,
    localBounds: LOCAL_BOUNDS
  };
}

function resolvePosition(options = {}) {
  const base = Array.isArray(options.position) ? options.position : [0, 0, 0];
  const [x = 0, y = 0, z = 0] = base;
  const resolvedX = Number.isFinite(options.x) ? options.x : x;
  const resolvedY = Number.isFinite(options.y) ? options.y : y;
  const resolvedZ = Number.isFinite(options.z) ? options.z : z;
  return new Float32Array([
    Number.isFinite(resolvedX) ? resolvedX : 0,
    Number.isFinite(resolvedY) ? resolvedY : 0,
    Number.isFinite(resolvedZ) ? resolvedZ : 0
  ]);
}

function translateBounds(bounds, translation) {
  if (!bounds) {
    return null;
  }
  return {
    minX: bounds.minX + translation[0],
    maxX: bounds.maxX + translation[0],
    minY: bounds.minY + translation[1],
    maxY: bounds.maxY + translation[1],
    minZ: bounds.minZ + translation[2],
    maxZ: bounds.maxZ + translation[2]
  };
}

function resolveInitialHealth(options = {}) {
  const value = Number(options.health);
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_HEALTH;
  }
  return value;
}

function resolveImpactDamage(impact) {
  if (!impact) {
    return DEFAULT_IMPACT_DAMAGE;
  }
  const value = Number(impact.damage);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_IMPACT_DAMAGE;
  }
  return value;
}

export function createBarrel(device, options = {}) {
  if (!device) {
    throw new Error('A GPUDevice is required to create a barrel enemy.');
  }

  const geometry = createBarrelGeometry(device);
  const translation = resolvePosition(options);
  const modelMatrix = new Float32Array(16);
  mat4FromRotationTranslation(modelMatrix, UNIT_X, UNIT_Y, UNIT_Z, translation);

  const worldBounds = translateBounds(geometry.localBounds, translation);
  const onDeath = typeof options.onDeath === 'function' ? options.onDeath : null;
  const onDamaged = typeof options.onDamaged === 'function' ? options.onDamaged : null;

  const hitBoxes = [];
  const maxHealth = resolveInitialHealth(options);
  let currentHealth = maxHealth;
  let isDead = false;

  const barrel = {
    type: 'barrel',
    modelMatrix,
    vertexBuffer: geometry.vertexBuffer,
    vertexCount: geometry.vertexCount,
    position: translation,
    bounds: worldBounds,
    get health() {
      return currentHealth;
    },
    get maxHealth() {
      return maxHealth;
    },
    isDestroyed() {
      return isDead;
    },
    getHitBoxes() {
      return hitBoxes;
    },
    update() {},
    takeDamage(amount, context = {}) {
      if (isDead) {
        return;
      }

      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }

      currentHealth = Math.max(currentHealth - value, 0);

      if (onDamaged) {
        try {
          onDamaged({ enemy: barrel, damage: value, remainingHealth: currentHealth, context });
        } catch (error) {
          console.error('Error while handling barrel damage callback:', error);
        }
      }

      if (currentHealth === 0) {
        isDead = true;
        if (onDeath) {
          try {
            onDeath({ enemy: barrel, context });
          } catch (error) {
            console.error('Error while handling barrel death callback:', error);
          }
        }
      }
    },
    onHit(impact) {
      if (isDead) {
        return;
      }
      const damage = resolveImpactDamage(impact);
      if (damage <= 0) {
        return;
      }
      barrel.takeDamage(damage, { impact });
    },
    destroy() {
      isDead = true;
      geometry.vertexBuffer.destroy?.();
    }
  };

  hitBoxes.push({
    bounds: worldBounds,
    onHit(impact) {
      barrel.onHit(impact);
    }
  });

  return barrel;
}
