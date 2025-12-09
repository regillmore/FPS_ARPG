import { mat4FromRotationTranslation } from '../../math.js';
import { resolveCapsuleCollisions } from '../playerCollisions.js';

const FLOATS_PER_VERTEX = 10;
const HALF_WIDTH = 0.15;
const HALF_DEPTH = 0.10;
const BODY_HEIGHT = 1.5;
const DEFAULT_HEALTH = 50;
const DEFAULT_SPEED = 2.8;
const DEFAULT_IMPACT_DAMAGE = 6;

const COLORS = Object.freeze({
  hull: [0.78, 0.84, 0.9],
  trim: [0.18, 0.24, 0.32],
  accent: [0.78, 0.84, 0.9],
  visor: [0.9, 0.96, 1]
});

const LOCAL_BOUNDS = Object.freeze({
  minX: -HALF_WIDTH,
  maxX: HALF_WIDTH,
  minY: 0,
  maxY: BODY_HEIGHT,
  minZ: -HALF_DEPTH,
  maxZ: HALF_DEPTH
});

const FIGHTER_COLLISION_RADIUS = Math.max(HALF_WIDTH, HALF_DEPTH);
const FIGHTER_COLLISION_HALF_HEIGHT = BODY_HEIGHT * 0.5;
const PATH_REBUILD_INTERVAL = 0.35;
const WAYPOINT_REACHED_DISTANCE = 0.35;
const DOOR_OPEN_DISTANCE = 2.5;
const LEG_SWING_AMPLITUDE = Math.PI / 6;
const LEG_STILLNESS_DECAY = 6;
const directionOffsets = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0]
};
const oppositeDirections = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east'
};

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

function addBoxVertices(target, min, max, color, glow = 0) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;

  addQuad(target, [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ], [0, 0, 1], color);
  addQuad(target, [maxX, minY, minZ], [minX, minY, minZ], [minX, maxY, minZ], [maxX, maxY, minZ], [0, 0, -1], color);
  addQuad(target, [minX, minY, minZ], [minX, minY, maxZ], [minX, maxY, maxZ], [minX, maxY, minZ], [-1, 0, 0], color);
  addQuad(target, [maxX, minY, maxZ], [maxX, minY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [1, 0, 0], color);
  addQuad(target, [minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ], [minX, maxY, minZ], [0, 1, 0], color, glow);
  addQuad(target, [minX, minY, minZ], [maxX, minY, minZ], [maxX, minY, maxZ], [minX, minY, maxZ], [0, -1, 0], color);
}

function addBoxTemplate(target, min, max, color, glow = 0) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;

  const faces = [
    {
      normal: [0, 0, 1], corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 0, -1], corners: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ]
      ]
    },
    {
      normal: [-1, 0, 0], corners: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [1, 0, 0], corners: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 1, 0], corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ]
    },
    {
      normal: [0, -1, 0], corners: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    }
  ];

  for (const face of faces) {
    const [a, b, c, d] = face.corners;
    target.push(
      { position: [...a], normal: [...face.normal], color, glow },
      { position: [...b], normal: [...face.normal], color, glow },
      { position: [...c], normal: [...face.normal], color, glow },
      { position: [...a], normal: [...face.normal], color, glow },
      { position: [...c], normal: [...face.normal], color, glow },
      { position: [...d], normal: [...face.normal], color, glow }
    );
  }
}

function applyTransform(position, rotation, translation) {
  const x = position[0];
  const y = position[1];
  const z = position[2];
  return [
    rotation[0] * x + rotation[1] * y + rotation[2] * z + translation[0],
    rotation[3] * x + rotation[4] * y + rotation[5] * z + translation[1],
    rotation[6] * x + rotation[7] * y + rotation[8] * z + translation[2]
  ];
}

function composeLegTransform(angle, origin) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    rotation: [1, 0, 0, 0, c, -s, 0, s, c],
    translation: origin
  };
}

