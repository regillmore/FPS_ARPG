const COLLISION_EPSILON = 1e-5;

function tryPlaneIntersection(result, axis, planeValue, position, velocity, deltaTime, bounds) {
  const start = position[axis];
  const velocityComponent = velocity[axis];
  if (Math.abs(velocityComponent) <= COLLISION_EPSILON) {
    return;
  }

  const delta = velocityComponent * deltaTime;
  const t = (planeValue - start) / delta;
  if (t < 0 || t > 1 || t >= result.earliestT) {
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

  result.earliestT = t;
  const normal = new Float32Array(3);
  normal[axis] = velocityComponent > 0 ? -1 : 1;
  result.impact = {
    position: new Float32Array([
      axis === 0 ? planeValue : hitX,
      axis === 1 ? planeValue : hitY,
      axis === 2 ? planeValue : hitZ
    ]),
    normal,
    time: t
  };
}

export function sweepAABB(position, velocity, deltaTime, bounds) {
  if (!bounds || deltaTime <= 0) {
    return null;
  }

  const state = { earliestT: Infinity, impact: null };

  tryPlaneIntersection(state, 0, bounds.minX, position, velocity, deltaTime, bounds);
  tryPlaneIntersection(state, 0, bounds.maxX, position, velocity, deltaTime, bounds);
  tryPlaneIntersection(state, 1, bounds.minY, position, velocity, deltaTime, bounds);
  tryPlaneIntersection(state, 1, bounds.maxY, position, velocity, deltaTime, bounds);
  tryPlaneIntersection(state, 2, bounds.minZ, position, velocity, deltaTime, bounds);
  tryPlaneIntersection(state, 2, bounds.maxZ, position, velocity, deltaTime, bounds);

  if (!state.impact) {
    return null;
  }

  const distance = state.impact.time * deltaTime;
  return {
    position: state.impact.position,
    normal: state.impact.normal,
    time: state.impact.time,
    distance
  };
}

export function traceRayAABB(origin, direction, maxDistance, bounds) {
  if (!bounds) {
    return null;
  }

  const distanceValue = Number(maxDistance);
  if (!Number.isFinite(distanceValue) || distanceValue <= 0) {
    return null;
  }

  const dirX = Number(direction?.[0]) || 0;
  const dirY = Number(direction?.[1]) || 0;
  const dirZ = Number(direction?.[2]) || 0;
  const length = Math.hypot(dirX, dirY, dirZ);
  if (length <= COLLISION_EPSILON) {
    return null;
  }

  const invLength = 1 / length;
  const normalizedDirection = new Float32Array([
    dirX * invLength,
    dirY * invLength,
    dirZ * invLength
  ]);

  return sweepAABB(origin, normalizedDirection, distanceValue, bounds);
}
