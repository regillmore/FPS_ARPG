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
import { mixColors } from './color.js';
import { mat4FromRotationTranslation } from '../../math.js';
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
  let elevatorGateProgress = 0;
  let elevatorPanel = null;
  let elevatorBounds = null;
  let persistentOriginElevator = null;
  const visitedCells = new Map();

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
  const storageChests = [];
  const decorativeLights = [];
  const doors = [];
  const doorPanelCache = new Map();
  let lastKnownPlayerPosition = new Float32Array(3);

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
    consumeBarrelSpawnPoints,
    evaluateCellForBarrel
  } = spawnManager;

  function normalizeDirection2D(dir) {
    const x = Number(dir?.[0]) || 0;
    const z = Number(dir?.[2]) || 0;
    const length = Math.max(Math.hypot(x, z), 1e-5);
    return [x / length, 0, z / length];
  }

  function rotateAroundY(vec, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = vec[0] * cos - vec[2] * sin;
    const z = vec[0] * sin + vec[2] * cos;
    return [x, 0, z];
  }

  function createDoorPanelGeometry(color) {
    const base = Array.isArray(color) && color.length >= 3 ? color : [0.6, 0.62, 0.68];
    const edge = mixColors(base, [0.18, 0.18, 0.2], 0.35);
    const front = mixColors(base, [0.85, 0.85, 0.92], 0.15);
    const handle = mixColors(base, [0.92, 0.84, 0.6], 0.5);

    const minX = 0;
    const maxX = 1;
    const minY = 0;
    const maxY = 1;
    const minZ = -0.5;
    const maxZ = 0.5;

    const vertices = [];

    function pushVertex(px, py, pz, nx, ny, nz, c) {
      vertices.push(px, py, pz, nx, ny, nz, c[0], c[1], c[2], 0);
    }

    function pushQuad(corners, normal, colorValue) {
      const [a, b, c, d] = corners;
      pushVertex(...a, ...normal, colorValue);
      pushVertex(...c, ...normal, colorValue);
      pushVertex(...b, ...normal, colorValue);
      pushVertex(...a, ...normal, colorValue);
      pushVertex(...d, ...normal, colorValue);
      pushVertex(...c, ...normal, colorValue);
    }

    pushQuad(
      [
        [minX, maxY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ],
      [0, 1, 0],
      edge
    );

    pushQuad(
      [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [minX, minY, minZ]
      ],
      [0, -1, 0],
      edge
    );

    pushQuad(
      [
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ]
      ],
      [1, 0, 0],
      edge
    );

    pushQuad(
      [
        [minX, minY, maxZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [minX, maxY, maxZ]
      ],
      [-1, 0, 0],
      edge
    );

    pushQuad(
      [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ],
      [0, 0, 1],
      front
    );

    pushQuad(
      [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ],
      [0, 0, -1],
      mixColors(front, edge, 0.45)
    );

    const handleWidth = 0.12;
    const handleHeight = 0.16;
    const handleDepth = 0.08;
    const handleInsetX = Math.max(maxX - handleWidth * 1.8, minX + handleWidth * 0.5);
    const handleCenterY = (maxY + minY) * 0.5;
    const handleMinX = handleInsetX;
    const handleMaxX = handleInsetX + handleWidth;
    const handleMinY = handleCenterY - handleHeight * 0.5;
    const handleMaxY = handleCenterY + handleHeight * 0.5;
    const handleMinZ = -handleDepth * 0.5;
    const handleMaxZ = handleDepth * 0.5;

    pushQuad(
      [
        [handleMinX, handleMinY, handleMaxZ],
        [handleMaxX, handleMinY, handleMaxZ],
        [handleMaxX, handleMaxY, handleMaxZ],
        [handleMinX, handleMaxY, handleMaxZ]
      ],
      [0, 0, 1],
      handle
    );

    pushQuad(
      [
        [handleMinX, handleMaxY, handleMinZ],
        [handleMaxX, handleMaxY, handleMinZ],
        [handleMaxX, handleMaxY, handleMaxZ],
        [handleMinX, handleMaxY, handleMaxZ]
      ],
      [0, 1, 0],
      mixColors(handle, edge, 0.35)
    );

    pushQuad(
      [
        [handleMinX, handleMinY, handleMinZ],
        [handleMaxX, handleMinY, handleMinZ],
        [handleMaxX, handleMinY, handleMaxZ],
        [handleMinX, handleMinY, handleMaxZ]
      ],
      [0, -1, 0],
      mixColors(handle, edge, 0.35)
    );

    pushQuad(
      [
        [handleMaxX, handleMinY, handleMinZ],
        [handleMaxX, handleMinY, handleMaxZ],
        [handleMaxX, handleMaxY, handleMaxZ],
        [handleMaxX, handleMaxY, handleMinZ]
      ],
      [1, 0, 0],
      mixColors(handle, edge, 0.2)
    );

    pushQuad(
      [
        [handleMinX, handleMinY, handleMaxZ],
        [handleMinX, handleMinY, handleMinZ],
        [handleMinX, handleMaxY, handleMinZ],
        [handleMinX, handleMaxY, handleMaxZ]
      ],
      [-1, 0, 0],
      mixColors(handle, edge, 0.2)
    );

    pushQuad(
      [
        [handleMinX, handleMaxY, handleMinZ],
        [handleMaxX, handleMaxY, handleMinZ],
        [handleMaxX, handleMinY, handleMinZ],
        [handleMinX, handleMinY, handleMinZ]
      ],
      [0, 0, -1],
      mixColors(handle, edge, 0.4)
    );

    const vertexArray = new Float32Array(vertices);
    const buffer = device.createBuffer({
      size: vertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(vertexArray);
    buffer.unmap();

    return {
      vertexBuffer: buffer,
      vertexCount: vertexArray.length / VERTEX_STRIDE
    };
  }

  function destroyDoor(door) {
    door?.uniformBuffer?.destroy?.();
    door.vertexBuffer = null;
    door.uniformBuffer = null;
    door.uniformBindGroup = null;
    door.uniformData = null;
  }

  function disposeDoors() {
    for (let i = 0; i < doors.length; i += 1) {
      destroyDoor(doors[i]);
    }
    doors.length = 0;
  }

  function disposeDoorPanelCache() {
    for (const geometry of doorPanelCache.values()) {
      geometry?.vertexBuffer?.destroy?.();
    }
    doorPanelCache.clear();
  }

  function registerDoor(doorData) {
    if (!doorData || !device) {
      return;
    }

    const baseColor = Array.isArray(doorData.color) ? doorData.color : [0.58, 0.6, 0.66];
    const cacheKey = baseColor.join(',');
    let geometry = doorPanelCache.get(cacheKey);
    if (!geometry) {
      geometry = createDoorPanelGeometry(baseColor);
      doorPanelCache.set(cacheKey, geometry);
    }

    const hinge = new Float32Array([doorData.hinge?.[0] ?? 0, doorData.hinge?.[1] ?? 0, doorData.hinge?.[2] ?? 0]);
    const widthDir = normalizeDirection2D(doorData.widthDir);
    const forwardDir = normalizeDirection2D(doorData.forwardDir);
    const door = {
      hinge,
      widthDir: new Float32Array(widthDir),
      forwardDir: new Float32Array(forwardDir),
      width: Math.max(Number(doorData.width) || 0, 0.4),
      height: Math.max(Number(doorData.height) || 0, 1.2),
      thickness: Math.max(Number(doorData.thickness) || 0.06, 0.04),
      color: new Float32Array(baseColor),
      vertexBuffer: geometry.vertexBuffer,
      vertexCount: geometry.vertexCount,
      modelMatrix: new Float32Array(16),
      currentAngle: 0,
      targetAngle: 0
    };

    doors.push(door);
  }

  function updateDoorModelMatrix(door) {
    if (!door || !door.modelMatrix) {
      return;
    }
    const rotatedWidth = rotateAroundY(door.widthDir, door.currentAngle);
    const rotatedForward = rotateAroundY(door.forwardDir, door.currentAngle);
    const right = [rotatedWidth[0] * door.width, rotatedWidth[1] * door.width, rotatedWidth[2] * door.width];
    const up = [0, door.height, 0];
    const forward = [rotatedForward[0] * door.thickness, rotatedForward[1] * door.thickness, rotatedForward[2] * door.thickness];
    mat4FromRotationTranslation(door.modelMatrix, right, up, forward, door.hinge);
  }

  function updateDoors(deltaTime = 0, playerPosition = lastKnownPlayerPosition) {
    if (!Array.isArray(doors) || doors.length === 0) {
      return;
    }

    const px = Number(playerPosition?.[0]) || 0;
    const py = Number(playerPosition?.[1]) || 0;
    const pz = Number(playerPosition?.[2]) || 0;
    const openRadiusBase = Math.max(roomSize * 0.18, 1.6);
    const swingSpeed = 4.5;
    const maxSwingAngle = Math.PI * 0.55;

    for (const door of doors) {
      const hinge = door.hinge;
      const dx = px - hinge[0];
      const dz = pz - hinge[2];
      const sideSignRaw = dx * door.forwardDir[0] + dz * door.forwardDir[2];
      const sideSign = sideSignRaw >= 0 ? 1 : -1;
      const alongWidth = Math.max(0, Math.min(door.width, dx * door.widthDir[0] + dz * door.widthDir[2]));
      const closestX = hinge[0] + door.widthDir[0] * alongWidth;
      const closestZ = hinge[2] + door.widthDir[2] * alongWidth;
      const lateralDistance = Math.hypot(px - closestX, pz - closestZ);
      const verticalCenter = hinge[1] + door.height * 0.5;
      const verticalDistance = Math.max(0, Math.abs(py - verticalCenter) - door.height * 0.55);
      const distance = lateralDistance + verticalDistance * 0.8;
      const openRadius = openRadiusBase + door.width * 0.35;
      const openness = Math.max(0, 1 - distance / openRadius);
      const targetAngle = -sideSign * maxSwingAngle * openness;
      const delta = targetAngle - door.currentAngle;
      const maxStep = swingSpeed * deltaTime;
      if (deltaTime <= 0 || !Number.isFinite(maxStep)) {
        door.currentAngle = targetAngle;
      } else if (Math.abs(delta) > 1e-4) {
        const clampedStep = Math.abs(delta) <= maxStep
          ? delta
          : Math.sign(delta) * maxStep;
        door.currentAngle += clampedStep;
      }
      door.targetAngle = targetAngle;
      updateDoorModelMatrix(door);
    }
  }

  const geometryBuilder = createRoomGeometryBuilder({
    bounds,
    colliders,
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
    getExistingVerticalOpeningStates,
    updateCellVerticalOpeningForLayer,
    evaluateCellForBarrel,
    directionOffsets,
    getLayerIndexForHeight,
    getElevatorGateProgress: () => elevatorGateProgress,
    getElevatorOffset: () => elevatorOffset,
    setElevatorPanel: (panel) => {
      if (!panel) {
        elevatorPanel = null;
        return;
      }
      const bounds = panel.bounds ?? {};
      elevatorPanel = {
        center: panel.center ?? null,
        color: panel.color ?? null,
        bounds: {
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY,
          minZ: bounds.minZ,
          maxZ: bounds.maxZ
        }
      };
    },
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
    },
    setElevatorBounds: (bounds) => {
      if (!bounds) {
        elevatorBounds = null;
        return;
      }
      elevatorBounds = {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
        floorY: bounds.floorY,
        canopyMinX: bounds.canopyMinX,
        canopyMaxX: bounds.canopyMaxX,
        canopyMinZ: bounds.canopyMinZ,
        canopyMaxZ: bounds.canopyMaxZ,
        canopyMinY: bounds.canopyMinY,
        canopyMaxY: bounds.canopyMaxY
      };

      const centerX = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
      const centerZ = (Number(bounds.minZ) + Number(bounds.maxZ)) * 0.5;
      const layerIndex = getLayerIndexForHeight(elevatorOffset);
      if (Number.isFinite(centerX) && Number.isFinite(centerZ) && Number.isFinite(layerIndex)) {
        persistentOriginElevator = { x: centerX, z: centerZ, layerIndex };
      }
    },
    registerDoor
  });

  const { buildGeometryForCenter: buildGeometryCore } = geometryBuilder;

  function buildGeometryForCenter(cx, cz) {
    disposeDoors();
    buildGeometryCore(cx, cz);
    updateDoors(0, lastKnownPlayerPosition);
  }

  function getVisitedCellsForLayer(layerIndex) {
    let layerVisited = visitedCells.get(layerIndex);
    if (!layerVisited) {
      layerVisited = new Set();
      visitedCells.set(layerIndex, layerVisited);
    }
    return layerVisited;
  }

  function markCellVisited(layerIndex, x, z) {
    const edges = getExistingCellEdgesForLayer(layerIndex, x, z);
    if (!edges) {
      return;
    }
    const key = getCellKey(x, z);
    getVisitedCellsForLayer(layerIndex).add(key);
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

    let originElevator = null;
    const elevatorLayerIndex = getLayerIndexForHeight(elevatorOffset);
    if (elevatorBounds) {
      const centerX = (Number(elevatorBounds.minX) + Number(elevatorBounds.maxX)) * 0.5;
      const centerZ = (Number(elevatorBounds.minZ) + Number(elevatorBounds.maxZ)) * 0.5;
      if (Number.isFinite(centerX) && Number.isFinite(centerZ)) {
        originElevator = { x: centerX, z: centerZ, layerIndex: elevatorLayerIndex };
      }
    }

    if (!originElevator && persistentOriginElevator) {
      originElevator = {
        x: persistentOriginElevator.x,
        z: persistentOriginElevator.z,
        layerIndex: persistentOriginElevator.layerIndex
      };
    }

    return {
      layerIndex,
      cell: { x: cellX, z: cellZ },
      radius: clampedRadius,
      cellSize: roomSize,
      halfCellSize: halfRoom,
      playerPosition: [px, py, pz],
      originElevator,
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

  function setElevatorOffset(offset) {
    if (!Number.isFinite(offset) || Math.abs(offset - elevatorOffset) < 1e-4) {
      return false;
    }
    elevatorOffset = offset;
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

  function setElevatorGateProgress(progress) {
    if (!Number.isFinite(progress)) {
      return false;
    }

    const clamped = Math.min(Math.max(progress, 0), 1);
    if (Math.abs(clamped - elevatorGateProgress) < 1e-4) {
      return false;
    }

    elevatorGateProgress = clamped;
    buildGeometryForCenter(centerCellX, centerCellZ);
    return true;
  }

  function update(playerPosition) {
    const px = playerPosition?.[0] ?? 0;
    const py = playerPosition?.[1] ?? 0;
    const pz = playerPosition?.[2] ?? 0;
    lastKnownPlayerPosition[0] = px;
    lastKnownPlayerPosition[1] = py;
    lastKnownPlayerPosition[2] = pz;
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
      markCellVisited(layerIndex, cellX, cellZ);
      return false;
    }

    centerCellX = cellX;
    centerCellZ = cellZ;
    centerLayerIndex = layerIndex;
    minActiveLayer = desiredMinLayer;
    maxActiveLayer = desiredMaxLayer;
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
    getStorageChests: () => storageChests,
    getGeometry: () => ({ vertexBuffer, vertexCount, bounds }),
    getSeed: () => worldSeed,
    getLayerIndexForHeight,
    getLevelHeight: () => levelHeight,
    getMinimapSnapshot,
    getDecorativeLights: () => decorativeLights,
    getGenerationRadius: () => generationRadius,
    getElevatorPanel: () => elevatorPanel,
    getElevatorBounds: () => elevatorBounds,
    getActiveCenter: () => ({
      cellX: centerCellX,
      cellZ: centerCellZ,
      layerIndex: centerLayerIndex
    }),
    isPositionWithinGenerationRadius,
    getElevatorOffset: () => elevatorOffset,
    getElevatorGateProgress: () => elevatorGateProgress,
    getDoors: () => doors,
    updateDoors,
    setElevatorOffset,
    adjustElevatorOffset,
    setElevatorGateProgress,
    consumeBarrelSpawnPoints,
    scheduleBarrelSpawnPoint,
    dispose: () => {
      if (vertexBuffer) {
        vertexBuffer.destroy();
        vertexBuffer = null;
      }
      disposeDoors();
      disposeDoorPanelCache();
    }
  };
}
