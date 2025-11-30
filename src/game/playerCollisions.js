export const PLAYER_COLLISION_RADIUS = 0.4;
export const PLAYER_COLLISION_HALF_HEIGHT = 1.0;
const PLAYER_COLLISION_ITERATIONS = 6;

export function resolveCapsuleCollisions(position, colliders, radius, halfHeight) {
  const result = { grounded: false, hitCeiling: false };
  if (!colliders || colliders.length === 0) {
    return result;
  }

  const resolvedRadius = Math.max(0, Number(radius));
  const resolvedHalfHeight = Math.max(0, Number(halfHeight));
  if (!(resolvedRadius > 0) || !(resolvedHalfHeight > 0)) {
    return result;
  }

  const maxIterations = PLAYER_COLLISION_ITERATIONS;
  const nearFloorEpsilon = 1e-4;
  const overlapTolerance = 1e-4;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let adjusted = false;
    const playerMinY = position[1] - resolvedHalfHeight;
    const playerMaxY = position[1] + resolvedHalfHeight;

    for (let i = 0; i < colliders.length; i += 1) {
      const collider = colliders[i];
      if (!collider) {
        continue;
      }

      if (
        playerMaxY <= collider.minY + overlapTolerance ||
        playerMinY >= collider.maxY - overlapTolerance
      ) {
        continue;
      }

      const playerMinX = position[0] - resolvedRadius;
      const playerMaxX = position[0] + resolvedRadius;
      const playerMinZ = position[2] - resolvedRadius;
      const playerMaxZ = position[2] + resolvedRadius;

      if (
        playerMaxX <= collider.minX + overlapTolerance ||
        playerMinX >= collider.maxX - overlapTolerance ||
        playerMaxZ <= collider.minZ + overlapTolerance ||
        playerMinZ >= collider.maxZ - overlapTolerance
      ) {
        continue;
      }

      const overlapX1 = playerMaxX - collider.minX;
      const overlapX2 = collider.maxX - playerMinX;
      const resolveX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;

      const overlapY1 = playerMaxY - collider.minY;
      const overlapY2 = collider.maxY - playerMinY;
      const resolveY = overlapY1 < overlapY2 ? -overlapY1 : overlapY2;

      const overlapZ1 = playerMaxZ - collider.minZ;
      const overlapZ2 = collider.maxZ - playerMinZ;
      const resolveZ = overlapZ1 < overlapZ2 ? -overlapZ1 : overlapZ2;

      const colliderHeight = collider.maxY - collider.minY;
      const playerCenterX = position[0];
      const playerCenterY = position[1];
      const playerCenterZ = position[2];
      const withinHorizontalBounds =
        playerCenterX >= collider.minX &&
        playerCenterX <= collider.maxX &&
        playerCenterZ >= collider.minZ &&
        playerCenterZ <= collider.maxZ;

      const treatAsFloorOrCeiling =
        colliderHeight <= resolvedHalfHeight * 2 + 0.1 &&
        withinHorizontalBounds &&
        (playerCenterY >= collider.maxY - 1e-3 || playerCenterY <= collider.minY + 1e-3);

      if (treatAsFloorOrCeiling) {
        position[1] += resolveY;
        if (resolveY > 0) {
          result.grounded = true;
        } else if (resolveY < 0) {
          result.hitCeiling = true;
        } else if (playerMinY >= collider.maxY - nearFloorEpsilon) {
          result.grounded = true;
        }
      } else {
        let smallestAxis = 'x';
        let smallestResolve = resolveX;
        let smallestMagnitude = Math.abs(resolveX);

        const absResolveY = Math.abs(resolveY);
        if (absResolveY < smallestMagnitude) {
          smallestAxis = 'y';
          smallestResolve = resolveY;
          smallestMagnitude = absResolveY;
        }

        const absResolveZ = Math.abs(resolveZ);
        if (absResolveZ < smallestMagnitude || (smallestAxis === 'x' && absResolveZ === smallestMagnitude)) {
          smallestAxis = 'z';
          smallestResolve = resolveZ;
        }

        if (smallestAxis === 'x') {
          position[0] += smallestResolve;
        } else if (smallestAxis === 'y') {
          position[1] += smallestResolve;
          if (smallestResolve > 0) {
            result.grounded = true;
          } else if (smallestResolve < 0) {
            result.hitCeiling = true;
          }
        } else {
          position[2] += smallestResolve;
        }
      }

      adjusted = true;
      break;
    }

    if (!adjusted) {
      break;
    }
  }

  if (!result.grounded) {
    const playerMinY = position[1] - resolvedHalfHeight;
    const playerCenterX = position[0];
    const playerCenterZ = position[2];
    const groundSnapDistance = Math.max(nearFloorEpsilon * 10, 0.01);
    const horizontalTolerance = resolvedRadius * 0.1;

    for (let i = 0; i < colliders.length; i += 1) {
      const collider = colliders[i];
      if (!collider) {
        continue;
      }

      const colliderHeight = collider.maxY - collider.minY;
      if (colliderHeight > resolvedHalfHeight * 2 + 0.1) {
        continue;
      }

      if (
        playerCenterX < collider.minX - horizontalTolerance ||
        playerCenterX > collider.maxX + horizontalTolerance ||
        playerCenterZ < collider.minZ - horizontalTolerance ||
        playerCenterZ > collider.maxZ + horizontalTolerance
      ) {
        continue;
      }

      if (
        playerMinY >= collider.maxY - groundSnapDistance &&
        playerMinY <= collider.maxY + groundSnapDistance
      ) {
        if (playerMinY < collider.maxY) {
          position[1] = collider.maxY + resolvedHalfHeight;
        }
        result.grounded = true;
        break;
      }
    }
  }

  return result;
}

export function resolvePlayerCollisions(position, colliders) {
  return resolveCapsuleCollisions(position, colliders, PLAYER_COLLISION_RADIUS, PLAYER_COLLISION_HALF_HEIGHT);
}
