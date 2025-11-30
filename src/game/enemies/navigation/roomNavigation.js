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

export function layeredCellKey(cell) {
  if (!cell) {
    return '';
  }
  return `${cell.layerIndex}:${cell.cellX},${cell.cellZ}`;
}

export function parseRoomKey(roomKey) {
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

export function roomsShareOpenWall(roomAKey, roomBKey, nav, activeDoors = null) {
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

export function isPlayerInEngagementRoom(playerRoomKey, enemyRoomKey, nav, activeDoors = null) {
  if (playerRoomKey === enemyRoomKey) {
    return true;
  }

  return roomsShareOpenWall(playerRoomKey, enemyRoomKey, nav, activeDoors);
}

export function createRoomPathFollower({
  translation,
  getSpeed,
  resolveCollisions,
  normalizeForward,
  requestDoorOpen,
  pathRebuildInterval = 0.35,
  waypointReachedDistance = 0.35,
  doorOpenDistance = 2.5
} = {}) {
  if (!translation) {
    throw new Error('A translation vector is required for path following.');
  }

  const state = {
    waypoints: [],
    waypointIndex: 0,
    lastPlayerCellKey: '',
    lastEnemyCellKey: '',
    layerIndex: null,
    rebuildTimer: 0
  };

  function clearPath() {
    state.waypoints.length = 0;
    state.waypointIndex = 0;
  }

  function getResolvedSpeed() {
    const speed = typeof getSpeed === 'function' ? getSpeed() : 0;
    return Number.isFinite(speed) && speed > 0 ? speed : 0;
  }

  function tick(deltaTime) {
    const dt = Number(deltaTime);
    if (!Number.isFinite(dt) || dt <= 0) {
      return;
    }
    state.rebuildTimer = Math.max(state.rebuildTimer - dt, 0);
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

    const queue = [];
    const cameFrom = new Map();
    const costByKey = new Map();
    const cellByKey = new Map();
    const searchRadius = Math.max(1, Math.floor(nav.generationRadius ?? 6));

    queue.push({ cell: startCell, cost: 0 });
    cameFrom.set(startKey, null);
    costByKey.set(startKey, 0);
    cellByKey.set(startKey, startCell);

    while (queue.length > 0) {
      const { cell } = queue.shift();
      const currentKey = layeredCellKey(cell);
      if (currentKey === goalKey) {
        break;
      }

      const edges = nav.getCellEdges(cell.layerIndex, cell.cellX, cell.cellZ);
      if (!edges) {
        continue;
      }

      for (const direction of Object.keys(directionOffsets)) {
        const offset = directionOffsets[direction];
        const neighbor = nav.getCell?.(cell.layerIndex, cell.cellX + offset[0], cell.cellZ + offset[1]);
        if (!neighbor || typeof neighbor.cellType === 'string' && neighbor.cellType.startsWith('hole')) {
          continue;
        }

        if (
          Math.abs(neighbor.cellX - startCell.cellX) > searchRadius ||
          Math.abs(neighbor.cellZ - startCell.cellZ) > searchRadius
        ) {
          continue;
        }

        const stateA = edges[direction];
        const stateB = nav.getCellEdges(neighbor.layerIndex, neighbor.cellX, neighbor.cellZ)[oppositeDirections[direction]];
        const isDoorway = stateA === 'doorway' && stateB === 'doorway';
        const isOpen = stateA === 'open' && stateB === 'open';
        if (!isDoorway && !isOpen) {
          continue;
        }

        const neighborKey = layeredCellKey(neighbor);
        const currentCost = costByKey.get(currentKey) ?? Number.POSITIVE_INFINITY;
        const newCost = currentCost + 1;

        if (!costByKey.has(neighborKey) || newCost < costByKey.get(neighborKey)) {
          costByKey.set(neighborKey, newCost);
          cameFrom.set(neighborKey, cell);
          cellByKey.set(neighborKey, neighbor);

          const insertionIndex = queue.findIndex((entry) => entry.cost > newCost);
          if (insertionIndex === -1) {
            queue.push({ cell: neighbor, cost: newCost });
          } else {
            queue.splice(insertionIndex, 0, { cell: neighbor, cost: newCost });
          }
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
        : nav.getRoomCenter?.(to.cellX, to.cellZ, to.layerIndex) ?? [translation[0], translation[1], translation[2]];

      waypoints.push({ position: waypointPosition, doorId: door?.id ?? null });
    }

    waypoints.push({ position: [playerPosition[0], translation[1], playerPosition[2]], doorId: null });

    state.waypoints = waypoints;
    state.waypointIndex = 0;
    state.lastPlayerCellKey = layeredCellKey(playerCell);
    state.lastEnemyCellKey = layeredCellKey(enemyCell);
    state.layerIndex = enemyCell.layerIndex;
    state.rebuildTimer = pathRebuildInterval;
    return true;
  }

  function shouldRebuild(enemyCell, playerCell) {
    const enemyKey = layeredCellKey(enemyCell);
    const playerKey = layeredCellKey(playerCell);

    return (
      state.waypoints.length === 0 ||
      state.layerIndex !== enemyCell?.layerIndex ||
      state.lastEnemyCellKey !== enemyKey ||
      state.lastPlayerCellKey !== playerKey ||
      state.rebuildTimer <= 0
    );
  }

  function followPath(deltaTime, context) {
    if (!Array.isArray(state.waypoints) || state.waypoints.length === 0) {
      return false;
    }

    const waypoint = state.waypoints[state.waypointIndex];
    if (!waypoint) {
      return false;
    }

    const target = waypoint.position;
    const dx = target[0] - translation[0];
    const dz = target[2] - translation[2];
    const distance = Math.hypot(dx, dz);

    if (distance < waypointReachedDistance) {
      state.waypointIndex = Math.min(state.waypointIndex + 1, state.waypoints.length - 1);
      return true;
    }

    if (waypoint.doorId && distance < doorOpenDistance) {
      requestDoorOpen?.(waypoint.doorId, context);
    }

    const directionX = dx / (distance || 1);
    const directionZ = dz / (distance || 1);
    const speed = getResolvedSpeed();
    const step = Math.min(distance, speed * deltaTime);

    const previousX = translation[0];
    const previousZ = translation[2];

    translation[0] += directionX * step;
    translation[2] += directionZ * step;

    resolveCollisions?.(context);

    const movedX = translation[0] - previousX;
    const movedZ = translation[2] - previousZ;
    const movedDistance = Math.hypot(movedX, movedZ);
    if (movedDistance > 1e-4) {
      normalizeForward?.(movedX, movedZ);
    }

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
    const speed = getResolvedSpeed();
    const step = Math.min(distance, speed * deltaTime);

    const previousX = translation[0];
    const previousZ = translation[2];

    translation[0] += directionX * step;
    translation[2] += directionZ * step;

    resolveCollisions?.(context);

    const movedX = translation[0] - previousX;
    const movedZ = translation[2] - previousZ;
    const movedDistance = Math.hypot(movedX, movedZ);
    if (movedDistance > 1e-4) {
      normalizeForward?.(movedX, movedZ);
    } else {
      normalizeForward?.(directionX, directionZ);
    }
  }

  return {
    state,
    tick,
    clearPath,
    buildCellPath,
    rebuildPath,
    shouldRebuild,
    followPath,
    moveTowards
  };
}
