import { mat4FromRotationTranslation } from '../../math.js';
import { resolveCapsuleCollisions } from '../playerCollisions.js';

const FLOATS_PER_VERTEX = 10;
const BASE_SHOULDER_HALF_WIDTH = 0.7;
const BASE_HALF_DEPTH = 0.45;
const BASE_HEIGHT = 1.65;
const DEFAULT_SCALE = 1;
const DEFAULT_HEALTH = 90;
const DEFAULT_SPEED = 2.8;
const DEFAULT_IMPACT_DAMAGE = 6;

const COLORS = Object.freeze({
  primary: [0.58, 0.62, 0.68],
  accent: [0.77, 0.37, 0.22],
  shadow: [0.08, 0.09, 0.11]
});

const BASE_BOUNDS = Object.freeze({
  minX: -BASE_SHOULDER_HALF_WIDTH,
  maxX: BASE_SHOULDER_HALF_WIDTH,
  minY: 0,
  maxY: BASE_HEIGHT,
  minZ: -BASE_HALF_DEPTH,
  maxZ: BASE_HALF_DEPTH
});

const PATH_REBUILD_INTERVAL = 0.35;
const WAYPOINT_REACHED_DISTANCE = 0.35;
const DOOR_OPEN_DISTANCE = 2.5;
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

function sanitizeColor(color, fallback) {
  if (!color) {
    return fallback;
  }

  const source = Array.isArray(color) ? color : color.color ?? color.primary ?? null;
  if (!Array.isArray(source) || source.length < 3) {
    return fallback;
  }

  const sanitized = [Number(source[0]), Number(source[1]), Number(source[2])];
  if (sanitized.some((value) => !Number.isFinite(value))) {
    return fallback;
  }

  return sanitized;
}

function resolvePalette(options = {}) {
  const palette = options.colors ?? options.palette ?? options;

  const primary = sanitizeColor(palette.primaryColor ?? palette.primary, COLORS.primary);
  const accent = sanitizeColor(palette.accentColor ?? palette.accent, COLORS.accent);
  const shadow = sanitizeColor(palette.shadowColor ?? palette.shadow, COLORS.shadow);

  return { primary, accent, shadow };
}

function resolveScale(options = {}) {
  const scale = Number(options.scale ?? options.sizeScale ?? options.size ?? DEFAULT_SCALE);
  if (!Number.isFinite(scale) || scale <= 0) {
    return DEFAULT_SCALE;
  }
  return scale;
}

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

function addBox(target, center, size, color) {
  const [cx, cy, cz] = center;
  const hx = size[0] * 0.5;
  const hy = size[1] * 0.5;
  const hz = size[2] * 0.5;

  const corners = {
    ftl: [cx - hx, cy + hy, cz + hz],
    ftr: [cx + hx, cy + hy, cz + hz],
    fbl: [cx - hx, cy - hy, cz + hz],
    fbr: [cx + hx, cy - hy, cz + hz],
    btl: [cx - hx, cy + hy, cz - hz],
    btr: [cx + hx, cy + hy, cz - hz],
    bbl: [cx - hx, cy - hy, cz - hz],
    bbr: [cx + hx, cy - hy, cz - hz]
  };

  addQuad(target, corners.fbl, corners.fbr, corners.ftr, corners.ftl, [0, 0, 1], color);
  addQuad(target, corners.bbr, corners.bbl, corners.btl, corners.btr, [0, 0, -1], color);
  addQuad(target, corners.bbl, corners.fbl, corners.ftl, corners.btl, [-1, 0, 0], color);
  addQuad(target, corners.fbr, corners.bbr, corners.btr, corners.ftr, [1, 0, 0], color);
  addQuad(target, corners.ftl, corners.ftr, corners.btr, corners.btl, [0, 1, 0], color);
  addQuad(target, corners.bbl, corners.bbr, corners.fbr, corners.fbl, [0, -1, 0], color);
}

