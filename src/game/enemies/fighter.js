import { mat4FromRotationTranslation } from '../../math.js';
import { resolveCapsuleCollisions } from '../playerCollisions.js';
import {
  createRoomPathFollower,
  isPlayerInEngagementRoom
} from './navigation/roomNavigation.js';

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

const FIGHTER_COLLISION_RADIUS = Math.max(HALF_WIDTH, HALF_DEPTH);
const FIGHTER_COLLISION_HALF_HEIGHT = BODY_HEIGHT * 0.5;
const PATH_REBUILD_INTERVAL = 0.35;
const WAYPOINT_REACHED_DISTANCE = 0.35;
const DOOR_OPEN_DISTANCE = 2.5;

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

  const pathFollower = createRoomPathFollower({
    translation,
    getSpeed: () => (Number.isFinite(options.speed) && options.speed > 0 ? options.speed : DEFAULT_SPEED),
    resolveCollisions: (context) => resolveCollisions(context),
    normalizeForward: (x, z) => normalizeForward(forward, x, z),
    requestDoorOpen: (doorId, context) => requestDoorOpen(doorId, context),
    pathRebuildInterval: PATH_REBUILD_INTERVAL,
    waypointReachedDistance: WAYPOINT_REACHED_DISTANCE,
    doorOpenDistance: DOOR_OPEN_DISTANCE
  });

  function syncTransform() {
    computeRight(right, forward);
    mat4FromRotationTranslation(modelMatrix, right, up, forward, translation);
    writeTranslatedBounds(bounds, translation);
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

    pathFollower.tick(deltaTime);
    const navigation = context.navigation;
    let followedPath = false;

    if (navigation && typeof navigation.positionToCell === 'function') {
      const enemyCell = navigation.positionToCell(translation);
      const playerCell = navigation.positionToCell(context.playerPosition);

      if (enemyCell && playerCell && enemyCell.layerIndex === playerCell.layerIndex) {
        if (pathFollower.shouldRebuild(enemyCell, playerCell)) {
          pathFollower.rebuildPath(navigation, enemyCell, playerCell, context.playerPosition);
        }

        followedPath = pathFollower.followPath(deltaTime, context);
      } else {
        pathFollower.clearPath();
      }
    }

    if (!followedPath) {
      pathFollower.moveTowards(context.playerPosition, deltaTime, context);
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
