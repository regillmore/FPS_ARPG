const DEFAULT_MAX_PROJECTILES = 256;
const FLOATS_PER_VERTEX = 9;
const VERTICES_PER_PROJECTILE = 36;
const FLOATS_PER_PROJECTILE = VERTICES_PER_PROJECTILE * FLOATS_PER_VERTEX;
const DEFAULT_PROJECTILE_SIZE = 0.075;
const DEFAULT_PROJECTILE_SPEED = 24;
const DEFAULT_PROJECTILE_LIFETIME = 2.0;
const DEFAULT_PROJECTILE_COLOR = Object.freeze([0.9, 0.95, 0.4]);
const IMPACT_NORMALS = Object.freeze({
  minX: new Float32Array([1, 0, 0]),
  maxX: new Float32Array([-1, 0, 0]),
  minY: new Float32Array([0, 1, 0]),
  maxY: new Float32Array([0, -1, 0]),
  minZ: new Float32Array([0, 0, 1]),
  maxZ: new Float32Array([0, 0, -1])
});
const COLLISION_EPSILON = 1e-5;

function clampMaxProjectiles(value) {
  const maxValue = Number(value);
  if (!Number.isFinite(maxValue) || maxValue < 1) {
    return DEFAULT_MAX_PROJECTILES;
  }
  return Math.min(Math.floor(maxValue), DEFAULT_MAX_PROJECTILES * 16);
}

function normalizeVector3(input, fallback) {
  if (!input || typeof input !== 'object') {
    return new Float32Array(fallback);
  }
  const [x = fallback[0], y = fallback[1], z = fallback[2]] = input;
  const nx = Number(x);
  const ny = Number(y);
  const nz = Number(z);
  return new Float32Array([
    Number.isFinite(nx) ? nx : fallback[0],
    Number.isFinite(ny) ? ny : fallback[1],
    Number.isFinite(nz) ? nz : fallback[2]
  ]);
}

function normalizeDirection(direction) {
  const vector = normalizeVector3(direction, [0, 0, 1]);
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-5) {
    vector[0] = 0;
    vector[1] = 0;
    vector[2] = 1;
    return vector;
  }
  vector[0] /= length;
  vector[1] /= length;
  vector[2] /= length;
  return vector;
}

function normalizeColor(color) {
  if (!color || typeof color !== 'object') {
    return new Float32Array(DEFAULT_PROJECTILE_COLOR);
  }
  const [r = DEFAULT_PROJECTILE_COLOR[0], g = DEFAULT_PROJECTILE_COLOR[1], b = DEFAULT_PROJECTILE_COLOR[2]] = color;
  const nr = Number(r);
  const ng = Number(g);
  const nb = Number(b);
  return new Float32Array([
    Number.isFinite(nr) ? nr : DEFAULT_PROJECTILE_COLOR[0],
    Number.isFinite(ng) ? ng : DEFAULT_PROJECTILE_COLOR[1],
    Number.isFinite(nb) ? nb : DEFAULT_PROJECTILE_COLOR[2]
  ]);
}

function writeVertex(target, offset, position, normal, color) {
  target[offset++] = position[0];
  target[offset++] = position[1];
  target[offset++] = position[2];
  target[offset++] = normal[0];
  target[offset++] = normal[1];
  target[offset++] = normal[2];
  target[offset++] = color[0];
  target[offset++] = color[1];
  target[offset++] = color[2];
  return offset;
}

function writeQuad(target, offset, corners, normal, color) {
  const [a, b, c, d] = corners;
  offset = writeVertex(target, offset, a, normal, color);
  offset = writeVertex(target, offset, b, normal, color);
  offset = writeVertex(target, offset, c, normal, color);
  offset = writeVertex(target, offset, a, normal, color);
  offset = writeVertex(target, offset, c, normal, color);
  offset = writeVertex(target, offset, d, normal, color);
  return offset;
}

function writeCube(target, offset, center, size, color) {
  const half = size / 2;
  const minX = center[0] - half;
  const maxX = center[0] + half;
  const minY = center[1] - half;
  const maxY = center[1] + half;
  const minZ = center[2] - half;
  const maxZ = center[2] + half;

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

  offset = writeQuad(target, offset, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], [0, 0, 1], color);
  offset = writeQuad(target, offset, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], [0, 0, -1], color);
  offset = writeQuad(target, offset, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], [-1, 0, 0], color);
  offset = writeQuad(target, offset, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], [1, 0, 0], color);
  offset = writeQuad(target, offset, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], [0, 1, 0], color);
  offset = writeQuad(target, offset, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], [0, -1, 0], color);

  return offset;
}