function addShoulder(target, palette, scale, direction = 1) {
  const baseCenter = [0.38 * direction * scale, 1.05 * scale, 0];
  const baseSize = [0.55 * scale, 0.28 * scale, 0.48 * scale];
  addBox(target, baseCenter, baseSize, palette.primary);

  const accentCenter = [0.38 * direction * scale, 1.09 * scale, 0.16 * scale];
  const accentSize = [0.57 * scale, 0.1 * scale, 0.22 * scale];
  addBox(target, accentCenter, accentSize, palette.accent);

  const underPlateCenter = [0.38 * direction * scale, 0.92 * scale, -0.12 * scale];
  const underPlateSize = [0.46 * scale, 0.12 * scale, 0.32 * scale];
  addBox(target, underPlateCenter, underPlateSize, palette.shadow);
}

function addHelm(target, palette, scale) {
  const helmCenter = [0, 1.45 * scale, 0];
  const helmSize = [0.42 * scale, 0.36 * scale, 0.34 * scale];
  addBox(target, helmCenter, helmSize, palette.primary);

  const visorCenter = [0, 1.43 * scale, 0.2 * scale];
  const visorSize = [0.44 * scale, 0.14 * scale, 0.12 * scale];
  addBox(target, visorCenter, visorSize, palette.accent);

  const crownCenter = [0, 1.6 * scale, 0];
  const crownSize = [0.18 * scale, 0.08 * scale, 0.24 * scale];
  addBox(target, crownCenter, crownSize, palette.shadow);
}

function addChest(target, palette, scale) {
  const cuirassCenter = [0, 0.72 * scale, 0];
  const cuirassSize = [0.62 * scale, 0.9 * scale, 0.44 * scale];
  addBox(target, cuirassCenter, cuirassSize, palette.primary);

  const innerShellCenter = [0, 0.7 * scale, 0];
  const innerShellSize = [0.52 * scale, 0.78 * scale, 0.36 * scale];
  addBox(target, innerShellCenter, innerShellSize, palette.shadow);

  const chestStripeCenter = [0, 0.78 * scale, 0.27 * scale];
  const chestStripeSize = [0.68 * scale, 0.16 * scale, 0.08 * scale];
  addBox(target, chestStripeCenter, chestStripeSize, palette.accent);

  const collarCenter = [0, 1.12 * scale, 0];
  const collarSize = [0.7 * scale, 0.08 * scale, 0.36 * scale];
  addBox(target, collarCenter, collarSize, palette.shadow);
}

function buildArmorSet(target, palette, scale) {
  addChest(target, palette, scale);
  addShoulder(target, palette, scale, 1);
  addShoulder(target, palette, scale, -1);
  addHelm(target, palette, scale);
}

function createBounds(scale) {
  return {
    minX: BASE_BOUNDS.minX * scale,
    maxX: BASE_BOUNDS.maxX * scale,
    minY: BASE_BOUNDS.minY * scale,
    maxY: BASE_BOUNDS.maxY * scale,
    minZ: BASE_BOUNDS.minZ * scale,
    maxZ: BASE_BOUNDS.maxZ * scale
  };
}

