import { mat4FromRotationTranslation } from '../../math.js';
import { traceRayAABB } from '../collisions.js';

const FLOATS_PER_VERTEX = 10;
const DEFAULT_HEALTH = 55;
const DEFAULT_IMPACT_DAMAGE = 8;
const DEFAULT_SWIVEL_SPEED = 0.65;
const DEFAULT_SWIVEL_AMPLITUDE = Math.PI / 6;
const VISION_CONE_MIN_RANGE = 1.5;
const VISION_CONE_MAX_RANGE = 15;
const VISION_CONE_HALF_ANGLE = Math.PI / 8;
const VISION_CONE_SEGMENTS = 2;
const VISION_CONE_FLOOR_OFFSET = 3.0;
const VISION_CONE_COLOR = [0.92, 0.78, 0.35];
const VISION_CONE_GLOW = 0.08;
const RECORDING_LIGHT_OFF_COLOR = [0.35, 0.16, 0.16];
const RECORDING_LIGHT_ON_COLOR = [0.94, 0.2, 0.2];
const RECORDING_LIGHT_OFF_GLOW = 0.05;
const RECORDING_LIGHT_ON_GLOW = 0.7;
const DEFAULT_PLAYER_RADIUS = 0.4;
const DEFAULT_PLAYER_HALF_HEIGHT = 1.0;
const OCCLUSION_PADDING = 0.15;
const ROOM_BOUNDARY_TOLERANCE = 1e-4;
const ROOM_DIRECTION_EPSILON = 1e-5;

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

const CAMERA_TILT_ANGLE = Math.PI / 11;
const CAMERA_TILT_PIVOT = Object.freeze([0, 0.02, 0.3]);

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

function pushVertex(target, position, normal, color, glow = 0) {
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
    glow
  );
}

function pushQuad(target, corners, normal, color, glow = 0) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color, glow);
  pushVertex(target, b, normal, color, glow);
  pushVertex(target, c, normal, color, glow);
  pushVertex(target, a, normal, color, glow);
  pushVertex(target, c, normal, color, glow);
  pushVertex(target, d, normal, color, glow);
}

function addBox(target, min, max, color, glow = 0, transform = null) {
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

  const pointTransform = transform && typeof transform.point === 'function' ? transform.point : null;
  if (pointTransform) {
    for (const key of Object.keys(corners)) {
      corners[key] = pointTransform(corners[key]);
    }
  }

  const baseNormals = {
    front: [0, 0, 1],
    back: [0, 0, -1],
    left: [-1, 0, 0],
    right: [1, 0, 0],
    top: [0, 1, 0],
    bottom: [0, -1, 0]
  };
  const normalTransform = transform && typeof transform.normal === 'function' ? transform.normal : null;
  if (normalTransform) {
    for (const key of Object.keys(baseNormals)) {
      baseNormals[key] = normalTransform(baseNormals[key]);
    }
  }

  pushQuad(target, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], baseNormals.front, color, glow);
  pushQuad(target, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], baseNormals.back, color, glow);
  pushQuad(target, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], baseNormals.left, color, glow);
  pushQuad(target, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], baseNormals.right, color, glow);
  pushQuad(target, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], baseNormals.top, color, glow);
  pushQuad(target, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], baseNormals.bottom, color, glow);
}

function addVisionCone(target, options = {}) {
  const metadata = options.metadata ?? null;
  const y = LOCAL_BOUNDS.minY - VISION_CONE_FLOOR_OFFSET;
  const normal = [0, 1, 0];
  const totalAngle = VISION_CONE_HALF_ANGLE * 2;
  const angleStep = totalAngle / VISION_CONE_SEGMENTS;
  const startAngle = -VISION_CONE_HALF_ANGLE;

  if (metadata) {
    metadata.floatOffset = target.length;
  }

  for (let i = 0; i < VISION_CONE_SEGMENTS; i += 1) {
    const angleA = startAngle + angleStep * i;
    const angleB = angleA + angleStep;
    const sinA = Math.sin(angleA);
    const cosA = Math.cos(angleA);
    const sinB = Math.sin(angleB);
    const cosB = Math.cos(angleB);
    const innerA = [sinA * VISION_CONE_MIN_RANGE, y, cosA * VISION_CONE_MIN_RANGE];
    const innerB = [sinB * VISION_CONE_MIN_RANGE, y, cosB * VISION_CONE_MIN_RANGE];
    const outerA = [sinA * VISION_CONE_MAX_RANGE, y, cosA * VISION_CONE_MAX_RANGE];
    const outerB = [sinB * VISION_CONE_MAX_RANGE, y, cosB * VISION_CONE_MAX_RANGE];

    pushVertex(target, innerA, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);
    const outerBOffsetA = target.length;
    pushVertex(target, outerB, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);
    pushVertex(target, innerB, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);

    pushVertex(target, innerA, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);
    const outerAOffset = target.length;
    pushVertex(target, outerA, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);
    const outerBOffsetB = target.length;
    pushVertex(target, outerB, normal, VISION_CONE_COLOR, VISION_CONE_GLOW);

    if (metadata) {
      metadata.outerVertices.push(
        { floatOffset: outerBOffsetA, sinAngle: sinB, cosAngle: cosB },
        { floatOffset: outerAOffset, sinAngle: sinA, cosAngle: cosA },
        { floatOffset: outerBOffsetB, sinAngle: sinB, cosAngle: cosB }
      );
    }
  }

  if (metadata) {
    metadata.floatCount = target.length - metadata.floatOffset;
  }
}

