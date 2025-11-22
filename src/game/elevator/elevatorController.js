import { PLAYER_COLLISION_HALF_HEIGHT } from '../playerCollisions.js';

const ELEVATOR_SPEED = 1.5;
const ELEVATOR_GATE_SPEED = 1.8;

function translateItemVertically(item, delta) {
  if (!item || !item.modelMatrix || !item.bounds || !item.center) {
    return;
  }

  item.modelMatrix[13] += delta;
  item.bounds.minY += delta;
  item.bounds.maxY += delta;
  item.center[1] += delta;
}

function createItemSurfaces(bounds) {
  if (!bounds) {
    return null;
  }

  const surfaces = [
    {
      minX: bounds.minX,
      maxX: bounds.maxX,
      minZ: bounds.minZ,
      maxZ: bounds.maxZ,
      height: bounds.floorY
    }
  ];

  if (
    Number.isFinite(bounds.canopyMinX) &&
    Number.isFinite(bounds.canopyMaxX) &&
    Number.isFinite(bounds.canopyMinZ) &&
    Number.isFinite(bounds.canopyMaxZ) &&
    Number.isFinite(bounds.canopyMaxY)
  ) {
    surfaces.push({
      minX: bounds.canopyMinX,
      maxX: bounds.canopyMaxX,
      minZ: bounds.canopyMinZ,
      maxZ: bounds.canopyMaxZ,
      height: bounds.canopyMaxY
    });
  }

  return surfaces;
}