function writeTemplate(target, offset, template, transform) {
  let cursor = offset;
  for (const vert of template) {
    const transformedPosition = applyTransform(vert.position, transform.rotation, transform.translation);
    const transformedNormal = applyTransform(vert.normal, transform.rotation, [0, 0, 0]);
    target[cursor + 0] = transformedPosition[0];
    target[cursor + 1] = transformedPosition[1];
    target[cursor + 2] = transformedPosition[2];
    target[cursor + 3] = transformedNormal[0];
    target[cursor + 4] = transformedNormal[1];
    target[cursor + 5] = transformedNormal[2];
    target[cursor + 6] = vert.color[0];
    target[cursor + 7] = vert.color[1];
    target[cursor + 8] = vert.color[2];
    target[cursor + 9] = vert.glow;
    cursor += FLOATS_PER_VERTEX;
  }
}

function createFighterGeometry(device) {
  const staticVertices = [];
  const legTemplates = { left: {}, right: {} };

  const torsoHeight = BODY_HEIGHT * 0.25;
  const hipHeight = BODY_HEIGHT * 0.3;
  const headHeight = BODY_HEIGHT * 0.2;
  const shoulderHeight = hipHeight + torsoHeight;
  const torsoWidth = HALF_WIDTH * 1.3;
  const torsoDepth = HALF_DEPTH * 1.4;
  const armLength = BODY_HEIGHT * 0.25;
  const armThickness = HALF_WIDTH * 0.4;
  const visorGlow = 1.0;

  addBoxVertices(
    staticVertices,
    [-torsoWidth * 0.5, hipHeight, -torsoDepth * 0.5],
    [torsoWidth * 0.5, hipHeight + torsoHeight, torsoDepth * 0.5],
    COLORS.hull
  );

  addBoxVertices(
    staticVertices,
    [
      -torsoWidth * 0.4,
      shoulderHeight,
      -torsoDepth * 0.45
    ],
    [
      torsoWidth * 0.4,
      shoulderHeight + headHeight,
      torsoDepth * 0.2
    ],
    COLORS.trim
  );

  addBoxVertices(
    staticVertices,
    [-torsoWidth * 0.18, shoulderHeight + headHeight * 0.35, torsoDepth * 0.2],
    [torsoWidth * 0.18, shoulderHeight + headHeight * 0.7, torsoDepth * 0.45],
    COLORS.visor,
    visorGlow
  );

  addBoxVertices(
    staticVertices,
    [torsoWidth * 0.5, shoulderHeight - armThickness * 0.5, -armThickness],
    [torsoWidth * 0.5 + armLength, shoulderHeight + armThickness * 0.5, armThickness],
    COLORS.trim
  );

  addBoxVertices(
    staticVertices,
    [-torsoWidth * 0.5 - armLength, shoulderHeight - armThickness * 0.5, -armThickness],
    [-torsoWidth * 0.5, shoulderHeight + armThickness * 0.5, armThickness],
    COLORS.trim
  );

  const legWidth = HALF_WIDTH * 0.35;
  const legDepth = HALF_DEPTH * 0.4;
  const thighLength = BODY_HEIGHT * 0.15;
  const shinLength = BODY_HEIGHT * 0.12;
  const footHeight = BODY_HEIGHT * 0.06;
  const hipOffsetX = torsoWidth * 0.35;
  const hipOriginY = thighLength + shinLength + footHeight;

  addBoxTemplate(
    legTemplates.left.thigh ?? (legTemplates.left.thigh = []),
    [-legWidth, -thighLength, -legDepth],
    [legWidth, 0, legDepth],
    COLORS.trim
  );
  addBoxTemplate(
    legTemplates.left.shin ?? (legTemplates.left.shin = []),
    [-legWidth * 0.85, -shinLength, -legDepth * 1.05],
    [legWidth * 0.85, 0, legDepth * 1.1],
    COLORS.trim
  );
  addBoxTemplate(
    legTemplates.left.shin,
    [-legWidth * 0.9, -shinLength - footHeight, -legDepth * 1.4],
    [legWidth * 0.9, -shinLength, legDepth * 1.6],
    COLORS.accent
  );

  addBoxTemplate(
    legTemplates.right.thigh ?? (legTemplates.right.thigh = []),
    [-legWidth, -thighLength, -legDepth],
    [legWidth, 0, legDepth],
    COLORS.trim
  );
  addBoxTemplate(
    legTemplates.right.shin ?? (legTemplates.right.shin = []),
    [-legWidth * 0.85, -shinLength, -legDepth * 1.05],
    [legWidth * 0.85, 0, legDepth * 1.1],
    COLORS.trim
  );
  addBoxTemplate(
    legTemplates.right.shin,
    [-legWidth * 0.9, -shinLength - footHeight, -legDepth * 1.4],
    [legWidth * 0.9, -shinLength, legDepth * 1.6],
    COLORS.accent
  );

  const staticFloatCount = staticVertices.length;
  const leftThighFloatCount = legTemplates.left.thigh.length * FLOATS_PER_VERTEX;
  const leftShinFloatCount = legTemplates.left.shin.length * FLOATS_PER_VERTEX;
  const rightThighFloatCount = legTemplates.right.thigh.length * FLOATS_PER_VERTEX;
  const rightShinFloatCount = legTemplates.right.shin.length * FLOATS_PER_VERTEX;
  const vertexData = new Float32Array(
    staticFloatCount + leftThighFloatCount + leftShinFloatCount + rightThighFloatCount + rightShinFloatCount
  );

  vertexData.set(staticVertices, 0);

  const leftThighOffset = staticFloatCount;
  const leftShinOffset = leftThighOffset + leftThighFloatCount;
  const rightThighOffset = leftShinOffset + leftShinFloatCount;
  const rightShinOffset = rightThighOffset + rightThighFloatCount;

  const kneeLocalOffset = [0, -thighLength, 0];
  const leftHipTransform = composeLegTransform(0, [hipOffsetX, hipOriginY, 0]);
  const rightHipTransform = composeLegTransform(0, [-hipOffsetX, hipOriginY, 0]);
  const leftKneePosition = applyTransform(kneeLocalOffset, leftHipTransform.rotation, leftHipTransform.translation);
  const rightKneePosition = applyTransform(kneeLocalOffset, rightHipTransform.rotation, rightHipTransform.translation);

  writeTemplate(vertexData, leftThighOffset, legTemplates.left.thigh, leftHipTransform);
  writeTemplate(vertexData, leftShinOffset, legTemplates.left.shin, composeLegTransform(0, leftKneePosition));

  writeTemplate(vertexData, rightThighOffset, legTemplates.right.thigh, rightHipTransform);
  writeTemplate(vertexData, rightShinOffset, legTemplates.right.shin, composeLegTransform(0, rightKneePosition));
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  function updateLegPose(leftAngle, rightAngle, gait = 1) {
    const bendFactor = Math.max(0, Math.min(Number.isFinite(gait) ? gait : 0, 1));
    const leftHipTransform = composeLegTransform(leftAngle, [hipOffsetX, hipOriginY, 0]);
    const rightHipTransform = composeLegTransform(rightAngle, [-hipOffsetX, hipOriginY, 0]);

    const leftKneeAngle = Math.abs(leftAngle) * 0.9 * bendFactor + 0.2 * bendFactor;
    const rightKneeAngle = Math.abs(rightAngle) * 0.9 * bendFactor + 0.2 * bendFactor;

    const leftKneePosition = applyTransform(kneeLocalOffset, leftHipTransform.rotation, leftHipTransform.translation);
    const rightKneePosition = applyTransform(kneeLocalOffset, rightHipTransform.rotation, rightHipTransform.translation);

    writeTemplate(vertexData, leftThighOffset, legTemplates.left.thigh, leftHipTransform);
    writeTemplate(
      vertexData,
      leftShinOffset,
      legTemplates.left.shin,
      composeLegTransform(leftAngle + leftKneeAngle, leftKneePosition)
    );

    writeTemplate(vertexData, rightThighOffset, legTemplates.right.thigh, rightHipTransform);
    writeTemplate(
      vertexData,
      rightShinOffset,
      legTemplates.right.shin,
      composeLegTransform(rightAngle + rightKneeAngle, rightKneePosition)
    );

    device.queue.writeBuffer(
      vertexBuffer,
      leftThighOffset * Float32Array.BYTES_PER_ELEMENT,
      vertexData.subarray(leftThighOffset, leftThighOffset + leftThighFloatCount)
    );

    device.queue.writeBuffer(
      vertexBuffer,
      leftShinOffset * Float32Array.BYTES_PER_ELEMENT,
      vertexData.subarray(leftShinOffset, leftShinOffset + leftShinFloatCount)
    );

    device.queue.writeBuffer(
      vertexBuffer,
      rightThighOffset * Float32Array.BYTES_PER_ELEMENT,
      vertexData.subarray(rightThighOffset, rightThighOffset + rightThighFloatCount)
    );

    device.queue.writeBuffer(
      vertexBuffer,
      rightShinOffset * Float32Array.BYTES_PER_ELEMENT,
      vertexData.subarray(rightShinOffset, rightShinOffset + rightShinFloatCount)
    );
  }

  return {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX,
    updateLegPose
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

function rayIntersectsBox(origin, direction, maxDistance, box) {
  const dirX = direction[0];
  const dirY = direction[1];
  const dirZ = direction[2];

  const minX = box.minX;
  const minY = box.minY;
  const minZ = box.minZ;
  const maxX = box.maxX;
  const maxY = box.maxY;
  const maxZ = box.maxZ;

  let tMin = 0;
  let tMax = maxDistance;

  if (Math.abs(dirX) < 1e-6) {
    if (origin[0] < minX || origin[0] > maxX) return false;
  } else {
    const invDirX = 1 / dirX;
    let t1 = (minX - origin[0]) * invDirX;
    let t2 = (maxX - origin[0]) * invDirX;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dirY) < 1e-6) {
    if (origin[1] < minY || origin[1] > maxY) return false;
  } else {
    const invDirY = 1 / dirY;
    let t1 = (minY - origin[1]) * invDirY;
    let t2 = (maxY - origin[1]) * invDirY;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  if (Math.abs(dirZ) < 1e-6) {
    if (origin[2] < minZ || origin[2] > maxZ) return false;
  } else {
    const invDirZ = 1 / dirZ;
    let t1 = (minZ - origin[2]) * invDirZ;
    let t2 = (maxZ - origin[2]) * invDirZ;
    if (t1 > t2) { const temp = t1; t1 = t2; t2 = temp; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }

  return true;
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
  const hitBoxes = [];
  const maxHealth = resolveInitialHealth(options);
  let currentHealth = maxHealth;
  let isDead = false;
  let isAggro = false;
  let lastUpdateContext = null;

  const onDeath = typeof options.onDeath === 'function' ? options.onDeath : null;
  const onDamaged = typeof options.onDamaged === 'function' ? options.onDamaged : null;
  const collisionScratch = [];
  const collisionPosition = new Float32Array(3);
  const pathState = {
    waypoints: [],
    waypointIndex: 0,
    lastPlayerCellKey: '',
    lastEnemyCellKey: '',
    rebuildTimer: 0
  };
  const originCellKey = resolveOriginCellKey(options.spawnContext);
  let legPhase = Math.random() * Math.PI * 2;
  let legMotion = 0;
  let legsUpdatedThisFrame = false;

  function layeredCellKey(cell) {
    if (!cell) {
      return '';
    }
    return `${cell.layerIndex}:${cell.cellX},${cell.cellZ}`;
  }

  function resolveOriginCellKey(spawnContext) {
    const key = typeof spawnContext?.roomKey === 'string' ? spawnContext.roomKey : '';
    if (!key) {
      return '';
    }
    const separatorIndex = key.indexOf(':');
    return separatorIndex >= 0 ? key.slice(separatorIndex + 1) : key;
  }

  function hasDiscoveredOriginCell(visibleCells) {
    if (!originCellKey) {
      return false;
    }

    if (!visibleCells || typeof visibleCells.has !== 'function') {
      return false;
    }

    return visibleCells.has(originCellKey);
  }

  function clearPath() {
    pathState.waypoints.length = 0;
    pathState.waypointIndex = 0;
  }

  function gatherColliders(context) {
    collisionScratch.length = 0;

    if (Array.isArray(context?.staticColliders)) {
      for (let i = 0; i < context.staticColliders.length; i += 1) {
        const collider = context.staticColliders[i];
        if (collider) {
          collisionScratch.push(collider);
        }
      }
    }

    if (Array.isArray(context?.doorColliders)) {
      for (let i = 0; i < context.doorColliders.length; i += 1) {
        const collider = context.doorColliders[i];
        if (collider) {
          collisionScratch.push(collider);
        }
      }
    }

    return collisionScratch;
  }

  function resolveCollisions(context) {
    const colliders = gatherColliders(context);
    if (colliders.length === 0) {
      return colliders;
    }

    collisionPosition[0] = translation[0];
    collisionPosition[1] = translation[1] + FIGHTER_COLLISION_HALF_HEIGHT;
    collisionPosition[2] = translation[2];

    resolveCapsuleCollisions(
      collisionPosition,
      colliders,
      FIGHTER_COLLISION_RADIUS,
      FIGHTER_COLLISION_HALF_HEIGHT
    );

    translation[0] = collisionPosition[0];
    translation[1] = collisionPosition[1] - FIGHTER_COLLISION_HALF_HEIGHT;
    translation[2] = collisionPosition[2];

    return colliders;
  }

  function requestDoorOpen(doorId, context) {
    if (!doorId || typeof context?.requestDoorOpen !== 'function') {
      return;
    }

    if (Array.isArray(context.activeDoors)) {
      const matchingDoors = context.activeDoors.filter((entry) => {
        if (!entry) {
          return false;
        }
        return (
          entry.id === doorId ||
          entry.anchor?.id === doorId ||
          (doorId && typeof entry.id === 'string' && entry.id.startsWith(`${doorId}:`))
        );
      });

      if (matchingDoors.length > 0) {
        let pendingRequest = false;
        for (const door of matchingDoors) {
          if (door.state === 'open') {
            continue;
          }
          context.requestDoorOpen(door.id, translation);
          pendingRequest = true;
        }

        if (!pendingRequest) {
          return;
        }

        return;
      }
    }

    context.requestDoorOpen(doorId, translation);
  }

  function buildCellPath(nav, startCell, goalCell) {
    if (!nav) {
      return null;
    }

    const startKey = layeredCellKey(startCell);
    const goalKey = layeredCellKey(goalCell);
    if (!startKey || !goalKey) {
      return null;
    }

    if (startKey === goalKey) {
      return [startCell];
    }

    const queue = [startCell];
    const cameFrom = new Map([[startKey, null]]);
    const cellByKey = new Map([[startKey, startCell]]);
    const searchRadius = Math.max(1, Math.floor(nav.generationRadius ?? 6));

    while (queue.length > 0 && !cameFrom.has(goalKey)) {
      const cell = queue.shift();
      if (!cell) {
        continue;
      }

      const edges = typeof nav.getCellEdges === 'function'
        ? nav.getCellEdges(cell.cellX, cell.cellZ)
        : null;
      if (!edges) {
        continue;
      }

      for (const direction of Object.keys(directionOffsets)) {
        const state = edges[direction];
        if (state !== 'open' && state !== 'doorway') {
          continue;
        }
        const offset = directionOffsets[direction];
        const neighbor = {
          cellX: cell.cellX + offset[0],
          cellZ: cell.cellZ + offset[1],
          layerIndex: 0
        };
        if (
          Math.abs(neighbor.cellX - startCell.cellX) > searchRadius ||
          Math.abs(neighbor.cellZ - startCell.cellZ) > searchRadius
        ) {
          continue;
        }

        const neighborKey = layeredCellKey(neighbor);
        if (!neighborKey || cameFrom.has(neighborKey)) {
          continue;
        }
        cameFrom.set(neighborKey, cell);
        cellByKey.set(neighborKey, neighbor);
        queue.push(neighbor);

        if (neighborKey === goalKey) {
          break;
        }
      }
    }

    if (!cameFrom.has(goalKey)) {
      return null;
    }

    const path = [];
    let currentKey = goalKey;
    while (currentKey) {
      const cell = cellByKey.get(currentKey);
      if (cell) {
        path.push(cell);
      }
      const previousCell = cameFrom.get(currentKey);
      currentKey = previousCell ? layeredCellKey(previousCell) : '';
    }

    path.reverse();
    return path;
  }

  function rebuildPath(nav, enemyCell, playerCell, playerPosition) {
    if (!nav || !enemyCell || !playerCell) {
      clearPath();
      return false;
    }

    const pathCells = buildCellPath(nav, enemyCell, playerCell);
    if (!pathCells || pathCells.length === 0) {
      clearPath();
      return false;
    }

    const waypoints = [];
    for (let i = 1; i < pathCells.length; i += 1) {
      const from = pathCells[i - 1];
      const to = pathCells[i];
      const deltaX = to.cellX - from.cellX;
      const deltaZ = to.cellZ - from.cellZ;
      const direction = deltaX === 1 ? 'east' : deltaX === -1 ? 'west' : deltaZ === 1 ? 'south' : 'north';
      const edges = typeof nav.getCellEdges === 'function'
        ? nav.getCellEdges(from.cellX, from.cellZ)
        : null;
      const edgeState = edges ? edges[direction] : null;
      const door = edgeState === 'doorway'
        ? nav.getDoorBetween?.(0, from.cellX, from.cellZ, to.cellX, to.cellZ)
        : null;

      const waypointPosition = door?.center
        ? [door.center[0], translation[1], door.center[2]]
        : nav.getRoomCenter?.(to.cellX, to.cellZ) ?? [
          translation[0],
          translation[1],
          translation[2]
        ];

      waypoints.push({ position: waypointPosition, doorId: door?.id ?? null });
    }

    waypoints.push({ position: [playerPosition[0], translation[1], playerPosition[2]], doorId: null });

    pathState.waypoints = waypoints;
    pathState.waypointIndex = 0;
    pathState.lastPlayerCellKey = layeredCellKey(playerCell);
    pathState.lastEnemyCellKey = layeredCellKey(enemyCell);
    pathState.rebuildTimer = PATH_REBUILD_INTERVAL;
    return true;
  }

  function moveTowards(target, deltaTime, context) {
    if (!target) {
      return;
    }

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

    const previousX = translation[0];
    const previousZ = translation[2];

    translation[0] += directionX * step;
    translation[2] += directionZ * step;

    resolveCollisions(context);

    const movedX = translation[0] - previousX;
    const movedZ = translation[2] - previousZ;
    const movedDistance = Math.hypot(movedX, movedZ);
    if (movedDistance > 1e-4) {
      normalizeForward(forward, movedX, movedZ);
    } else {
      normalizeForward(forward, directionX, directionZ);
    }

    animateLegs(deltaTime, movedDistance);
  }

  function followPath(deltaTime, context) {
    if (!Array.isArray(pathState.waypoints) || pathState.waypoints.length === 0) {
      return false;
    }

    const waypoint = pathState.waypoints[pathState.waypointIndex];
    if (!waypoint) {
      return false;
    }

    const target = waypoint.position;
    const dx = target[0] - translation[0];
    const dz = target[2] - translation[2];
    const distance = Math.hypot(dx, dz);

    if (distance < WAYPOINT_REACHED_DISTANCE) {
      pathState.waypointIndex = Math.min(pathState.waypointIndex + 1, pathState.waypoints.length - 1);
      return true;
    }

    if (waypoint.doorId && distance < DOOR_OPEN_DISTANCE) {
      requestDoorOpen(waypoint.doorId, context);
    }

    const directionX = dx / (distance || 1);
    const directionZ = dz / (distance || 1);
    const speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : DEFAULT_SPEED;
    const step = Math.min(distance, speed * deltaTime);

    const previousX = translation[0];
    const previousZ = translation[2];

    translation[0] += directionX * step;
    translation[2] += directionZ * step;

    resolveCollisions(context);

    const movedX = translation[0] - previousX;
    const movedZ = translation[2] - previousZ;
    const movedDistance = Math.hypot(movedX, movedZ);
    if (movedDistance > 1e-4) {
      normalizeForward(forward, movedX, movedZ);
    }

    animateLegs(deltaTime, movedDistance);

    return true;
  }

  function syncTransform() {
    computeRight(right, forward);
    mat4FromRotationTranslation(modelMatrix, right, up, forward, translation);
    writeTranslatedBounds(bounds, translation);
  }

  function startAggro(context) {
    if (context?.pacifyEnemies) {
      return;
    }

    if (!isAggro) {
      isAggro = true;
      if (context && !context.navigation && lastUpdateContext?.navigation) {
        context.navigation = lastUpdateContext.navigation;
      }
      if (context && !context.activeDoors && lastUpdateContext?.activeDoors) {
        context.activeDoors = lastUpdateContext.activeDoors;
      }
    }
  }

  function animateLegs(deltaTime, movedDistance = 0) {
    legsUpdatedThisFrame = true;
    const dt = Math.max(Number(deltaTime) || 0, 0);
    const speed = Number.isFinite(options.speed) && options.speed > 0 ? options.speed : DEFAULT_SPEED;
    const normalizedRate = dt > 1e-6 ? Math.min(movedDistance / (dt * speed), 1.5) : 0;
    const targetMotion = movedDistance > 1e-4 ? Math.min(1, normalizedRate + 0.15) : 0;
    const blendRate = movedDistance > 1e-4 ? 10 : LEG_STILLNESS_DECAY;
    legMotion += (targetMotion - legMotion) * Math.min(blendRate * dt, 1);

    if (legMotion > 1e-3) {
      const frequency = 5.5 + normalizedRate * 3;
      legPhase += dt * frequency;
    }

    if (!Number.isFinite(legPhase)) {
      legPhase = 0;
    } else if (legPhase > Math.PI * 2) {
      legPhase %= Math.PI * 2;
    }

    const swingAngle = Math.sin(legPhase) * LEG_SWING_AMPLITUDE * legMotion;
    geometry.updateLegPose?.(swingAngle, -swingAngle, legMotion);
  }

  function checkLineOfSight(target, context) {
    const colliders = gatherColliders(context);
    if (colliders.length === 0) {
      return true;
    }

    const origin = [translation[0], translation[1] + FIGHTER_COLLISION_HALF_HEIGHT, translation[2]];
    const targetCenter = [target[0], target[1] + FIGHTER_COLLISION_HALF_HEIGHT, target[2]];

    const vecX = targetCenter[0] - origin[0];
    const vecY = targetCenter[1] - origin[1];
    const vecZ = targetCenter[2] - origin[2];
    const dist = Math.hypot(vecX, vecY, vecZ);

    if (dist < 1e-4) {
      return true;
    }

    const dir = [vecX / dist, vecY / dist, vecZ / dist];

    for (const collider of colliders) {
      if (rayIntersectsBox(origin, dir, dist, collider)) {
        return false;
      }
    }
    return true;
  }

  function seekPlayer(deltaTime, context) {
    legsUpdatedThisFrame = false;

    if (!context || !context.playerPosition) {
      animateLegs(deltaTime, 0);
      return;
    }

    if (context.pacifyEnemies) {
      isAggro = false;
      clearPath();
      animateLegs(deltaTime, 0);
      return;
    }

    if (!isAggro && hasDiscoveredOriginCell(context?.visibleCells)) {
      startAggro(context);
    }

    if (!isAggro) {
      animateLegs(deltaTime, 0);
      return;
    }

    if (checkLineOfSight(context.playerPosition, context)) {
      clearPath();
      moveTowards(context.playerPosition, deltaTime, context);
      if (!legsUpdatedThisFrame) {
        animateLegs(deltaTime, 0);
      }
      return;
    }

    pathState.rebuildTimer = Math.max(pathState.rebuildTimer - deltaTime, 0);
    const navigation = context.navigation;
    let followedPath = false;

    if (navigation && typeof navigation.positionToCell === 'function') {
      const enemyCell = navigation.positionToCell(translation);
      const playerCell = navigation.positionToCell(context.playerPosition);

      if (enemyCell && playerCell) {
        const enemyKey = layeredCellKey(enemyCell);
        const playerKey = layeredCellKey(playerCell);
        const needsRebuild =
          pathState.waypoints.length === 0 ||
          pathState.lastEnemyCellKey !== enemyKey ||
          pathState.lastPlayerCellKey !== playerKey ||
          pathState.rebuildTimer <= 0;

        if (needsRebuild) {
          rebuildPath(navigation, enemyCell, playerCell, context.playerPosition);
        }

        followedPath = followPath(deltaTime, context);
      } else {
        clearPath();
      }
    }

    if (!followedPath) {
      moveTowards(context.playerPosition, deltaTime, context);
    }

    if (!legsUpdatedThisFrame) {
      animateLegs(deltaTime, 0);
    }
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
        startAggro(context);
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

  hitBoxes.push({
    bounds,
    onHit(impact) {
      fighter.onHit(impact);
    }
  });

  syncTransform();
  return fighter;
}
