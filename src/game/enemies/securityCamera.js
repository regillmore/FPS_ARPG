import { mat4FromRotationTranslation } from '../../math.js';

const FLOATS_PER_VERTEX = 10;
const DEFAULT_HEALTH = 55;
const DEFAULT_IMPACT_DAMAGE = 8;
const DEFAULT_SWIVEL_SPEED = 0.65;
const DEFAULT_SWIVEL_AMPLITUDE = Math.PI / 6;

const COLORS = Object.freeze({
  mount: [0.32, 0.34, 0.36],
  brace: [0.4, 0.42, 0.45],
  housing: [0.86, 0.88, 0.92],
  highlight: [0.92, 0.94, 0.98],
  lens: [0.12, 0.14, 0.24]
});

const DEFAULT_POSITION = Object.freeze([0, 0, 0]);
const DEFAULT_FORWARD = Object.freeze([0, 0, -1]);
const DEFAULT_UP = Object.freeze([0, 1, 0]);

const LOCAL_BOUNDS = Object.freeze({
  minX: -0.25,
  maxX: 0.25,
  minY: -0.35,
  maxY: 0.2,
  minZ: -0.55,
  maxZ: 1.0
});

const LOCAL_BOUND_CORNERS = [
  [LOCAL_BOUNDS.minX, LOCAL_BOUNDS.minY, LOCAL_BOUNDS.minZ],
  [LOCAL_BOUNDS.minX, LOCAL_BOUNDS.minY, LOCAL_BOUNDS.maxZ],
  [LOCAL_BOUNDS.minX, LOCAL_BOUNDS.maxY, LOCAL_BOUNDS.minZ],
  [LOCAL_BOUNDS.minX, LOCAL_BOUNDS.maxY, LOCAL_BOUNDS.maxZ],
  [LOCAL_BOUNDS.maxX, LOCAL_BOUNDS.minY, LOCAL_BOUNDS.minZ],
  [LOCAL_BOUNDS.maxX, LOCAL_BOUNDS.minY, LOCAL_BOUNDS.maxZ],
  [LOCAL_BOUNDS.maxX, LOCAL_BOUNDS.maxY, LOCAL_BOUNDS.minZ],
  [LOCAL_BOUNDS.maxX, LOCAL_BOUNDS.maxY, LOCAL_BOUNDS.maxZ]
];

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

function pushQuad(target, corners, normal, color) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, d, normal, color);
}

function addBox(target, min, max, color) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const corners = {
    nbl: [minX, minY, minZ],
    nbr: [maxX, minY, minZ],
    ntl: [minX, maxY, minZ],
    ntr: [maxX, maxY, minZ],
    fbl: [minX, minY, maxZ],
    fbr: [maxX, minY, maxZ],
    ftl: [minX, maxY, maxZ],
    ftr: [maxX, maxY, maxZ]
  };

  pushQuad(target, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], [0, 0, 1], color);
  pushQuad(target, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], [0, 0, -1], color);
  pushQuad(target, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], [-1, 0, 0], color);
  pushQuad(target, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], [1, 0, 0], color);
  pushQuad(target, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], [0, 1, 0], color);
  pushQuad(target, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], [0, -1, 0], color);
}

function createSecurityCameraGeometry(device) {
  const vertices = [];

  // Corner mount and brace
  addBox(vertices, [-0.22, -0.35, -0.22], [0.22, -0.15, 0.1], COLORS.mount);
  addBox(vertices, [-0.18, -0.24, -0.5], [0.18, -0.05, -0.18], COLORS.brace);

  // Swivel arm
  addBox(vertices, [-0.08, -0.1, -0.05], [0.08, 0.06, 0.3], COLORS.brace);

  // Camera housing and lens
  addBox(vertices, [-0.22, -0.02, 0.3], [0.22, 0.2, 0.85], COLORS.housing);
  addBox(vertices, [-0.18, 0.02, 0.85], [0.18, 0.18, 0.98], COLORS.highlight);
  addBox(vertices, [-0.12, 0.05, 0.98], [0.12, 0.15, 1.05], COLORS.lens);

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
  const base = Array.isArray(options.position) || ArrayBuffer.isView(options.position) ? options.position : DEFAULT_POSITION;
  const baseX = Number(base[0]);
  const baseY = Number(base[1]);
  const baseZ = Number(base[2]);
  const x = Number.isFinite(options.x) ? options.x : baseX;
  const y = Number.isFinite(options.y) ? options.y : baseY;
  const z = Number.isFinite(options.z) ? options.z : baseZ;
  return new Float32Array([
    Number.isFinite(x) ? x : DEFAULT_POSITION[0],
    Number.isFinite(y) ? y : DEFAULT_POSITION[1],
    Number.isFinite(z) ? z : DEFAULT_POSITION[2]
  ]);
}

function normalizeVector(source, fallback) {
  const candidate = tryNormalize(source) ?? tryNormalize(fallback);
  if (candidate) {
    return candidate;
  }
  return new Float32Array(fallback ?? DEFAULT_FORWARD);
}

function tryNormalize(input) {
  if (!input || typeof input !== 'object') {
    return null;
  }
  const arrayLike = Array.isArray(input) || ArrayBuffer.isView(input) ? input : null;
  if (!arrayLike) {
    return null;
  }
  const x = Number(arrayLike[0]);
  const y = Number(arrayLike[1]);
  const z = Number(arrayLike[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-5)) {
    return null;
  }
  return new Float32Array([x / length, y / length, z / length]);
}