function normalizeLayerIndex(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return Math.trunc(number);
}

function overrideChunkColors(buffer, color, glow) {
  if (!buffer) {
    return;
  }
  for (let i = 0; i < buffer.length; i += FLOATS_PER_VERTEX) {
    buffer[i + 6] = color[0];
    buffer[i + 7] = color[1];
    buffer[i + 8] = color[2];
    buffer[i + 9] = glow;
  }
}

function createTiltTransform(pivot, angle) {
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  return {
    point(point) {
      const px = Number(point[0]);
      const py = Number(point[1]);
      const pz = Number(point[2]);
      const dx = px - pivot[0];
      const dy = py - pivot[1];
      const dz = pz - pivot[2];
      const rotatedY = dy * cosAngle - dz * sinAngle;
      const rotatedZ = dy * sinAngle + dz * cosAngle;
      return [pivot[0] + dx, pivot[1] + rotatedY, pivot[2] + rotatedZ];
    },
    normal(normal) {
      const ny = Number(normal[1]);
      const nz = Number(normal[2]);
      const rotatedY = ny * cosAngle - nz * sinAngle;
      const rotatedZ = ny * sinAngle + nz * cosAngle;
      return [normal[0], rotatedY, rotatedZ];
    }
  };
}

function createSecurityCameraGeometry(device, options = {}) {
  const vertices = [];
  let recordingLightFloatOffset = -1;
  let recordingLightFloatCount = 0;
  const tiltTransform = createTiltTransform(CAMERA_TILT_PIVOT, CAMERA_TILT_ANGLE);
  const includeVisionConeMetadata = Boolean(options.includeVisionConeMetadata);
  const visionConeMetadata = includeVisionConeMetadata
    ? { floatOffset: 0, floatCount: 0, outerVertices: [] }
    : null;

  // Corner mount and brace
  addBox(vertices, [-0.22, -0.35, -0.22], [0.22, -0.15, 0.1], COLORS.mount);
  addBox(vertices, [-0.18, -0.24, -0.5], [0.18, -0.05, -0.18], COLORS.brace);

  // Swivel arm
  addBox(vertices, [-0.08, -0.1, -0.05], [0.08, 0.06, 0.3], COLORS.brace);

  // Camera housing and lens
  addBox(vertices, [-0.22, -0.02, 0.3], [0.22, 0.2, 0.85], COLORS.housing, 0, tiltTransform);
  addBox(vertices, [-0.18, 0.02, 0.85], [0.18, 0.18, 0.98], COLORS.highlight, 0, tiltTransform);
  addBox(vertices, [-0.12, 0.05, 0.98], [0.12, 0.15, 1.05], COLORS.lens, 0, tiltTransform);

  recordingLightFloatOffset = vertices.length;
  addBox(
    vertices,
    [-0.05, 0.08, 0.9],
    [0.05, 0.16, 1.02],
    RECORDING_LIGHT_OFF_COLOR,
    RECORDING_LIGHT_OFF_GLOW,
    tiltTransform
  );
  recordingLightFloatCount = vertices.length - recordingLightFloatOffset;

  addVisionCone(vertices, { metadata: visionConeMetadata });

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  const geometry = {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX
  };

  if (recordingLightFloatCount > 0) {
    const offData = vertexData.slice(
      recordingLightFloatOffset,
      recordingLightFloatOffset + recordingLightFloatCount
    );
    const onData = offData.slice();
    overrideChunkColors(onData, RECORDING_LIGHT_ON_COLOR, RECORDING_LIGHT_ON_GLOW);
    geometry.recordingLight = {
      byteOffset: recordingLightFloatOffset * 4,
      byteLength: recordingLightFloatCount * 4,
      offData,
      onData
    };
  }

  if (visionConeMetadata && visionConeMetadata.floatCount > 0) {
    const start = visionConeMetadata.floatOffset;
    const end = start + visionConeMetadata.floatCount;
    const data = vertexData.slice(start, end);
    geometry.visionCone = {
      byteOffset: start * 4,
      floatCount: visionConeMetadata.floatCount,
      data,
      outerVertices: visionConeMetadata.outerVertices.map((entry) => ({
        floatOffset: entry.floatOffset - start,
        sinAngle: entry.sinAngle,
        cosAngle: entry.cosAngle
      }))
    };
  }

  return geometry;
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

function resolveRoomBounds(options = {}) {
  const source = options.roomBounds ?? null;
  if (!source || typeof source !== 'object') {
    return null;
  }
  const minX = Number(source.minX);
  const maxX = Number(source.maxX);
  const minZ = Number(source.minZ);
  const maxZ = Number(source.maxZ);
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ) ||
    minX >= maxX ||
    minZ >= maxZ
  ) {
    return null;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ
  };
}

