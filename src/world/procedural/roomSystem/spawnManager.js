import { normalizeSpawnPosition } from './normalization.js';

export function createSpawnManager({
  getCellKey,
  getCellEdgesForLayer,
  roomSize,
  roomHeight,
  wallThickness,
  halfRoom,
  levelHeight
}) {
  const pendingBarrelSpawns = [];
  const discoveredBarrelRooms = new Set();

  function getBarrelRoomKey(layerIndex, x, z) {
    return `${layerIndex}:${getCellKey(x, z)}`;
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

  return {
    scheduleBarrelSpawnPoint,
    consumeBarrelSpawnPoints: () => {
      if (pendingBarrelSpawns.length === 0) {
        return [];
      }
      return pendingBarrelSpawns.splice(0, pendingBarrelSpawns.length);
    },
    evaluateCellForBarrel
  };
}