function cross(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  const length = Math.hypot(out[0], out[1], out[2]);
  if (length > 1e-5) {
    out[0] /= length;
    out[1] /= length;
    out[2] /= length;
  }
}

function updateWorldBounds(target, translation, right, up, forward) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < LOCAL_BOUND_CORNERS.length; i += 1) {
    const corner = LOCAL_BOUND_CORNERS[i];
    const worldX =
      translation[0] + corner[0] * right[0] + corner[1] * up[0] + corner[2] * forward[0];
    const worldY =
      translation[1] + corner[0] * right[1] + corner[1] * up[1] + corner[2] * forward[1];
    const worldZ =
      translation[2] + corner[0] * right[2] + corner[1] * up[2] + corner[2] * forward[2];

    minX = Math.min(minX, worldX);
    minY = Math.min(minY, worldY);
    minZ = Math.min(minZ, worldZ);
    maxX = Math.max(maxX, worldX);
    maxY = Math.max(maxY, worldY);
    maxZ = Math.max(maxZ, worldZ);
  }

  target.minX = minX;
  target.minY = minY;
  target.minZ = minZ;
  target.maxX = maxX;
  target.maxY = maxY;
  target.maxZ = maxZ;
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

function resolveSwivelSpeed(options = {}) {
  const value = Number(options.swivelSpeed);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_SWIVEL_SPEED;
  }
  return value;
}

function resolveSwivelAmplitude(options = {}) {
  const value = Number(options.swivelAmplitude);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_SWIVEL_AMPLITUDE;
  }
  return Math.min(value, Math.PI / 3);
}

export function createSecurityCamera(device, options = {}) {
  if (!device) {
    throw new Error('A GPUDevice is required to create a security camera.');
  }

  const geometry = createSecurityCameraGeometry(device);
  const translation = resolvePosition(options);
  const forwardAxis = normalizeVector(options.forward, DEFAULT_FORWARD);
  const upAxis = normalizeVector(options.up, DEFAULT_UP);
  const baseRight = new Float32Array(3);
  cross(baseRight, upAxis, forwardAxis);
  if (Math.hypot(baseRight[0], baseRight[1], baseRight[2]) <= 1e-5) {
    baseRight[0] = 1;
    baseRight[1] = 0;
    baseRight[2] = 0;
  }
  const baseForward = new Float32Array(forwardAxis);
  const currentRight = new Float32Array(baseRight);
  const currentForward = new Float32Array(baseForward);
  const modelMatrix = new Float32Array(16);
  const worldBounds = {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    minZ: 0,
    maxZ: 0
  };

  const hitBoxes = [
    {
      bounds: worldBounds,
      onHit(impact) {
        camera.onHit(impact);
      }
    }
  ];

  const maxHealth = resolveInitialHealth(options);
  let currentHealth = maxHealth;
  let isDestroyed = false;
  const onDeath = typeof options.onDeath === 'function' ? options.onDeath : null;
  const onDamaged = typeof options.onDamaged === 'function' ? options.onDamaged : null;
  const swivelSpeed = resolveSwivelSpeed(options);
  const swivelAmplitude = resolveSwivelAmplitude(options);
  let swivelPhase = Number.isFinite(options.swivelPhase) ? options.swivelPhase : Math.random() * Math.PI * 2;

  function updateOrientation(yaw) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    currentForward[0] = baseForward[0] * cosYaw + baseRight[0] * sinYaw;
    currentForward[1] = baseForward[1] * cosYaw + baseRight[1] * sinYaw;
    currentForward[2] = baseForward[2] * cosYaw + baseRight[2] * sinYaw;

    cross(currentRight, upAxis, currentForward);
    mat4FromRotationTranslation(modelMatrix, currentRight, upAxis, currentForward, translation);
    updateWorldBounds(worldBounds, translation, currentRight, upAxis, currentForward);
  }

  updateOrientation(0);

  const camera = {
    type: 'security-camera',
    modelMatrix,
    vertexBuffer: geometry.vertexBuffer,
    vertexCount: geometry.vertexCount,
    position: translation,
    forward: currentForward,
    up: upAxis,
    bounds: worldBounds,
    get health() {
      return currentHealth;
    },
    get maxHealth() {
      return maxHealth;
    },
    isDestroyed() {
      return isDestroyed;
    },
    getHitBoxes() {
      return hitBoxes;
    },
    update(deltaTime) {
      if (!Number.isFinite(deltaTime) || swivelSpeed <= 0 || swivelAmplitude <= 0) {
        return;
      }
      swivelPhase += deltaTime * swivelSpeed;
      updateOrientation(Math.sin(swivelPhase) * swivelAmplitude);
    },
    takeDamage(amount, context = {}) {
      if (isDestroyed) {
        return;
      }
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      currentHealth = Math.max(currentHealth - value, 0);
      if (onDamaged) {
        try {
          onDamaged({ enemy: camera, damage: value, remainingHealth: currentHealth, context });
        } catch (error) {
          console.error('Error while handling security camera damage callback:', error);
        }
      }
      if (currentHealth === 0) {
        isDestroyed = true;
        if (onDeath) {
          try {
            onDeath({ enemy: camera, context });
          } catch (error) {
            console.error('Error while handling security camera death callback:', error);
          }
        }
      }
    },
    onHit(impact) {
      if (isDestroyed) {
        return;
      }
      const damage = resolveImpactDamage(impact);
      if (damage <= 0) {
        return;
      }
      camera.takeDamage(damage, { impact });
    },
    destroy() {
      isDestroyed = true;
      geometry.vertexBuffer.destroy?.();
    }
  };

  return camera;
}
