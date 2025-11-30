import { mat4FromRotationTranslation } from '../../math.js';

const FLOATS_PER_VERTEX = 10;
const HALF_WIDTH = 0.35;
const HALF_DEPTH = 0.45;
const NOSE_LENGTH = 0.25;
const BODY_HEIGHT = 1.2;
const DEFAULT_HEALTH = 90;
const DEFAULT_SPEED = 2.8;
const DEFAULT_IMPACT_DAMAGE = 6;

const COLORS = Object.freeze({
  hull: [0.22, 0.62, 0.88],
  trim: [0.12, 0.16, 0.24],
  canopy: [0.9, 0.92, 0.95]
});

const LOCAL_BOUNDS = Object.freeze({
  minX: -HALF_WIDTH,
  maxX: HALF_WIDTH,
  minY: 0,
  maxY: BODY_HEIGHT,
  minZ: -HALF_DEPTH,
  maxZ: HALF_DEPTH + NOSE_LENGTH
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

function addQuad(target, a, b, c, d, normal, color) {
  pushVertex(target, a, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, d, normal, color);
}

function addTriangle(target, a, b, c, normal, color) {
  pushVertex(target, a, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, c, normal, color);
}

function createFighterGeometry(device) {
  const vertices = [];
  const base = 0;
  const tipZ = HALF_DEPTH + NOSE_LENGTH;
  const canopyHeight = BODY_HEIGHT * 0.7;
  const shoulderHeight = BODY_HEIGHT * 0.45;

  const corners = {
    fl: [HALF_WIDTH, base, HALF_DEPTH],
    fr: [-HALF_WIDTH, base, HALF_DEPTH],
    bl: [HALF_WIDTH, base, -HALF_DEPTH],
    br: [-HALF_WIDTH, base, -HALF_DEPTH],
    flTop: [HALF_WIDTH, shoulderHeight, HALF_DEPTH * 0.7],
    frTop: [-HALF_WIDTH, shoulderHeight, HALF_DEPTH * 0.7],
    blTop: [HALF_WIDTH, shoulderHeight, -HALF_DEPTH * 0.4],
    brTop: [-HALF_WIDTH, shoulderHeight, -HALF_DEPTH * 0.4],
    canopy: [0, canopyHeight, HALF_DEPTH * 0.55],
    nose: [0, shoulderHeight * 0.6, tipZ]
  };

  addQuad(vertices, corners.fl, corners.fr, corners.br, corners.bl, [0, -1, 0], COLORS.trim);
  addQuad(vertices, corners.fl, corners.flTop, corners.blTop, corners.bl, [1, 0, 0], COLORS.hull);
  addQuad(vertices, corners.br, corners.brTop, corners.frTop, corners.fr, [-1, 0, 0], COLORS.hull);
  addQuad(vertices, corners.bl, corners.blTop, corners.brTop, corners.br, [0, 0, -1], COLORS.trim);
  addQuad(vertices, corners.flTop, corners.frTop, corners.brTop, corners.blTop, [0, 1, 0], COLORS.hull);
  addTriangle(vertices, corners.flTop, corners.frTop, corners.nose, [0, 0.35, 1], COLORS.hull);
  addTriangle(vertices, corners.brTop, corners.blTop, corners.nose, [0, 0.2, 1], COLORS.trim);
  addTriangle(vertices, corners.flTop, corners.nose, corners.blTop, [0.35, 0.1, 0.94], COLORS.trim);
  addTriangle(vertices, corners.frTop, corners.brTop, corners.nose, [-0.35, 0.1, 0.94], COLORS.trim);
  addTriangle(vertices, corners.flTop, corners.canopy, corners.frTop, [0, 0.8, 0.6], COLORS.canopy);

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
    vertexCount: vertexData.length / FLOATS_PER_VERTEX
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

function writeTranslatedBounds(target, translation) {
  target.minX = LOCAL_BOUNDS.minX + translation[0];
  target.maxX = LOCAL_BOUNDS.maxX + translation[0];
  target.minY = LOCAL_BOUNDS.minY + translation[1];
  target.maxY = LOCAL_BOUNDS.maxY + translation[1];
  target.minZ = LOCAL_BOUNDS.minZ + translation[2];
  target.maxZ = LOCAL_BOUNDS.maxZ + translation[2];
}

function normalizeForward(out, x, z) {
  const length = Math.hypot(x, z);
  if (length < 1e-5) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 1;
    return out;
  }
  out[0] = x / length;
  out[1] = 0;
  out[2] = z / length;
  return out;
}

function computeRight(out, forward) {
  out[0] = forward[2];
  out[1] = 0;
  out[2] = -forward[0];
  const length = Math.hypot(out[0], out[2]);
  if (length < 1e-5) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    return out;
  }
  out[0] /= length;
  out[2] /= length;
  return out;
}

export function createFighter(device, options = {}) {
  if (!device) {
    throw new Error('A GPUDevice is required to create a fighter enemy.');
  }

  const geometry = createFighterGeometry(device);
  const translation = resolvePosition(options);
  const modelMatrix = new Float32Array(16);
  const forward = new Float32Array([0, 0, 1]);
  const right = new Float32Array(3);
  const up = new Float32Array([0, 1, 0]);
  const bounds = {
    minX: LOCAL_BOUNDS.minX + translation[0],
    maxX: LOCAL_BOUNDS.maxX + translation[0],
    minY: LOCAL_BOUNDS.minY + translation[1],
    maxY: LOCAL_BOUNDS.maxY + translation[1],
    minZ: LOCAL_BOUNDS.minZ + translation[2],
    maxZ: LOCAL_BOUNDS.maxZ + translation[2]
  };
  const hitBoxes = [{ bounds }];
  const maxHealth = resolveInitialHealth(options);
  let currentHealth = maxHealth;
  let isDead = false;
  let isAggro = false;

  const onDeath = typeof options.onDeath === 'function' ? options.onDeath : null;
  const onDamaged = typeof options.onDamaged === 'function' ? options.onDamaged : null;

  function syncTransform() {
    computeRight(right, forward);
    mat4FromRotationTranslation(modelMatrix, right, up, forward, translation);
    writeTranslatedBounds(bounds, translation);
  }

  function seekPlayer(deltaTime, context) {
    if (!context || !context.playerPosition) {
      return;
    }

    if (!isAggro && context.playerRoomKey && fighter.spawnContext?.roomKey) {
      if (context.playerRoomKey === fighter.spawnContext.roomKey) {
        isAggro = true;
      }
    }

    if (!isAggro) {
      return;
    }

    const target = context.playerPosition;
    const dx = target[0] - translation[0];
    const dz = target[2] - translation[2];
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-4) {
      return;
    }

    const directionX = dx / distance;
    const directionZ = dz / distance;
    const speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : DEFAULT_SPEED;
    const step = Math.min(distance, speed * deltaTime);

    translation[0] += directionX * step;
    translation[2] += directionZ * step;
    normalizeForward(forward, directionX, directionZ);
  }

  function takeDamage(amount, context = {}) {
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
        onDamaged({ enemy: fighter, damage: value, remainingHealth: currentHealth, context });
      } catch (error) {
        console.error('Error while handling fighter damage callback:', error);
      }
    }

    if (currentHealth === 0) {
      isDead = true;
      if (onDeath) {
        try {
          onDeath({ enemy: fighter, context });
        } catch (error) {
          console.error('Error while handling fighter death callback:', error);
        }
      }
    }
  }

  const fighter = {
    type: 'fighter',
    modelMatrix,
    vertexBuffer: geometry.vertexBuffer,
    vertexCount: geometry.vertexCount,
    position: translation,
    spawnContext: options.spawnContext ?? null,
    bounds,
    get health() {
      return currentHealth;
    },
    get maxHealth() {
      return maxHealth;
    },
    get isAggressive() {
      return isAggro;
    },
    getHitBoxes() {
      return hitBoxes;
    },
    update(deltaTime = 0, context = null) {
      const dt = Number(deltaTime);
      if (!Number.isFinite(dt) || dt <= 0) {
        return;
      }
      seekPlayer(dt, context);
      syncTransform();
    },
    takeDamage,
    onHit(impact) {
      if (isDead) {
        return;
      }
      const damage = resolveImpactDamage(impact);
      if (damage <= 0) {
        return;
      }
      takeDamage(damage, { impact });
    },
    destroy() {
      isDead = true;
      geometry.vertexBuffer.destroy?.();
    }
  };

  syncTransform();
  return fighter;
}