function resolveRoomMaxHorizontalDistance(bounds, originX, originZ, dirX, dirZ) {
  if (!bounds) {
    return VISION_CONE_MAX_RANGE;
  }

  const resolveAxis = (direction, min, max, origin) => {
    if (direction > ROOM_DIRECTION_EPSILON) {
      return (max - origin) / direction;
    }
    if (direction < -ROOM_DIRECTION_EPSILON) {
      return (min - origin) / direction;
    }
    return Infinity;
  };

  const distanceX = resolveAxis(dirX, bounds.minX, bounds.maxX, originX);
  const distanceZ = resolveAxis(dirZ, bounds.minZ, bounds.maxZ, originZ);
  let distance = Math.min(distanceX, distanceZ);

  if (!(distance > 0) || !Number.isFinite(distance)) {
    if (distanceX > 0 && Number.isFinite(distanceX)) {
      distance = distanceX;
    } else if (distanceZ > 0 && Number.isFinite(distanceZ)) {
      distance = distanceZ;
    } else {
      distance = 0;
    }
  }

  return Math.min(Math.max(distance, 0), VISION_CONE_MAX_RANGE);
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

  const translation = resolvePosition(options);
  const roomBounds = resolveRoomBounds(options);
  const geometry = createSecurityCameraGeometry(device, {
    includeVisionConeMetadata: Boolean(roomBounds)
  });
  const layerResolver =
    typeof options.layerResolver === 'function' ? options.layerResolver : null;
  let cameraLayerIndex = normalizeLayerIndex(options.layerIndex);
  if (cameraLayerIndex === null && layerResolver) {
    cameraLayerIndex = normalizeLayerIndex(layerResolver(translation[1]));
  }
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
  const planarForward = new Float32Array(baseForward);
  const planarRight = new Float32Array(baseRight);
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
  const cosVisionHalfAngle = Math.cos(VISION_CONE_HALF_ANGLE);
  const toPlayer = new Float32Array(3);
  const horizontalToPlayer = new Float32Array(3);
  const occlusionDirection = new Float32Array(3);
  let planarForwardReady = false;
  let planarRightReady = false;
  let playerDetected = false;
  let recordingLightActive = false;
  const recordingLightMetadata = geometry.recordingLight ?? null;
  const visionConeMetadata = geometry.visionCone ?? null;

  function updateOrientation(yaw) {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);

    currentForward[0] = baseForward[0] * cosYaw + baseRight[0] * sinYaw;
    currentForward[1] = baseForward[1] * cosYaw + baseRight[1] * sinYaw;
    currentForward[2] = baseForward[2] * cosYaw + baseRight[2] * sinYaw;

    cross(currentRight, upAxis, currentForward);
    mat4FromRotationTranslation(modelMatrix, currentRight, upAxis, currentForward, translation);
    updateWorldBounds(worldBounds, translation, currentRight, upAxis, currentForward);
    const forwardDotUp =
      currentForward[0] * upAxis[0] + currentForward[1] * upAxis[1] + currentForward[2] * upAxis[2];
    planarForward[0] = currentForward[0] - forwardDotUp * upAxis[0];
    planarForward[1] = currentForward[1] - forwardDotUp * upAxis[1];
    planarForward[2] = currentForward[2] - forwardDotUp * upAxis[2];
    let planarLength = Math.hypot(planarForward[0], planarForward[1], planarForward[2]);
    if (planarLength <= 1e-5) {
      planarForward[0] = currentForward[0];
      planarForward[1] = currentForward[1];
      planarForward[2] = currentForward[2];
      planarLength = Math.hypot(planarForward[0], planarForward[1], planarForward[2]);
    }
    if (planarLength > 1e-5) {
      planarForward[0] /= planarLength;
      planarForward[1] /= planarLength;
      planarForward[2] /= planarLength;
      planarForwardReady = true;
    } else {
      planarForwardReady = false;
    }

    if (planarForwardReady) {
      planarRight[0] = currentRight[0];
      planarRight[1] = currentRight[1];
      planarRight[2] = currentRight[2];
      planarRightReady = true;
    } else {
      planarRightReady = false;
    }

    updateVisionConeIndicator();
  }

  updateOrientation(0);

  function resolveHorizontalRoomRange(dirX, dirZ) {
    if (!roomBounds) {
      return VISION_CONE_MAX_RANGE;
    }
    return resolveRoomMaxHorizontalDistance(roomBounds, translation[0], translation[2], dirX, dirZ);
  }

  function updateVisionConeIndicator() {
    if (
      !visionConeMetadata ||
      !visionConeMetadata.data ||
      !visionConeMetadata.outerVertices ||
      visionConeMetadata.outerVertices.length === 0 ||
      !roomBounds ||
      !planarForwardReady ||
      !planarRightReady
    ) {
      return;
    }

    const data = visionConeMetadata.data;
    let updated = false;

    for (let i = 0; i < visionConeMetadata.outerVertices.length; i += 1) {
      const entry = visionConeMetadata.outerVertices[i];
      const cosAngle = entry.cosAngle;
      const sinAngle = entry.sinAngle;
      const dirX = planarForward[0] * cosAngle + planarRight[0] * sinAngle;
      const dirZ = planarForward[2] * cosAngle + planarRight[2] * sinAngle;
      const range = resolveHorizontalRoomRange(dirX, dirZ);
      const newX = sinAngle * range;
      const newZ = cosAngle * range;
      const baseIndex = entry.floatOffset;
      const currentX = data[baseIndex];
      const currentZ = data[baseIndex + 2];
      if (Math.abs(currentX - newX) > 1e-4 || Math.abs(currentZ - newZ) > 1e-4) {
        data[baseIndex] = newX;
        data[baseIndex + 2] = newZ;
        updated = true;
      }
    }

    if (updated && geometry.vertexBuffer) {
      try {
        device.queue.writeBuffer(geometry.vertexBuffer, visionConeMetadata.byteOffset, data);
      } catch (error) {
        console.warn('Failed to update security camera vision indicator:', error);
      }
    }
  }

  function updateRecordingLight(active) {
    if (!recordingLightMetadata || recordingLightActive === active) {
      recordingLightActive = active;
      return;
    }
    recordingLightActive = active;
    const buffer = active ? recordingLightMetadata.onData : recordingLightMetadata.offData;
    if (!buffer || !geometry.vertexBuffer) {
      return;
    }
    try {
      device.queue.writeBuffer(
        geometry.vertexBuffer,
        recordingLightMetadata.byteOffset,
        buffer
      );
    } catch (error) {
      console.warn('Failed to update security camera recording light state:', error);
    }
  }

  function resolvePlayerLayerIndex(context, fallbackHeight) {
    if (!context) {
      return null;
    }
    const provided = normalizeLayerIndex(context.playerLayerIndex);
    if (provided !== null) {
      return provided;
    }
    if (layerResolver && Number.isFinite(fallbackHeight)) {
      return normalizeLayerIndex(layerResolver(fallbackHeight));
    }
    return null;
  }

  function evaluateDetection(context) {
    if (!context || !context.playerPosition) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    const playerPosition = context.playerPosition;
    const px = Number(playerPosition[0]);
    const py = Number(playerPosition[1]);
    const pz = Number(playerPosition[2]);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    if (roomBounds) {
      if (
        px < roomBounds.minX - ROOM_BOUNDARY_TOLERANCE ||
        px > roomBounds.maxX + ROOM_BOUNDARY_TOLERANCE ||
        pz < roomBounds.minZ - ROOM_BOUNDARY_TOLERANCE ||
        pz > roomBounds.maxZ + ROOM_BOUNDARY_TOLERANCE
      ) {
        if (playerDetected) {
          playerDetected = false;
          updateRecordingLight(false);
        }
        return;
      }
    }

    const playerLayerIndex = resolvePlayerLayerIndex(context, py);
    if (
      cameraLayerIndex !== null &&
      playerLayerIndex !== null &&
      playerLayerIndex !== cameraLayerIndex
    ) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    toPlayer[0] = px - translation[0];
    toPlayer[1] = py - translation[1];
    toPlayer[2] = pz - translation[2];

    const playerDistance = Math.hypot(toPlayer[0], toPlayer[1], toPlayer[2]);
    if (!(playerDistance > VISION_CONE_MIN_RANGE - 0.1)) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    const verticalProjection =
      toPlayer[0] * upAxis[0] + toPlayer[1] * upAxis[1] + toPlayer[2] * upAxis[2];
    horizontalToPlayer[0] = toPlayer[0] - verticalProjection * upAxis[0];
    horizontalToPlayer[1] = toPlayer[1] - verticalProjection * upAxis[1];
    horizontalToPlayer[2] = toPlayer[2] - verticalProjection * upAxis[2];
    const horizontalDistance = Math.hypot(
      horizontalToPlayer[0],
      horizontalToPlayer[1],
      horizontalToPlayer[2]
    );

    if (horizontalDistance < VISION_CONE_MIN_RANGE || !planarForwardReady) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    const invHorizontal = horizontalDistance > 1e-5 ? 1 / horizontalDistance : 0;
    const normalizedHX = horizontalToPlayer[0] * invHorizontal;
    const normalizedHY = horizontalToPlayer[1] * invHorizontal;
    const normalizedHZ = horizontalToPlayer[2] * invHorizontal;
    const alignment =
      normalizedHX * planarForward[0] +
      normalizedHY * planarForward[1] +
      normalizedHZ * planarForward[2];

    if (alignment < cosVisionHalfAngle) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    const maxHorizontalDistance = resolveHorizontalRoomRange(normalizedHX, normalizedHZ);
    if (!(maxHorizontalDistance > VISION_CONE_MIN_RANGE - 1e-3)) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    if (horizontalDistance > maxHorizontalDistance + 1e-4) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    const playerRadius = Number(context.playerRadius) || DEFAULT_PLAYER_RADIUS;
    const playerHalfHeight = Number(context.playerHalfHeight) || DEFAULT_PLAYER_HALF_HEIGHT;
    const targetY = py + playerHalfHeight * 0.25;
    const targetVectorY = targetY - translation[1];
    const targetDistance = Math.hypot(
      toPlayer[0],
      targetVectorY,
      toPlayer[2]
    );
    if (!(targetDistance > 0.5)) {
      if (playerDetected) {
        playerDetected = false;
        updateRecordingLight(false);
      }
      return;
    }

    occlusionDirection[0] = toPlayer[0] / targetDistance;
    occlusionDirection[1] = targetVectorY / targetDistance;
    occlusionDirection[2] = toPlayer[2] / targetDistance;

    let occluded = false;
    const staticColliders = Array.isArray(context.staticColliders) ? context.staticColliders : null;
    if (staticColliders && staticColliders.length > 0) {
      const maxDistance = Math.max(targetDistance - playerRadius - OCCLUSION_PADDING, 0);
      for (let i = 0; i < staticColliders.length; i += 1) {
        const bounds = staticColliders[i];
        if (!bounds) {
          continue;
        }
        const hit = traceRayAABB(translation, occlusionDirection, maxDistance, bounds);
        if (hit) {
          occluded = true;
          break;
        }
      }
    }

    const detected = !occluded;
    if (detected !== playerDetected) {
      playerDetected = detected;
      updateRecordingLight(detected);
    }
  }

  const camera = {
    type: 'security-camera',
    modelMatrix,
    vertexBuffer: geometry.vertexBuffer,
    vertexCount: geometry.vertexCount,
    position: translation,
    forward: currentForward,
    up: upAxis,
    bounds: worldBounds,
    roomBounds,
    isPlayerDetected() {
      return playerDetected;
    },
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
    update(deltaTime, context) {
      if (!Number.isFinite(deltaTime) || swivelSpeed <= 0 || swivelAmplitude <= 0) {
        evaluateDetection(context ?? null);
        return;
      }
      swivelPhase += deltaTime * swivelSpeed;
      updateOrientation(Math.sin(swivelPhase) * swivelAmplitude);
      evaluateDetection(context ?? null);
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
      geometry.vertexBuffer = null;
      if (recordingLightMetadata) {
        recordingLightMetadata.offData = null;
        recordingLightMetadata.onData = null;
      }
      if (visionConeMetadata) {
        visionConeMetadata.data = null;
        visionConeMetadata.outerVertices = null;
      }
    }
  };

  return camera;
}
