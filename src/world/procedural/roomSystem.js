import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOUBLE_DOOR_WIDTH,
  DEFAULT_FLOOR_OPENING_MARGIN_RATIO,
  DEFAULT_FLOOR_THICKNESS,
  DEFAULT_GENERATION_RADIUS,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_SIZE,
  DEFAULT_WALL_THICKNESS,
  VERTEX_STRIDE
} from './constants.js';
import { positionToCell, positionToLayer } from './spatial.js';
import { createCellState } from './roomSystem/cellState.js';
import { createEdgeKey } from './profile.js';
import { createSpawnManager } from './roomSystem/spawnManager.js';
import { createRoomGeometryBuilder } from './roomSystem/geometryBuilder.js';

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

export function createProceduralRoomSystem(device, options = {}) {
  const roomSize = options.roomSize ?? DEFAULT_ROOM_SIZE;
  const roomHeight = options.roomHeight ?? DEFAULT_ROOM_HEIGHT;
  const doorHeight = options.doorHeight ?? DEFAULT_DOOR_HEIGHT;
  const singleDoorWidth = options.doorWidth ?? DEFAULT_DOOR_WIDTH;
  const doubleDoorWidth = options.doubleDoorWidth ?? DEFAULT_DOUBLE_DOOR_WIDTH;
  const wallThickness = Math.max(
    0.05,
    Math.min(roomSize * 0.5, options.wallThickness ?? DEFAULT_WALL_THICKNESS)
  );
  const floorThickness = Math.max(
    0,
    Math.min(roomHeight * 0.5, options.floorThickness ?? DEFAULT_FLOOR_THICKNESS)
  );
  const generationRadius = Math.max(
    1,
    Math.floor(options.generationRadius ?? DEFAULT_GENERATION_RADIUS)
  );
  const floorOpeningMarginRatio = Math.min(
    0.45,
    Math.max(0.05, options.floorOpeningMarginRatio ?? DEFAULT_FLOOR_OPENING_MARGIN_RATIO)
  );
  const floorOpeningMargin = roomSize * floorOpeningMarginRatio;
  const halfRoom = roomSize * 0.5;
  const levelHeight = roomHeight + floorThickness;
  let centerLayerIndex = options.initialLayer;
  const visitedCells = new Map();

  const worldSeed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const clampedDoorHeight = Math.min(
    Math.max(doorHeight, roomHeight * 0.3),
    roomHeight - 0.2
  );

  const bounds = {
    minX: -halfRoom,
    maxX: halfRoom,
    minY: -floorThickness,
    maxY: roomHeight,
    minZ: -halfRoom,
    maxZ: halfRoom
  };

  let vertexBuffer = null;
  let vertexCount = 0;
  let centerCellX = 0;
  let centerCellZ = 0;

  const colliders = [];
  const doors = [];
  const storageChests = [];
  const decorativeLights = [];

  const cellState = createCellState(worldSeed);
  const {
    getCellKey,
    getLayerSeed,
    getLayerProfiles,
    getCellProfileForLayer,
    getExistingCellEdgesForLayer,
    getCellEdgesForLayer
  } = cellState;

  const spawnManager = createSpawnManager({
    getCellKey,
    getCellEdgesForLayer,
    roomSize,
    roomHeight,
    wallThickness,
    halfRoom,
    levelHeight
  });

  const {
    scheduleFighterSpawnPoint,
    consumeFighterSpawnPoints,
    evaluateCellForFighter
  } = spawnManager;

  const geometryBuilder = createRoomGeometryBuilder({
    bounds,
    colliders,
    doors,
    storageChests,
    decorativeLights,
    roomSize,
    roomHeight,
    levelHeight,
    floorThickness,
    floorOpeningMargin,
    wallThickness,
    halfRoom,
    generationRadius,
    singleDoorWidth,
    doubleDoorWidth,
    clampedDoorHeight,
    getActiveLayerRange: () => ({ min: minActiveLayer, max: maxActiveLayer }),
    getCenterLayerIndex: () => centerLayerIndex,
    getCellProfileForLayer,
    getLayerProfiles,
    getLayerSeed,
    getCellEdgesForLayer,
    evaluateCellForFighter,
    directionOffsets,
    updateVertexBuffer: (vertexArray) => {
      const buffer = device.createBuffer({
        size: vertexArray.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
      new Float32Array(buffer.getMappedRange()).set(vertexArray);
      buffer.unmap();
      if (vertexBuffer) {
        vertexBuffer.destroy();
      }
      vertexBuffer = buffer;
      vertexCount = vertexArray.length / VERTEX_STRIDE;
    }
  });

  const { buildGeometryForCenter } = geometryBuilder;

  function getVisitedCellsForLayer(layerIndex) {
    let layerVisited = visitedCells.get(layerIndex);
    if (!layerVisited) {
      layerVisited = new Set();
      visitedCells.set(layerIndex, layerVisited);
    }
    return layerVisited;
  }

  function markCellVisited(layerIndex, x, z) {
    if (!getExistingCellEdgesForLayer(layerIndex, x, z)) {
      return;
    }

    const layerVisited = getVisitedCellsForLayer(layerIndex);
    const traversalStack = [[x, z]];
    const processed = new Set();

    while (traversalStack.length > 0) {
      const [currentX, currentZ] = traversalStack.pop();
      const cellKey = getCellKey(currentX, currentZ);
      if (processed.has(cellKey)) {
        continue;
      }

      processed.add(cellKey);
      layerVisited.add(cellKey);

      const cellEdges = getExistingCellEdgesForLayer(layerIndex, currentX, currentZ);
      if (!cellEdges) {
        continue;
      }

      for (const direction of Object.keys(directionOffsets)) {
        if (cellEdges[direction] !== 'open') {
          continue;
        }

        const offset = directionOffsets[direction];
        const neighborX = currentX + offset[0];
        const neighborZ = currentZ + offset[1];
        const neighborEdges = getExistingCellEdgesForLayer(layerIndex, neighborX, neighborZ);
        if (!neighborEdges) {
          continue;
        }

        const opposite = oppositeDirections[direction];
        if (neighborEdges[opposite] !== 'open') {
          continue;
        }

        traversalStack.push([neighborX, neighborZ]);
      }
    }
  }

  function getLayerIndexForHeight(height) {
    const value = Number.isFinite(height) ? height : 0;
    return positionToLayer(value, levelHeight, floorThickness);
  }

  function getMinimapSnapshot(playerPosition, options = {}) {
    if (!playerPosition) {
      return null;
    }

    const px = Number.isFinite(playerPosition[0]) ? playerPosition[0] : 0;
    const py = Number.isFinite(playerPosition[1]) ? playerPosition[1] : 0;
    const pz = Number.isFinite(playerPosition[2]) ? playerPosition[2] : 0;

    const resolvedRadius = Number.isFinite(options.radius) ? Math.floor(options.radius) : 3;
    const clampedRadius = Math.max(1, Math.min(resolvedRadius, generationRadius));
    const showUnvisitedRooms = Boolean(options.showUnvisitedRooms);
    const layerIndex = getLayerIndexForHeight(py);
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);

    const cells = [];
    const visited = visitedCells.get(layerIndex);
    for (let gx = cellX - clampedRadius; gx <= cellX + clampedRadius; gx += 1) {
      for (let gz = cellZ - clampedRadius; gz <= cellZ + clampedRadius; gz += 1) {
        const edges = getExistingCellEdgesForLayer(layerIndex, gx, gz);
        if (!edges) {
          continue;
        }
        if (!showUnvisitedRooms && visited && !visited.has(getCellKey(gx, gz))) {
          continue;
        }
        const key = getCellKey(gx, gz);
        cells.push({
          x: gx,
          z: gz,
          edges,
          roomType: edges.roomType ?? null
        });
      }
    }

    return {
      layerIndex,
      cell: { x: cellX, z: cellZ },
      radius: clampedRadius,
      cellSize: roomSize,
      halfCellSize: halfRoom,
      playerPosition: [px, py, pz],
      cells
    };
  }

  function isPositionWithinGenerationRadius(position, options = {}) {
    if (!position) {
      return false;
    }

    const px = Number(position[0]);
    const py = Number(position[1]);
    const pz = Number(position[2]);

    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      return false;
    }

    const horizontalPaddingValue = Number(options.horizontalPadding);
    const verticalPaddingValue = Number(options.verticalPadding);
    const horizontalPadding = Number.isFinite(horizontalPaddingValue)
      ? Math.max(0, Math.floor(horizontalPaddingValue))
      : 0;
    const verticalPadding = Number.isFinite(verticalPaddingValue)
      ? Math.max(0, Math.floor(verticalPaddingValue))
      : 0;

    const effectiveRadius = generationRadius + horizontalPadding;
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);
    const layerIndex = positionToLayer(py, levelHeight, floorThickness);

    if (Math.abs(cellX - centerCellX) > effectiveRadius) {
      return false;
    }

    if (Math.abs(cellZ - centerCellZ) > effectiveRadius) {
      return false;
    }

    return true;
  }

  function getRoomKeyForPosition(position) {
    if (!position) {
      return '';
    }
    const px = Number(position[0]);
    const py = Number(position[1]);
    const pz = Number(position[2]);

    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      return '';
    }

    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);
    const layerIndex = positionToLayer(py, levelHeight, floorThickness);
    return `${layerIndex}:${getCellKey(cellX, cellZ)}`;
  }

  function getDoorForEdge(layerIndex, ax, az, bx, bz) {
    if (!Array.isArray(doors)) {
      return null;
    }

    const id = `${createEdgeKey(ax, az, bx, bz)}@${layerIndex}`;
    return doors.find((door) => door.id === id) ?? null;
  }

  function getCellEdgeSnapshot(layerIndex, cellX, cellZ) {
    const edges = getExistingCellEdgesForLayer(layerIndex, cellX, cellZ);
    if (!edges) {
      return null;
    }

    return {
      north: edges.north,
      south: edges.south,
      east: edges.east,
      west: edges.west
    };
  }

  function positionToCellCoords(position) {
    if (!position) {
      return null;
    }

    const px = Number(position[0]);
    const py = Number(position[1]);
    const pz = Number(position[2]);

    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      return null;
    }

    return {
      cellX: positionToCell(px, roomSize, halfRoom),
      cellZ: positionToCell(pz, roomSize, halfRoom),
      layerIndex: positionToLayer(py, levelHeight, floorThickness)
    };
  }

  function getNavigationHelper() {
    return {
      roomSize,
      halfRoom,
      levelHeight,
      generationRadius,
      positionToCell: positionToCellCoords,
      getCellEdges: getCellEdgeSnapshot,
      getDoorBetween: getDoorForEdge,
      getRoomCenter: (cellX, cellZ, layerIndex = 0) => [
        cellX * roomSize,
        layerIndex * levelHeight,
        cellZ * roomSize
      ]
    };
  }

  function update(playerPosition) {
    const px = playerPosition?.[0] ?? 0;
    const py = playerPosition?.[1] ?? 0;
    const pz = playerPosition?.[2] ?? 0;
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);
    const layerIndex = positionToLayer(py, levelHeight, floorThickness);

    const needsRebuild =
      vertexBuffer === null ||
      cellX !== centerCellX ||
      cellZ !== centerCellZ ||
      layerIndex !== centerLayerIndex;

    if (!needsRebuild) {
      markCellVisited(layerIndex, cellX, cellZ);
      return false;
    }

    centerCellX = cellX;
    centerCellZ = cellZ;
    centerLayerIndex = layerIndex;
    buildGeometryForCenter(cellX, cellZ);
    markCellVisited(layerIndex, cellX, cellZ);
    return true;
  }

  buildGeometryForCenter(centerCellX, centerCellZ);

  return {
    update,
    getVertexBuffer: () => vertexBuffer,
    getVertexCount: () => vertexCount,
    getBounds: () => bounds,
    getColliders: () => colliders,
    getDoors: () => doors,
    getStorageChests: () => storageChests,
    getGeometry: () => ({ vertexBuffer, vertexCount, bounds }),
    getSeed: () => worldSeed,
    getLayerIndexForHeight,
    getLevelHeight: () => levelHeight,
    getMinimapSnapshot,
    getDecorativeLights: () => decorativeLights,
    getGenerationRadius: () => generationRadius,
    getActiveCenter: () => ({
      cellX: centerCellX,
      cellZ: centerCellZ,
      layerIndex: centerLayerIndex
    }),
    getRoomKeyForPosition,
    getNavigationHelper,
    isPositionWithinGenerationRadius,
    consumeFighterSpawnPoints,
    scheduleFighterSpawnPoint,
    dispose: () => {
      if (vertexBuffer) {
        vertexBuffer.destroy();
        vertexBuffer = null;
      }
    }
  };
}