function cloneVector(source) {
  return new Float32Array([source[0], source[1], source[2]]);
}

function createImpactPayload(projectile, hit) {
  return {
    position: hit.position,
    normal: hit.normal,
    projectileSize: projectile.size,
    projectileColor: cloneVector(projectile.color)
  };
}

function computeBoundsCollision(position, velocity, deltaTime, bounds) {
  if (!bounds || deltaTime <= 0) {
    return null;
  }

  let earliestT = Infinity;
  let impact = null;

  const tryPlane = (axis, planeValue, normalKey, isMinPlane) => {
    const normal = IMPACT_NORMALS[normalKey];
    if (!normal) {
      return;
    }

    const start = position[axis];
    const velocityComponent = velocity[axis];
    if (Math.abs(velocityComponent) <= COLLISION_EPSILON) {
      return;
    }

    if (isMinPlane) {
      if (velocityComponent >= 0) {
        return;
      }
    } else if (velocityComponent <= 0) {
      return;
    }

    const delta = velocityComponent * deltaTime;
    const t = (planeValue - start) / delta;
    if (t < 0 || t > 1 || t >= earliestT) {
      return;
    }

    const hitX = position[0] + velocity[0] * deltaTime * t;
    const hitY = position[1] + velocity[1] * deltaTime * t;
    const hitZ = position[2] + velocity[2] * deltaTime * t;

    if (
      hitX < bounds.minX - COLLISION_EPSILON ||
      hitX > bounds.maxX + COLLISION_EPSILON ||
      hitY < bounds.minY - COLLISION_EPSILON ||
      hitY > bounds.maxY + COLLISION_EPSILON ||
      hitZ < bounds.minZ - COLLISION_EPSILON ||
      hitZ > bounds.maxZ + COLLISION_EPSILON
    ) {
      return;
    }

    earliestT = t;
    impact = {
      position: new Float32Array([
        axis === 0 ? planeValue : hitX,
        axis === 1 ? planeValue : hitY,
        axis === 2 ? planeValue : hitZ
      ]),
      normal: cloneVector(normal),
      time: t
    };
  };

  tryPlane(0, bounds.minX, 'minX', true);
  tryPlane(0, bounds.maxX, 'maxX', false);
  tryPlane(1, bounds.minY, 'minY', true);
  tryPlane(1, bounds.maxY, 'maxY', false);
  tryPlane(2, bounds.minZ, 'minZ', true);
  tryPlane(2, bounds.maxZ, 'maxZ', false);

  return impact;
}