function createFighterGeometry(device, palette, scale) {
  const vertices = [];
  buildArmorSet(vertices, palette, scale);

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

function writeTranslatedBounds(target, translation, boundsTemplate) {
  target.minX = boundsTemplate.minX + translation[0];
  target.maxX = boundsTemplate.maxX + translation[0];
  target.minY = boundsTemplate.minY + translation[1];
  target.maxY = boundsTemplate.maxY + translation[1];
  target.minZ = boundsTemplate.minZ + translation[2];
  target.maxZ = boundsTemplate.maxZ + translation[2];
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

  const scale = resolveScale(options);
  const palette = resolvePalette(options);
  const localBounds = createBounds(scale);
  const collisionRadius = Math.max(
    Math.abs(localBounds.minX),
    localBounds.maxX,
    Math.abs(localBounds.minZ),
    localBounds.maxZ
  );
  const collisionHalfHeight = localBounds.maxY * 0.5;

  const geometry = createFighterGeometry(device, palette, scale);
  const translation = resolvePosition(options);
  const modelMatrix = new Float32Array(16);
  const forward = new Float32Array([0, 0, 1]);
  const right = new Float32Array(3);
  const up = new Float32Array([0, 1, 0]);
  const bounds = {
    minX: localBounds.minX + translation[0],
    maxX: localBounds.maxX + translation[0],
    minY: localBounds.minY + translation[1],
    maxY: localBounds.maxY + translation[1],
    minZ: localBounds.minZ + translation[2],
    maxZ: localBounds.maxZ + translation[2]
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
    layerIndex: null,
    rebuildTimer: 0
  };

  function layeredCellKey(cell) {
    if (!cell) {
      return '';
    }
    return `${cell.layerIndex}:${cell.cellX},${cell.cellZ}`;
  }

  function parseRoomKey(roomKey) {
    if (typeof roomKey !== 'string' || roomKey.length === 0) {
      return null;
    }

    const [layerPart, cellPart] = roomKey.split(':');
    if (!cellPart) {
      return null;
    }

    const [cellXPart, cellZPart] = cellPart.split(',');
    const layerIndex = Number(layerPart);
    const cellX = Number(cellXPart);
    const cellZ = Number(cellZPart);

    if (!Number.isInteger(layerIndex) || !Number.isInteger(cellX) || !Number.isInteger(cellZ)) {
      return null;
    }

    return { layerIndex, cellX, cellZ };
  }

  function roomsShareOpenWall(roomAKey, roomBKey, nav, activeDoors = null) {
    if (!nav || typeof nav.getCellEdges !== 'function') {
      return false;
    }

    const roomA = parseRoomKey(roomAKey);
    const roomB = parseRoomKey(roomBKey);
    if (!roomA || !roomB || roomA.layerIndex !== roomB.layerIndex) {
      return false;
    }

    const deltaX = roomB.cellX - roomA.cellX;
    const deltaZ = roomB.cellZ - roomA.cellZ;
    let direction = '';

    if (deltaX === 1 && deltaZ === 0) {
      direction = 'east';
    } else if (deltaX === -1 && deltaZ === 0) {
      direction = 'west';
    } else if (deltaX === 0 && deltaZ === 1) {
      direction = 'south';
    } else if (deltaX === 0 && deltaZ === -1) {
      direction = 'north';
    } else {
      return false;
    }

    const edgesA = nav.getCellEdges(roomA.layerIndex, roomA.cellX, roomA.cellZ);
    const edgesB = nav.getCellEdges(roomB.layerIndex, roomB.cellX, roomB.cellZ);
    if (!edgesA || !edgesB) {
      return false;
    }

    const opposite = oppositeDirections[direction];

    if (edgesA[direction] === 'open' && edgesB[opposite] === 'open') {
      return true;
    }

    const isDoorEdge = edgesA[direction] === 'doorway' && edgesB[opposite] === 'doorway';
    if (!isDoorEdge || !Array.isArray(activeDoors)) {
      return false;
    }

    const doorAnchor = typeof nav.getDoorBetween === 'function'
      ? nav.getDoorBetween(roomA.layerIndex, roomA.cellX, roomA.cellZ, roomB.cellX, roomB.cellZ)
      : null;

    if (!doorAnchor?.id) {
      return false;
    }

    const baseDoorAnchorId = String(doorAnchor.id);
    const matchingDoors = activeDoors.filter((door) => {
      if (!door) {
        return false;
      }

      const doorId = door.id;
      const anchorId = door.anchor?.id;
      const anchorRootId = typeof anchorId === 'string' ? anchorId.split(':')[0] : null;
      const doorRootId = typeof doorId === 'string' ? doorId.split(':')[0] : null;

      return (
        anchorId === doorAnchor.id ||
        doorId === doorAnchor.id ||
        anchorRootId === baseDoorAnchorId ||
        doorRootId === baseDoorAnchorId ||
        (typeof doorId === 'string' && doorId.startsWith(`${baseDoorAnchorId}:`))
      );
    });

    if (matchingDoors.length === 0) {
      return false;
    }

    return matchingDoors.some((door) => {
      if (!door) {
        return false;
      }

      if (door.state === 'open') {
        return true;
      }

      const openAmount = Number(door.openAmount);
      return Number.isFinite(openAmount) && openAmount >= 0.9;
    });
  }

  function isPlayerInEngagementRoom(playerRoomKey, enemyRoomKey, nav, activeDoors = null) {
    if (playerRoomKey === enemyRoomKey) {
      return true;
    }

    return roomsShareOpenWall(playerRoomKey, enemyRoomKey, nav, activeDoors);
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
    collisionPosition[1] = translation[1] + collisionHalfHeight;
    collisionPosition[2] = translation[2];

    resolveCapsuleCollisions(
      collisionPosition,
      colliders,
      collisionRadius,
      collisionHalfHeight
    );

    translation[0] = collisionPosition[0];
    translation[1] = collisionPosition[1] - collisionHalfHeight;
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
        ? nav.getCellEdges(cell.layerIndex, cell.cellX, cell.cellZ)
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
          layerIndex: cell.layerIndex
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
    if (!nav || !enemyCell || !playerCell || enemyCell.layerIndex !== playerCell.layerIndex) {
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
        ? nav.getCellEdges(from.layerIndex, from.cellX, from.cellZ)
        : null;
      const edgeState = edges ? edges[direction] : null;
      const door = edgeState === 'doorway'
        ? nav.getDoorBetween?.(from.layerIndex, from.cellX, from.cellZ, to.cellX, to.cellZ)
        : null;

      const waypointPosition = door?.center
        ? [door.center[0], translation[1], door.center[2]]
        : nav.getRoomCenter?.(to.cellX, to.cellZ, to.layerIndex) ?? [
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
    pathState.layerIndex = enemyCell.layerIndex;
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

    return true;
  }

  function syncTransform() {
    computeRight(right, forward);
    mat4FromRotationTranslation(modelMatrix, right, up, forward, translation);
    writeTranslatedBounds(bounds, translation, localBounds);
  }

  function startAggro(context) {
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

  function mergeDamageContext(context) {
    if (!context && !lastUpdateContext) {
      return {};
    }

    if (!lastUpdateContext) {
      return { ...context };
    }

    if (!context) {
      return { ...lastUpdateContext };
    }

    return { ...lastUpdateContext, ...context };
  }

  function seekPlayer(deltaTime, context) {
    if (!context || !context.playerPosition) {
      return;
    }

    if (!isAggro && context.playerRoomKey && fighter.spawnContext?.roomKey) {
      if (
        isPlayerInEngagementRoom(
          context.playerRoomKey,
          fighter.spawnContext.roomKey,
          context.navigation,
          context.activeDoors
        )
      ) {
        startAggro(context);
      }
    }

    if (!isAggro) {
      return;
    }

    pathState.rebuildTimer = Math.max(pathState.rebuildTimer - deltaTime, 0);
    const navigation = context.navigation;
    let followedPath = false;

    if (navigation && typeof navigation.positionToCell === 'function') {
      const enemyCell = navigation.positionToCell(translation);
      const playerCell = navigation.positionToCell(context.playerPosition);

      if (enemyCell && playerCell && enemyCell.layerIndex === playerCell.layerIndex) {
        const enemyKey = layeredCellKey(enemyCell);
        const playerKey = layeredCellKey(playerCell);
        const needsRebuild =
          pathState.waypoints.length === 0 ||
          pathState.layerIndex !== enemyCell.layerIndex ||
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
  }

  function takeDamage(amount, context = {}) {
    if (isDead) {
      return;
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    const wasAggro = isAggro;
    const damageContext = mergeDamageContext(context);
    startAggro(damageContext);
    currentHealth = Math.max(currentHealth - value, 0);

    if (onDamaged) {
      try {
        onDamaged({
          enemy: fighter,
          damage: value,
          remainingHealth: currentHealth,
          context: damageContext,
          wasAggressive: wasAggro
        });
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
      lastUpdateContext = context ?? null;
      seekPlayer(dt, context);
      syncTransform();
    },
    takeDamage,
    startAggro,
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
