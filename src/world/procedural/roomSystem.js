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
import { createCellProfile, createEdgeKey, determineEdgeType } from './profile.js';
import {
  addFloorSlab,
  addHorizontalSection,
  addSlabColliders
} from './geometry.js';
import { addCagedElectricWallLight } from './decorations.js';
import {
  hashValue,
  randomFloatForEdge
} from './random.js';
import { positionToCell, positionToLayer } from './spatial.js';
import {
  buildDoorwayAlongX,
  buildDoorwayAlongZ,
  buildSolidWallAlongX,
  buildSolidWallAlongZ
} from './walls.js';

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

  const layerSeeds = new Map();
  const layerCellProfiles = new Map();
  const colliders = [];
  const cellLayerEdgeStates = new Map();
  const cellVerticalOpenings = new Map();
  const discoveredBarrelRooms = new Set();
  const pendingBarrelSpawns = [];
  const decorativeLights = [];

  function getCellKey(x, z) {
    return `${x},${z}`;
  }

  function getBarrelRoomKey(layerIndex, x, z) {
    return `${layerIndex}:${getCellKey(x, z)}`;
  }

  function getLayerSeed(layerIndex) {
    let seed = layerSeeds.get(layerIndex);
    if (seed === undefined) {
      seed = hashValue(layerIndex, worldSeed) >>> 0;
      layerSeeds.set(layerIndex, seed);
    }
    return seed;
  }

  function getLayerProfiles(layerIndex) {
    let profiles = layerCellProfiles.get(layerIndex);
    if (!profiles) {
      profiles = new Map();
      layerCellProfiles.set(layerIndex, profiles);
    }
    return profiles;
  }

  function getCellProfileForLayer(layerIndex, x, z) {
    const profiles = getLayerProfiles(layerIndex);
    const key = getCellKey(x, z);
    let profile = profiles.get(key);
    if (!profile) {
      profile = createCellProfile(x, z, getLayerSeed(layerIndex));
      profiles.set(key, profile);
    }
    return profile;
  }

  function getExistingCellEdgesForLayer(layerIndex, x, z) {
    const key = getCellKey(x, z);
    const perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      return null;
    }
    const edges = perLayer.get(layerIndex);
    if (!edges) {
      return null;
    }
    return {
      north: edges.north ?? null,
      south: edges.south ?? null,
      east: edges.east ?? null,
      west: edges.west ?? null
    };
  }

  function getCellEdgesForLayer(layerIndex, x, z) {
    const key = getCellKey(x, z);
    let perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      perLayer = new Map();
      cellLayerEdgeStates.set(key, perLayer);
    }
    let edges = perLayer.get(layerIndex);
    if (!edges) {
      edges = { north: null, south: null, east: null, west: null };
      perLayer.set(layerIndex, edges);
    }
    return edges;
  }

  function getVerticalOpeningStates(key) {
    let openings = cellVerticalOpenings.get(key);
    if (!openings) {
      openings = new Map();
      cellVerticalOpenings.set(key, openings);
    }
    return openings;
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
      pendingBarrelSpawns.push({ key: roomKey, position });
    }
  }

  function updateCellVerticalOpeningForLayer(x, z, layerIndex) {
    const key = getCellKey(x, z);
    const perLayer = cellLayerEdgeStates.get(key);
    const edges = perLayer ? perLayer.get(layerIndex) : null;

    let doorwayCount = 0;
    let openEdge = false;
    let closedCount = 0;

    if (edges) {
      const edgeStates = [edges.north, edges.south, edges.east, edges.west];
      for (let i = 0; i < edgeStates.length; i += 1) {
        const state = edgeStates[i];
        if (state === 'doorway') {
          doorwayCount += 1;
        } else if (state === 'open') {
          openEdge = true;
        } else {
          closedCount += 1;
        }
      }
    }

    const shouldOpen =
      (doorwayCount === 1 && closedCount >= 3 && !openEdge) || closedCount === 4;
    const openings = getVerticalOpeningStates(key);
    openings.set(layerIndex, shouldOpen);
  }

  function recordEdge(ax, az, bx, bz, layerTypes) {
    if (!Number.isFinite(ax) || !Number.isFinite(az) || !Number.isFinite(bx) || !Number.isFinite(bz)) {
      return;
    }

    const effectiveLayerTypes = new Map();
    if (layerTypes instanceof Map) {
      for (const [layerIndex, type] of layerTypes.entries()) {
        effectiveLayerTypes.set(layerIndex, type);
      }
    } else if (Array.isArray(layerTypes)) {
      for (let i = 0; i < layerTypes.length; i += 1) {
        const type = layerTypes[i];
        if (type !== undefined) {
          effectiveLayerTypes.set(i, type);
        }
      }
    } else if (typeof layerTypes === 'string') {
      effectiveLayerTypes.set(centerLayerIndex, layerTypes);
    }
    const dx = bx - ax;
    const dz = bz - az;
    let baseType = effectiveLayerTypes.get(centerLayerIndex);
    if (baseType === undefined) {
      const first = effectiveLayerTypes.values().next();
      baseType = first.done ? 'solid' : first.value;
    }

    for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
      const type = effectiveLayerTypes.get(layerIndex) ?? baseType;
      const edgesA = getCellEdgesForLayer(layerIndex, ax, az);
      const edgesB = getCellEdgesForLayer(layerIndex, bx, bz);

      if (dx === 1 && dz === 0) {
        edgesA.east = type;
        edgesB.west = type;
      } else if (dx === -1 && dz === 0) {
        edgesA.west = type;
        edgesB.east = type;
      } else if (dx === 0 && dz === 1) {
        edgesA.south = type;
        edgesB.north = type;
      } else if (dx === 0 && dz === -1) {
        edgesA.north = type;
        edgesB.south = type;
      }

      updateCellVerticalOpeningForLayer(ax, az, layerIndex);
      updateCellVerticalOpeningForLayer(bx, bz, layerIndex);

      evaluateCellForBarrel(ax, az, layerIndex);
      evaluateCellForBarrel(bx, bz, layerIndex);
    }
  }

  function resetBounds() {
    bounds.minX = Infinity;
    bounds.maxX = -Infinity;
    bounds.minY = Infinity;
    bounds.maxY = -Infinity;
    bounds.minZ = Infinity;
    bounds.maxZ = -Infinity;
  }

  function ensureBufferCapacity(vertexArray) {
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

  function buildGeometryForCenter(cx, cz) {
    const vertices = [];
    decorativeLights.length = 0;
    pendingBarrelSpawns.length = 0;
    resetBounds();
    colliders.length = 0;

    const processedEdges = new Set();

    for (let gx = cx - generationRadius; gx <= cx + generationRadius; gx += 1) {
      for (let gz = cz - generationRadius; gz <= cz + generationRadius; gz += 1) {
        const key = `${gx},${gz}`;
        const profilePerLayer = new Map();
        for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
          profilePerLayer.set(layerIndex, getCellProfileForLayer(layerIndex, gx, gz));
        }

        const centerX = gx * roomSize;
        const centerZ = gz * roomSize;
        const minX = centerX - halfRoom;
        const maxX = centerX + halfRoom;
        const minZ = centerZ - halfRoom;
        const maxZ = centerZ + halfRoom;

        const holeMinX = minX + floorOpeningMargin;
        const holeMaxX = maxX - floorOpeningMargin;
        const holeMinZ = minZ + floorOpeningMargin;
        const holeMaxZ = maxZ - floorOpeningMargin;

        const neighbors = [
          [gx + 1, gz],
          [gx - 1, gz],
          [gx, gz + 1],
          [gx, gz - 1]
        ];

        for (let i = 0; i < neighbors.length; i += 1) {
          const [nx, nz] = neighbors[i];
          const edgeKey = createEdgeKey(gx, gz, nx, nz);
          if (processedEdges.has(edgeKey)) {
            continue;
          }
          processedEdges.add(edgeKey);

          const edgeTypes = new Map();
          const neighborProfiles = new Map();
          for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
            const profiles = getLayerProfiles(layerIndex);
            const seed = getLayerSeed(layerIndex);
            edgeTypes.set(layerIndex, determineEdgeType(gx, gz, nx, nz, profiles, seed));
            neighborProfiles.set(layerIndex, getCellProfileForLayer(layerIndex, nx, nz));
          }

          recordEdge(gx, gz, nx, nz, edgeTypes);

          if (nx !== gx) {
            const wallX = (gx + nx) * 0.5 * roomSize;
            const edgeMinZ = Math.min(gz, nz) * roomSize - halfRoom;
            const edgeMaxZ = Math.max(gz, nz) * roomSize + halfRoom;
            for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
              const type = edgeTypes.get(layerIndex);
              if (type === 'open') {
                continue;
              }
              const profile = profilePerLayer.get(layerIndex);
              const neighborProfile = neighborProfiles.get(layerIndex);
              const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
              const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);
              const isDoubleDoor =
                type === 'doorway'
                  ? randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(layerIndex)) < 0.5
                  : false;
              const localDoorWidth = isDoubleDoor ? doubleDoorWidth : singleDoorWidth;
              const localDoorHeight = clampedDoorHeight;
              const baseY = layerIndex * levelHeight;
              if (type === 'solid') {
                buildSolidWallAlongX(
                  vertices,
                  wallX,
                  edgeMinZ,
                  edgeMaxZ,
                  roomHeight,
                  wallColor,
                  bounds,
                  wallThickness,
                  colliders,
                  baseY
                );
              } else if (type === 'doorway') {
                buildDoorwayAlongX(
                  vertices,
                  wallX,
                  edgeMinZ,
                  edgeMaxZ,
                  roomHeight,
                  localDoorHeight,
                  localDoorWidth,
                  wallColor,
                  accentColor,
                  bounds,
                  wallThickness,
                  colliders,
                  baseY
                );
              }
            }
          } else if (nz !== gz) {
            const wallZ = (gz + nz) * 0.5 * roomSize;
            const edgeMinX = Math.min(gx, nx) * roomSize - halfRoom;
            const edgeMaxX = Math.max(gx, nx) * roomSize + halfRoom;
            for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
              const type = edgeTypes.get(layerIndex);
              if (type === 'open') {
                continue;
              }
              const profile = profilePerLayer.get(layerIndex);
              const neighborProfile = neighborProfiles.get(layerIndex);
              const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
              const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);
              const isDoubleDoor =
                type === 'doorway'
                  ? randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(layerIndex)) < 0.5
                  : false;
              const localDoorWidth = isDoubleDoor ? doubleDoorWidth : singleDoorWidth;
              const localDoorHeight = clampedDoorHeight;
              const baseY = layerIndex * levelHeight;
              if (type === 'solid') {
                buildSolidWallAlongZ(
                  vertices,
                  wallZ,
                  edgeMinX,
                  edgeMaxX,
                  roomHeight,
                  wallColor,
                  bounds,
                  wallThickness,
                  colliders,
                  baseY
                );
              } else if (type === 'doorway') {
                buildDoorwayAlongZ(
                  vertices,
                  wallZ,
                  edgeMinX,
                  edgeMaxX,
                  roomHeight,
                  localDoorHeight,
                  localDoorWidth,
                  wallColor,
                  accentColor,
                  bounds,
                  wallThickness,
                  colliders,
                  baseY
                );
              }
            }
          }
        }

        const verticalOpeningStates = cellVerticalOpenings.get(key);

        for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
          const baseY = layerIndex * levelHeight;
          const ceilingY = baseY + roomHeight;
          const openFloor =
            layerIndex > minActiveLayer && verticalOpeningStates
              ? verticalOpeningStates.get(layerIndex) ?? false
              : false;
          const openCeiling =
            layerIndex < maxActiveLayer && verticalOpeningStates
              ? verticalOpeningStates.get(layerIndex + 1) ?? false
              : false;
          const isTopLayer = layerIndex === maxActiveLayer;
          const profile = profilePerLayer.get(layerIndex);

          const edges = getCellEdgesForLayer(layerIndex, gx, gz);
          if (edges) {
            const entries = [
              ['north', edges.north],
              ['south', edges.south],
              ['east', edges.east],
              ['west', edges.west]
            ];
            let solidDirection = null;
            let openCount = 0;
            let hasDoorway = false;
            let hasUnknown = false;

            for (let i = 0; i < entries.length; i += 1) {
              const [direction, state] = entries[i];
              if (state === 'open') {
                openCount += 1;
              } else if (state === 'solid') {
                if (solidDirection) {
                  solidDirection = null;
                  break;
                }
                solidDirection = direction;
              } else if (state === 'doorway') {
                hasDoorway = true;
              } else {
                hasUnknown = true;
                break;
              }
            }

            if (!hasUnknown && !hasDoorway && solidDirection && openCount === 3) {
              addCagedElectricWallLight(
                vertices,
                bounds,
                solidDirection,
                centerX,
                centerZ,
                baseY,
                layerIndex,
                roomSize,
                roomHeight,
                wallThickness,
                profile.wallColor,
                profile.accentColor,
                decorativeLights
              );
            }
          }

          addFloorSlab(
            vertices,
            baseY,
            floorThickness,
            minX,
            maxX,
            minZ,
            maxZ,
            profile.floorColor,
            profile.ceilingColor,
            bounds,
            openFloor,
            holeMinX,
            holeMaxX,
            holeMinZ,
            holeMaxZ,
            colliders
          );

          if (isTopLayer) {
            addHorizontalSection(
              vertices,
              ceilingY,
              minX,
              maxX,
              minZ,
              maxZ,
              [0, -1, 0],
              profile.ceilingColor,
              bounds,
              openCeiling,
              holeMinX,
              holeMaxX,
              holeMinZ,
              holeMaxZ
            );
            addHorizontalSection(
              vertices,
              ceilingY,
              minX,
              maxX,
              minZ,
              maxZ,
              [0, 1, 0],
              profile.ceilingColor,
              bounds,
              openCeiling,
              holeMinX,
              holeMaxX,
              holeMinZ,
              holeMaxZ
            );

            const ceilingThickness = Math.max(floorThickness, 0.05);
            addSlabColliders(
              colliders,
              minX,
              maxX,
              minZ,
              maxZ,
              ceilingY,
              ceilingY + ceilingThickness,
              openCeiling,
              holeMinX,
              holeMaxX,
              holeMinZ,
              holeMaxZ
            );
          }
        }
      }
    }

    const lowestLayerBottom = minActiveLayer * levelHeight - floorThickness;
    const highestLayerTop = maxActiveLayer * levelHeight + roomHeight;

    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = cx * roomSize - halfRoom;
      bounds.maxX = cx * roomSize + halfRoom;
      bounds.minY = lowestLayerBottom;
      bounds.maxY = highestLayerTop;
      bounds.minZ = cz * roomSize - halfRoom;
      bounds.maxZ = cz * roomSize + halfRoom;
    } else {
      bounds.minY = Math.min(bounds.minY, lowestLayerBottom);
      bounds.maxY = Math.max(bounds.maxY, highestLayerTop);
    }

    const vertexArray = new Float32Array(vertices);
    ensureBufferCapacity(vertexArray);
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

    const resolvedRadius = Number.isFinite(options.radius)
      ? Math.floor(options.radius)
      : 3;
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
        const verticalOpeningStates = cellVerticalOpenings.get(key);
        cells.push({
          x: gx,
          z: gz,
          edges,
          verticalOpening:
            verticalOpeningStates && verticalOpeningStates instanceof Map
              ? verticalOpeningStates.get(layerIndex) ?? false
              : false
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
    consumeBarrelSpawnPoints: () => {
      if (pendingBarrelSpawns.length === 0) {
        return [];
      }
      return pendingBarrelSpawns.splice(0, pendingBarrelSpawns.length);
    },
    dispose: () => {
      if (vertexBuffer) {
        vertexBuffer.destroy();
        vertexBuffer = null;
      }
    }
  };
}
