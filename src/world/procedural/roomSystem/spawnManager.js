import {
  normalizeDirection,
  normalizeRoomBounds,
  normalizeSpawnPosition
} from './normalization.js';

export function createSpawnManager({
  getCellKey,
  getCellEdgesForLayer,
  roomSize,
  roomHeight,
  wallThickness,
  halfRoom,
  levelHeight,
  cornerAdjacency
}) {
  const pendingBarrelSpawns = [];
  const pendingCameraSpawns = [];
  const discoveredBarrelRooms = new Set();
  const discoveredCameraRooms = new Set();

  function getBarrelRoomKey(layerIndex, x, z) {
    return `${layerIndex}:${getCellKey(x, z)}`;
  }

  function getCameraRoomKey(layerIndex, x, z) {
    return `camera:${layerIndex}:${getCellKey(x, z)}`;
  }

  function scheduleBarrelSpawnPoint(spawn) {
    if (!spawn) {
      return false;
    }
    const normalizedPosition = normalizeSpawnPosition(spawn.position ?? spawn);
    if (!normalizedPosition) {
      return false;
    }
    const key = typeof spawn.key === 'string' ? spawn.key : spawn.key ? String(spawn.key) : '';
    pendingBarrelSpawns.push({ key, position: normalizedPosition });
    return true;
  }

  function scheduleCameraSpawnPoint(spawn) {
    if (!spawn) {
      return false;
    }

    const normalizedPosition = normalizeSpawnPosition(spawn.position ?? spawn);
    if (!normalizedPosition) {
      return false;
    }

    const forward = normalizeDirection(spawn.forward, [0, 0, -1]);
    if (!forward) {
      return false;
    }

    const up = normalizeDirection(spawn.up, [0, 1, 0]) ?? [0, 1, 0];
    const roomBounds = normalizeRoomBounds(spawn.roomBounds);
    const key = typeof spawn.key === 'string' ? spawn.key : spawn.key ? String(spawn.key) : '';
    pendingCameraSpawns.push({
      key,
      position: [normalizedPosition[0], normalizedPosition[1], normalizedPosition[2]],
      forward: [forward[0], forward[1], forward[2]],
      up: [up[0], up[1], up[2]],
      roomBounds
    });
    return true;
  }

  function evaluateCellForBarrel(x, z, layerIndex) {
    const roomKey = getBarrelRoomKey(layerIndex, x, z);
    if (discoveredBarrelRooms.has(roomKey)) {
      return;
    }

    const edges = getCellEdgesForLayer(layerIndex, x, z);
    if (!edges) {
      return;
    }

    const directions = ['north', 'south', 'east', 'west'];
    const openDirections = [];
    const closedDirections = [];

    for (let i = 0; i < directions.length; i += 1) {
      const direction = directions[i];
      const state = edges[direction];

      if (state === 'open') {
        openDirections.push(direction);
      } else if (state === 'solid' || state === 'doorway') {
        closedDirections.push(direction);
      } else {
        return;
      }
    }

    if (openDirections.length !== 2 || closedDirections.length !== 2) {
      return;
    }

    const centerX = x * roomSize;
    const centerZ = z * roomSize;
    const baseY = layerIndex * levelHeight;
    const rawOffset = Math.max(roomSize * 0.2, halfRoom * 0.45);
    const clearance = Math.max(0.6, wallThickness * 1.2);
    const maxOffset = Math.min(rawOffset, halfRoom - clearance);
    if (!(maxOffset > 0.25)) {
      return;
    }
    const offsets = [];

    for (let i = 0; i < closedDirections.length; i += 1) {
      const direction = closedDirections[i];
      if (direction === 'north') {
        offsets.push([0, -maxOffset]);
      } else if (direction === 'south') {
        offsets.push([0, maxOffset]);
      } else if (direction === 'east') {
        offsets.push([maxOffset, 0]);
      } else if (direction === 'west') {
        offsets.push([-maxOffset, 0]);
      }
    }

    if (offsets.length !== 2) {
      return;
    }

    discoveredBarrelRooms.add(roomKey);

    for (let i = 0; i < offsets.length; i += 1) {
      const [offsetX, offsetZ] = offsets[i];
      const position = [centerX + offsetX, baseY, centerZ + offsetZ];
      scheduleBarrelSpawnPoint({ key: roomKey, position });
    }
  }

  function evaluateCellForCamera(x, z, layerIndex) {
    const roomKey = getCameraRoomKey(layerIndex, x, z);
    if (discoveredCameraRooms.has(roomKey)) {
      return;
    }

    const edges = getCellEdgesForLayer(layerIndex, x, z);
    if (!edges) {
      return;
    }

    const directions = ['north', 'south', 'east', 'west'];
    const solidDirections = [];

    for (let i = 0; i < directions.length; i += 1) {
      const direction = directions[i];
      const state = edges[direction];
      if (!state) {
        return;
      }
      if (state === 'solid') {
        solidDirections.push(direction);
      }
    }

    if (solidDirections.length !== 2) {
      return;
    }

    const [dirA, dirB] = solidDirections;
    const adjacency = cornerAdjacency[dirA];
    if (!adjacency || !adjacency.includes(dirB)) {
      return;
    }

    const inset = Math.max(wallThickness * 0.5 + 0.15, halfRoom * 0.25);
    const cornerOffset = halfRoom - inset;
    if (!(cornerOffset > 0.05)) {
      return;
    }

    const centerX = x * roomSize;
    const centerZ = z * roomSize;
    const baseY = layerIndex * levelHeight;
    const mountY = baseY + roomHeight - Math.max(0.35, roomHeight * 0.15);

    let offsetX = 0;
    let offsetZ = 0;

    if (solidDirections.includes('east')) {
      offsetX = cornerOffset;
    } else if (solidDirections.includes('west')) {
      offsetX = -cornerOffset;
    }

    if (solidDirections.includes('south')) {
      offsetZ = cornerOffset;
    } else if (solidDirections.includes('north')) {
      offsetZ = -cornerOffset;
    }

    if (offsetX === 0 || offsetZ === 0) {
      return;
    }

    const position = [centerX + offsetX, mountY, centerZ + offsetZ];
    const forward = normalizeDirection([-offsetX, 0, -offsetZ], [0, 0, -1]);
    if (!forward) {
      return;
    }

    const roomBounds = {
      minX: centerX - halfRoom,
      maxX: centerX + halfRoom,
      minZ: centerZ - halfRoom,
      maxZ: centerZ + halfRoom
    };

    const scheduled = scheduleCameraSpawnPoint({
      key: roomKey,
      position,
      forward,
      up: [0, 1, 0],
      roomBounds
    });

    if (scheduled) {
      discoveredCameraRooms.add(roomKey);
    }
  }

  return {
    scheduleBarrelSpawnPoint,
    scheduleCameraSpawnPoint,
    consumeBarrelSpawnPoints: () => {
      if (pendingBarrelSpawns.length === 0) {
        return [];
      }
      return pendingBarrelSpawns.splice(0, pendingBarrelSpawns.length);
    },
    consumeCameraSpawnPoints: () => {
      if (pendingCameraSpawns.length === 0) {
        return [];
      }
      return pendingCameraSpawns.splice(0, pendingCameraSpawns.length);
    },
    evaluateCellForBarrel,
    evaluateCellForCamera
  };
}