export function createProjectileManager(device, options = {}) {
  const maxProjectiles = clampMaxProjectiles(options.maxProjectiles ?? DEFAULT_MAX_PROJECTILES);
  const collisionBounds = options.bounds ?? null;
  const impactCallback = typeof options.onImpact === 'function' ? options.onImpact : null;
  const dynamicColliderProvider =
    typeof options.getDynamicColliders === 'function' ? options.getDynamicColliders : null;
  const projectiles = [];
  const vertexData = new Float32Array(maxProjectiles * FLOATS_PER_PROJECTILE);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  let vertexCount = 0;
  let vertexDataDirty = false;

  function markDirty() {
    vertexDataDirty = true;
  }

  function spawnProjectile({ position, direction, speed, color, size, lifetime } = {}) {
    if (projectiles.length >= maxProjectiles) {
      projectiles.shift();
    }

    const basePosition = normalizeVector3(position, [0, 0, 0]);
    const normalizedDirection = normalizeDirection(direction);
    const speedValue = Number(speed);
    const resolvedSpeed = Number.isFinite(speedValue) ? speedValue : DEFAULT_PROJECTILE_SPEED;
    const velocity = new Float32Array([
      normalizedDirection[0] * resolvedSpeed,
      normalizedDirection[1] * resolvedSpeed,
      normalizedDirection[2] * resolvedSpeed
    ]);

    const sizeValue = Number(size);
    const resolvedSize = Number.isFinite(sizeValue) && sizeValue > 0 ? sizeValue : DEFAULT_PROJECTILE_SIZE;

    const lifetimeValue = Number(lifetime);
    const resolvedLifetime = Number.isFinite(lifetimeValue) && lifetimeValue > 0 ? lifetimeValue : DEFAULT_PROJECTILE_LIFETIME;

    projectiles.push({
      position: basePosition,
      velocity,
      color: normalizeColor(color),
      size: resolvedSize,
      lifetime: resolvedLifetime,
      age: 0
    });

    markDirty();
  }

  function update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    let dynamicColliders = null;
    if (dynamicColliderProvider) {
      try {
        const providedColliders = dynamicColliderProvider();
        if (Array.isArray(providedColliders)) {
          dynamicColliders = providedColliders;
        } else if (providedColliders) {
          dynamicColliders = [providedColliders];
        }
      } catch (error) {
        console.error('Error while retrieving dynamic projectile colliders:', error);
        dynamicColliders = null;
      }
    }

    let changed = false;
    for (let index = projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = projectiles[index];
      projectile.age += deltaTime;
      if (projectile.age >= projectile.lifetime) {
        projectiles.splice(index, 1);
        changed = true;
        continue;
      }

      let dynamicHit = null;
      let dynamicCollider = null;
      if (dynamicColliders && dynamicColliders.length > 0) {
        for (let colliderIndex = 0; colliderIndex < dynamicColliders.length; colliderIndex += 1) {
          const collider = dynamicColliders[colliderIndex];
          const colliderBounds = collider?.bounds;
          if (!colliderBounds) {
            continue;
          }
          const hit = computeBoundsCollision(
            projectile.position,
            projectile.velocity,
            deltaTime,
            colliderBounds
          );
          if (!hit) {
            continue;
          }
          if (!dynamicHit || hit.time < dynamicHit.time) {
            dynamicHit = hit;
            dynamicCollider = collider;
          }
        }
      }

      const worldHit = collisionBounds
        ? computeBoundsCollision(projectile.position, projectile.velocity, deltaTime, collisionBounds)
        : null;

      const dynamicTime = dynamicHit ? dynamicHit.time ?? Infinity : Infinity;
      const worldTime = worldHit ? worldHit.time ?? Infinity : Infinity;
      const hasDynamicHit = dynamicHit && dynamicTime <= worldTime;
      const hasWorldHit = worldHit && worldTime < dynamicTime;

      if (hasDynamicHit || hasWorldHit) {
        const finalHit = hasDynamicHit ? dynamicHit : worldHit;
        if (hasDynamicHit) {
          if (dynamicCollider && typeof dynamicCollider.onHit === 'function') {
            try {
              dynamicCollider.onHit(createImpactPayload(projectile, finalHit));
            } catch (error) {
              console.error('Error while handling dynamic projectile impact:', error);
            }
          } else if (impactCallback) {
            try {
              impactCallback(createImpactPayload(projectile, finalHit));
            } catch (error) {
              console.error('Error while handling projectile impact:', error);
            }
          }
        } else if (impactCallback) {
          try {
            impactCallback(createImpactPayload(projectile, finalHit));
          } catch (error) {
            console.error('Error while handling projectile impact:', error);
          }
        }

        projectiles.splice(index, 1);
        changed = true;
        continue;
      }

      projectile.position[0] += projectile.velocity[0] * deltaTime;
      projectile.position[1] += projectile.velocity[1] * deltaTime;
      projectile.position[2] += projectile.velocity[2] * deltaTime;
      changed = true;
    }

    if (changed) {
      markDirty();
    }
  }

  function rebuildVertexData() {
    if (!vertexDataDirty) {
      return false;
    }

    let offset = 0;
    for (let i = 0; i < projectiles.length; i += 1) {
      const projectile = projectiles[i];
      offset = writeCube(vertexData, offset, projectile.position, projectile.size, projectile.color);
    }

    vertexCount = offset / FLOATS_PER_VERTEX;
    vertexDataDirty = false;
    return true;
  }

  function syncGPU() {
    const rebuilt = rebuildVertexData();
    if (!rebuilt) {
      return;
    }

    if (vertexCount === 0) {
      return;
    }

    const floatsToWrite = vertexCount * FLOATS_PER_VERTEX;
    device.queue.writeBuffer(vertexBuffer, 0, vertexData.subarray(0, floatsToWrite));
  }

  function clear() {
    if (projectiles.length === 0) {
      return;
    }
    projectiles.length = 0;
    vertexCount = 0;
    markDirty();
  }

  function getVertexCount() {
    return vertexCount;
  }

  function getVertexBuffer() {
    return vertexBuffer;
  }

  return {
    spawnProjectile,
    update,
    syncGPU,
    clear,
    getVertexCount,
    getVertexBuffer
  };
}
