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

  const elevatorCallPanels = [];
  const registerElevatorCallPanel = (panel) => {
    if (!panel) {
      return;
    }
    elevatorCallPanels.push(panel);
  };
  const resetElevatorCallPanels = () => {
    elevatorCallPanels.length = 0;
  };

  let elevatorCarDescriptor = null;
  let elevatorCollider = null;
  let elevatorVerticalPosition = 0;
  let elevatorVerticalVelocity = 0;
  const elevatorTravelSpeed = Math.max(levelHeight * 0.8, 2.5);
  let lastElevatorUpdateTime =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const registerElevatorCarDescriptor = (descriptor) => {
    if (!descriptor) {
      elevatorCarDescriptor = null;
      elevatorCollider = null;
      return;
    }
    elevatorCarDescriptor = normalizeElevatorDescriptor(descriptor);
    updateElevatorCollider();
  };
  const resetElevatorCarDescriptor = () => {
    elevatorCarDescriptor = null;
    elevatorCollider = null;
  };

  let elevatorCurrentLayerIndex = 0;
  let elevatorTargetLayerIndex = 0;
  let elevatorLastCallLayerIndex = 0;
  let elevatorLastCallTimestamp = 0;
  elevatorVerticalPosition = elevatorCurrentLayerIndex * levelHeight;

  const {
    scheduleBarrelSpawnPoint,
    scheduleCameraSpawnPoint,
    consumeBarrelSpawnPoints,
    consumeCameraSpawnPoints,
    evaluateCellForBarrel,
    evaluateCellForCamera
  } = spawnManager;

  const getActiveLayerRange = () => ({ min: minActiveLayer, max: maxActiveLayer });

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
    getActiveLayerRange,
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
    registerElevatorCallPanel,
    resetElevatorCallPanels,
    registerElevatorCarDescriptor,
    resetElevatorCarDescriptor,
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

  function update(playerPosition, deltaTime = 0) {
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

    const now =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();
    const elapsedMs = now - lastElevatorUpdateTime;
    lastElevatorUpdateTime = now;
    const elevatorDeltaTime = Number.isFinite(deltaTime) && deltaTime > 0
      ? deltaTime
      : Math.max(elapsedMs / 1000, 0);
    advanceElevator(elevatorDeltaTime);

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

  function callElevatorToLayer(layerIndex) {
    const resolvedLayer = Number.isFinite(layerIndex) ? Math.floor(layerIndex) : 0;
    const { min: minLayer, max: maxLayer } = getActiveLayerRange();
    const clampedLayer = Math.min(Math.max(resolvedLayer, minLayer), maxLayer);
    elevatorTargetLayerIndex = clampedLayer;
    elevatorLastCallLayerIndex = clampedLayer;
    elevatorLastCallTimestamp = Date.now();
  }

  function advanceElevator(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      if (elevatorCurrentLayerIndex !== elevatorTargetLayerIndex) {
        elevatorCurrentLayerIndex = Math.round(elevatorVerticalPosition / levelHeight);
      }
      return;
    }

    const targetY = elevatorTargetLayerIndex * levelHeight;
    const distance = targetY - elevatorVerticalPosition;
    if (Math.abs(distance) <= 1e-4) {
      elevatorVerticalPosition = targetY;
      elevatorVerticalVelocity = 0;
      elevatorCurrentLayerIndex = elevatorTargetLayerIndex;
      updateElevatorCollider();
      return;
    }

    const direction = Math.sign(distance) || 1;
    const maxStep = elevatorTravelSpeed * deltaTime;
    let newPosition = elevatorVerticalPosition + direction * maxStep;
    if (direction > 0) {
      newPosition = Math.min(newPosition, targetY);
    } else {
      newPosition = Math.max(newPosition, targetY);
    }
    const actualStep = newPosition - elevatorVerticalPosition;
    elevatorVerticalVelocity = actualStep / deltaTime;
    elevatorVerticalPosition = newPosition;
    if (Math.abs(targetY - elevatorVerticalPosition) <= 1e-3) {
      elevatorVerticalPosition = targetY;
      elevatorVerticalVelocity = 0;
      elevatorCurrentLayerIndex = elevatorTargetLayerIndex;
    } else {
      elevatorCurrentLayerIndex = Math.round(elevatorVerticalPosition / levelHeight);
    }
    updateElevatorCollider();
  }

  function updateElevatorCollider() {
    if (!elevatorCarDescriptor) {
      elevatorCollider = null;
      return;
    }
    const halfSize = Math.max(0, elevatorCarDescriptor.halfSize ?? 0);
    elevatorCollider = {
      minX: elevatorCarDescriptor.center[0] - halfSize,
      maxX: elevatorCarDescriptor.center[0] + halfSize,
      minZ: elevatorCarDescriptor.center[1] - halfSize,
      maxZ: elevatorCarDescriptor.center[1] + halfSize,
      minY: elevatorVerticalPosition - (elevatorCarDescriptor.platformHeight ?? 0.05),
      maxY: elevatorVerticalPosition
    };
  }

  function normalizeElevatorDescriptor(raw) {
    if (!raw) {
      return null;
    }
    const centerArray = Array.isArray(raw.center) ? raw.center : [0, 0];
    const centerX = Number.isFinite(Number(centerArray[0])) ? Number(centerArray[0]) : 0;
    const centerZ = Number.isFinite(Number(centerArray[1])) ? Number(centerArray[1]) : 0;
    const baseY = Number.isFinite(Number(raw.baseY)) ? Number(raw.baseY) : 0;
    const toNumber = (value, fallback = baseY) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const toLocal = (value) => toNumber(value) - baseY;
    const indicator = raw.indicator || {};
    const indicatorCenterX = (toNumber(indicator.minX, centerX) + toNumber(indicator.maxX, centerX)) * 0.5;
    const indicatorCenterZ = (toNumber(indicator.minZ, centerZ) + toNumber(indicator.maxZ, centerZ)) * 0.5;

    return {
      id: raw.id || 'elevator',
      layerIndex: Number.isFinite(raw.layerIndex) ? Math.floor(raw.layerIndex) : 0,
      center: [centerX, centerZ],
      halfSize: Math.max(0, Number(raw.halfSize) || 0),
      platformHeight: Math.max(0.02, Number(raw.platformHeight) || 0.05),
      trimMargin: Math.max(0, Number(raw.trimMargin) || 0),
      trimHeight: Math.max(0, Number(raw.trimHeight) || 0),
      railThickness: Math.max(0, Number(raw.railThickness) || 0),
      railBaseOffset: toLocal(raw.railMinY),
      railHeight: Math.max(0, toNumber(raw.railMaxY) - toNumber(raw.railMinY)),
      postThickness: Math.max(0, Number(raw.postThickness) || 0),
      postBaseOffset: toLocal(raw.postMinY),
      postHeight: Math.max(0, toNumber(raw.postMaxY) - toNumber(raw.postMinY)),
      canopyBaseOffset: toLocal(raw.canopyMinY),
      canopyHeight: Math.max(0, toNumber(raw.canopyMaxY) - toNumber(raw.canopyMinY)),
      canopyInset: Math.max(0, Number(raw.canopyInset) || 0),
      indicator: {
        offsetX: indicatorCenterX - centerX,
        offsetZ: indicatorCenterZ - centerZ,
        depth: Math.max(0, toNumber(indicator.maxX, centerX) - toNumber(indicator.minX, centerX)),
        width: Math.max(0, toNumber(indicator.maxZ, centerZ) - toNumber(indicator.minZ, centerZ)),
        height: Math.max(0, toNumber(indicator.maxY) - toNumber(indicator.minY)),
        baseOffset: toLocal(indicator.minY)
      },
      colors: raw.colors || {}
    };
  }

  function getElevatorState() {
    return {
      currentLayerIndex: elevatorCurrentLayerIndex,
      targetLayerIndex: elevatorTargetLayerIndex,
      lastCallLayerIndex: elevatorLastCallLayerIndex,
      lastCallTimestamp: elevatorLastCallTimestamp,
      positionY: elevatorVerticalPosition,
      velocity: elevatorVerticalVelocity,
      isMoving: Math.abs(elevatorVerticalVelocity) > 1e-3 &&
        Math.abs(elevatorVerticalPosition - elevatorTargetLayerIndex * levelHeight) > 1e-3
    };
  }

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
    getElevatorCallPanels: () => elevatorCallPanels,
    getElevatorCarDescriptor: () => elevatorCarDescriptor,
    getElevatorCollider: () => elevatorCollider,
    callElevatorToLayer,
    getElevatorState,
    isPositionWithinGenerationRadius,
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