export function createElevatorController({
  roomSystem,
  controller,
  layerResolver,
  levelHeight,
  playerHalfHeight = PLAYER_COLLISION_HALF_HEIGHT
}) {
  const controls = { raise: false, lower: false, autoReturn: false };
  let gateTarget = 0;
  let gateProgress =
    typeof roomSystem.getElevatorGateProgress === 'function'
      ? roomSystem.getElevatorGateProgress()
      : 0;
  let lastOffset =
    typeof roomSystem.getElevatorOffset === 'function'
      ? roomSystem.getElevatorOffset()
      : 0;

  function movePlayerWithElevator(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-4) {
      return;
    }

    controller.position[1] += delta;

    const bounds =
      typeof roomSystem.getElevatorBounds === 'function'
        ? roomSystem.getElevatorBounds()
        : null;

    if (!bounds) {
      return;
    }

    const footY = controller.position[1] - playerHalfHeight;
    const px = controller.position[0];
    const pz = controller.position[2];
    const surfaces = createItemSurfaces(bounds);

    if (!surfaces || surfaces.length === 0) {
      return;
    }

    const horizontalMargin = 0.4;
    const belowTolerance = Math.max(0.05, playerHalfHeight * 0.15);
    const aboveTolerance = Math.max(belowTolerance, 0.25);

    for (const surface of surfaces) {
      if (!surface) {
        continue;
      }

      const withinX = px >= surface.minX - horizontalMargin && px <= surface.maxX + horizontalMargin;
      const withinZ = pz >= surface.minZ - horizontalMargin && pz <= surface.maxZ + horizontalMargin;
      const nearSurface =
        withinX &&
        withinZ &&
        footY >= surface.height - belowTolerance &&
        footY <= surface.height + aboveTolerance;

      if (nearSurface) {
        controller.position[1] += delta;
        break;
      }
    }
  }

  function moveWorldItemsWithElevator(delta, items) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-4) {
      return;
    }

    if (!Array.isArray(items) || items.length === 0) {
      return;
    }

    const bounds =
      typeof roomSystem.getElevatorBounds === 'function'
        ? roomSystem.getElevatorBounds()
        : null;

    const surfaces = createItemSurfaces(bounds);

    if (!surfaces || surfaces.length === 0) {
      return;
    }

    const verticalTolerance = 0.35;

    for (const item of items) {
      if (!item || !item.bounds || !item.center) {
        continue;
      }

      const cx = item.center[0];
      const cz = item.center[2];
      const horizontalMargin = Math.max(
        (item.bounds.maxX - item.bounds.minX) * 0.5,
        (item.bounds.maxZ - item.bounds.minZ) * 0.5,
        0.12
      );

      for (const surface of surfaces) {
        if (!surface) {
          continue;
        }

        const withinX = cx >= surface.minX - horizontalMargin && cx <= surface.maxX + horizontalMargin;
        const withinZ = cz >= surface.minZ - horizontalMargin && cz <= surface.maxZ + horizontalMargin;

        if (!withinX || !withinZ) {
          continue;
        }

        const verticalDistance = Math.min(
          Math.abs(item.bounds.minY - surface.height),
          Math.abs(item.bounds.maxY - surface.height),
          Math.abs(item.center[1] - surface.height)
        );

        if (verticalDistance <= verticalTolerance) {
          translateItemVertically(item, delta);
          break;
        }
      }
    }
  }

  function handleControl(event, pressed) {
    if (!event || typeof event.code !== 'string') {
      return;
    }

    if (event.code === 'KeyR') {
      if (pressed) {
        controls.autoReturn = false;
        gateTarget = 0;
      }
      controls.raise = pressed;
      event.preventDefault();
    } else if (event.code === 'KeyF') {
      if (pressed) {
        controls.autoReturn = false;
        gateTarget = 0;
      }
      controls.lower = pressed;
      event.preventDefault();
    }
  }

  function handleBlur() {
    controls.raise = false;
    controls.lower = false;
    controls.autoReturn = false;
    gateTarget = 0;
  }

  function requestReturnToGround() {
    controls.autoReturn = true;
    controls.raise = false;
    controls.lower = false;
    gateTarget = 1;
  }

  function update(deltaTime, { isPaused, worldItems }) {
    let geometryChanged = false;
    const previousOffset =
      typeof roomSystem.getElevatorOffset === 'function'
        ? roomSystem.getElevatorOffset()
        : lastOffset;

    if (!isPaused && typeof roomSystem.adjustElevatorOffset === 'function') {
      if (controls.raise || controls.lower) {
        controls.autoReturn = false;
        gateTarget = 0;
      }

      let elevatorDelta = 0;
      const elevatorOffset = previousOffset;
      let elevatorPosition = elevatorOffset;
      const maxElevatorStep = ELEVATOR_SPEED * deltaTime;

      if (controls.autoReturn) {
        const toOrigin = -elevatorOffset;
        if (!Number.isFinite(toOrigin) || Math.abs(toOrigin) < 1e-4) {
          controls.autoReturn = false;
          gateTarget = 0;
        } else if (Math.abs(toOrigin) <= maxElevatorStep) {
          geometryChanged = roomSystem.setElevatorOffset(0) || geometryChanged;
          controls.autoReturn = false;
          gateTarget = 0;
        } else {
          elevatorDelta = Math.sign(toOrigin) * maxElevatorStep;
        }
      } else {
        const elevatorIdle = !controls.raise && !controls.lower && layerResolver && Number.isFinite(levelHeight);

        if (elevatorIdle) {
          const playerLayer = layerResolver(controller.position[1] - playerHalfHeight);

          if (Number.isFinite(playerLayer)) {
            const targetOffset = playerLayer * levelHeight;
            const maxIdleFloorDistance = levelHeight * 5;
            let toPlayerFloor = targetOffset - elevatorPosition;

            if (Math.abs(toPlayerFloor) > maxIdleFloorDistance) {
              const skippedOffset = targetOffset - Math.sign(toPlayerFloor) * maxIdleFloorDistance;
              geometryChanged = roomSystem.setElevatorOffset(skippedOffset) || geometryChanged;
              elevatorPosition = skippedOffset;
              toPlayerFloor = targetOffset - elevatorPosition;
            }

            if (Math.abs(toPlayerFloor) <= maxElevatorStep && Math.abs(toPlayerFloor) > 1e-4) {
              geometryChanged = roomSystem.setElevatorOffset(targetOffset) || geometryChanged;
              elevatorPosition = targetOffset;
            } else if (Math.abs(toPlayerFloor) > maxElevatorStep) {
              elevatorDelta = Math.sign(toPlayerFloor) * maxElevatorStep;
            }
          }
        }

        if (Math.abs(elevatorDelta) < 1e-4) {
          if (controls.raise) {
            elevatorDelta += ELEVATOR_SPEED * deltaTime;
          }
          if (controls.lower) {
            elevatorDelta -= ELEVATOR_SPEED * deltaTime;
          }
        }
      }

      if (Math.abs(elevatorDelta) > 1e-4) {
        geometryChanged = roomSystem.adjustElevatorOffset(elevatorDelta) || geometryChanged;
      }
    }

    if (!isPaused) {
      const currentGateProgress =
        typeof roomSystem.getElevatorGateProgress === 'function'
          ? roomSystem.getElevatorGateProgress()
          : gateProgress;
      const gateDelta = gateTarget - currentGateProgress;

      if (Math.abs(gateDelta) > 1e-4) {
        const maxGateStep = ELEVATOR_GATE_SPEED * deltaTime;
        const gateStep = Math.abs(gateDelta) <= maxGateStep ? gateDelta : Math.sign(gateDelta) * maxGateStep;
        const nextGateProgress = currentGateProgress + gateStep;
        gateProgress = nextGateProgress;

        if (typeof roomSystem.setElevatorGateProgress === 'function') {
          geometryChanged = roomSystem.setElevatorGateProgress(nextGateProgress) || geometryChanged;
        }
      } else {
        gateProgress = currentGateProgress;
      }
    }

    const currentOffset =
      typeof roomSystem.getElevatorOffset === 'function'
        ? roomSystem.getElevatorOffset()
        : previousOffset;
    const elevatorMovement = currentOffset - previousOffset;

    movePlayerWithElevator(elevatorMovement);
    moveWorldItemsWithElevator(elevatorMovement, worldItems);
    lastOffset = currentOffset;

    return { geometryChanged, elevatorMovement };
  }

  return {
    handleControl,
    handleBlur,
    requestReturnToGround,
    update
  };
}
