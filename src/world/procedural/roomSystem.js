import {
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOUBLE_DOOR_WIDTH,
  DEFAULT_FLOOR_OPENING_MARGIN_RATIO,
  DEFAULT_FLOOR_THICKNESS,
  DEFAULT_GENERATION_RADIUS,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_ROOM_SIZE,
  DEFAULT_VERTICAL_LAYER_PADDING,
  DEFAULT_WALL_THICKNESS,
  VERTEX_STRIDE
} from './constants.js';
import { positionToCell, positionToLayer } from './spatial.js';
import { createCellState } from './roomSystem/cellState.js';
import { createSpawnManager } from './roomSystem/spawnManager.js';
import { createRoomGeometryBuilder } from './roomSystem/geometryBuilder.js';

const directionOffsets = {
  north: [0, -1],
  south: [0, 1],
  east: [1, 0],
  west: [-1, 0]
};

const cornerAdjacency = Object.freeze({
  north: Object.freeze(['east', 'west']),
  south: Object.freeze(['east', 'west']),
  east: Object.freeze(['north', 'south']),
  west: Object.freeze(['north', 'south'])
});

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
  const verticalLayerPadding = Math.max(
    1,
    Math.floor(options.verticalLayerPadding ?? DEFAULT_VERTICAL_LAYER_PADDING)
  );
  const floorOpeningMarginRatio = Math.min(
    0.45,
    Math.max(0.05, options.floorOpeningMarginRatio ?? DEFAULT_FLOOR_OPENING_MARGIN_RATIO)
  );
  const floorOpeningMargin = roomSize * floorOpeningMarginRatio;
  const halfRoom = roomSize * 0.5;
  const levelHeight = roomHeight + floorThickness;
  let centerLayerIndex = Math.floor(options.initialLayer ?? 0);
  let minActiveLayer = centerLayerIndex - verticalLayerPadding;
  let maxActiveLayer = centerLayerIndex + verticalLayerPadding;
  let elevatorOffset = 0;

  const worldSeed = (options.seed ?? Math.floor(Math.random() * 0xffffffff)) >>> 0;

  const clampedDoorHeight = Math.min(
    Math.max(doorHeight, roomHeight * 0.3),
    roomHeight - 0.2
  );

  const bounds = {
    minX: -halfRoom,
    maxX: halfRoom,
    minY: minActiveLayer * levelHeight - floorThickness,
    maxY: maxActiveLayer * levelHeight + roomHeight,
    minZ: -halfRoom,
    maxZ: halfRoom
  };

  let vertexBuffer = null;
  let vertexCount = 0;
  let centerCellX = 0;
  let centerCellZ = 0;

  const colliders = [];
  const decorativeLights = [];

  const cellState = createCellState(worldSeed);
  const {
    getCellKey,
    getLayerSeed,
    getLayerProfiles,
    getCellProfileForLayer,
    getExistingCellEdgesForLayer,
    getCellEdgesForLayer,
    getExistingVerticalOpeningStates,
    updateCellVerticalOpeningForLayer
  } = cellState;

  const spawnManager = createSpawnManager({
    getCellKey,
    getCellEdgesForLayer,
    roomSize,
    roomHeight,
    wallThickness,
    halfRoom,
    levelHeight,
    cornerAdjacency
  });

  const {
    scheduleBarrelSpawnPoint,
    scheduleCameraSpawnPoint,
    consumeBarrelSpawnPoints,
    consumeCameraSpawnPoints,
    evaluateCellForBarrel,
    evaluateCellForCamera
  } = spawnManager;

  const geometryBuilder = createRoomGeometryBuilder({
    bounds,
    colliders,
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
    getExistingVerticalOpeningStates,
    updateCellVerticalOpeningForLayer,
    evaluateCellForBarrel,
    evaluateCellForCamera,
    directionOffsets,
    getLayerIndexForHeight,
    getElevatorOffset: () => elevatorOffset,
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
    const layerIndex = getLayerIndexForHeight(py);
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);

    const cells = [];
    for (let gx = cellX - clampedRadius; gx <= cellX + clampedRadius; gx += 1) {
      for (let gz = cellZ - clampedRadius; gz <= cellZ + clampedRadius; gz += 1) {
        const edges = getExistingCellEdgesForLayer(layerIndex, gx, gz);
        if (!edges) {
          continue;
        }
        const key = getCellKey(gx, gz);
        const verticalOpeningStates = getExistingVerticalOpeningStates(key);
        cells.push({
          x: gx,
          z: gz,
          edges,
          verticalOpening:
            verticalOpeningStates && verticalOpeningStates instanceof Map
              ? verticalOpeningStates.get(layerIndex) ?? false
              : false,
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

    const effectiveMinLayer = minActiveLayer - verticalPadding;
    const effectiveMaxLayer = maxActiveLayer + verticalPadding;

    if (layerIndex < effectiveMinLayer || layerIndex > effectiveMaxLayer) {
      return false;
    }

    return true;
  }

  const elevatorTravelLimit = roomHeight * 0.9;

  function setElevatorOffset(offset) {
    const clampedOffset = Math.min(Math.max(offset, -elevatorTravelLimit), elevatorTravelLimit);
    if (!Number.isFinite(clampedOffset) || Math.abs(clampedOffset - elevatorOffset) < 1e-4) {
      return false;
    }
    elevatorOffset = clampedOffset;
    buildGeometryForCenter(centerCellX, centerCellZ);
    return true;
  }

  function adjustElevatorOffset(delta) {
    if (!Number.isFinite(delta) || Math.abs(delta) < 1e-6) {
      return false;
    }
    const target = elevatorOffset + delta;
    return setElevatorOffset(target);
  }

  function update(playerPosition) {
    const px = playerPosition?.[0] ?? 0;
    const py = playerPosition?.[1] ?? 0;
    const pz = playerPosition?.[2] ?? 0;
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);
    const layerIndex = positionToLayer(py, levelHeight, floorThickness);
    const desiredMinLayer = layerIndex - verticalLayerPadding;
    const desiredMaxLayer = layerIndex + verticalLayerPadding;

    const needsRebuild =
      vertexBuffer === null ||
      cellX !== centerCellX ||
      cellZ !== centerCellZ ||
      layerIndex !== centerLayerIndex ||
      desiredMinLayer !== minActiveLayer ||
      desiredMaxLayer !== maxActiveLayer;

    if (!needsRebuild) {
      return false;
    }

    centerCellX = cellX;
    centerCellZ = cellZ;
    centerLayerIndex = layerIndex;
    minActiveLayer = desiredMinLayer;
    maxActiveLayer = desiredMaxLayer;
    buildGeometryForCenter(cellX, cellZ);
    return true;
  }

  buildGeometryForCenter(centerCellX, centerCellZ);

  return {
    update,
    getVertexBuffer: () => vertexBuffer,
    getVertexCount: () => vertexCount,
    getBounds: () => bounds,
    getColliders: () => colliders,
    getGeometry: () => ({ vertexBuffer, vertexCount, bounds }),
    getSeed: () => worldSeed,
    getLayerIndexForHeight,
    getMinimapSnapshot,
    getDecorativeLights: () => decorativeLights,
    getGenerationRadius: () => generationRadius,
    getActiveCenter: () => ({
      cellX: centerCellX,
      cellZ: centerCellZ,
      layerIndex: centerLayerIndex
    }),
    isPositionWithinGenerationRadius,
    getElevatorOffset: () => elevatorOffset,
    setElevatorOffset,
    adjustElevatorOffset,
    consumeBarrelSpawnPoints,
    consumeCameraSpawnPoints,
    scheduleBarrelSpawnPoint,
    scheduleCameraSpawnPoint,
    dispose: () => {
      if (vertexBuffer) {
        vertexBuffer.destroy();
        vertexBuffer = null;
      }
    }
  };
}
