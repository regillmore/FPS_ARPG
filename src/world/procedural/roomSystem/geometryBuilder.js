import { mixColors } from '../color.js';
import { createEdgeKey, determineEdgeType } from '../profile.js';
import {
  addFloorSlab,
  addHorizontalSection,
  addSlabColliders,
  addBox,
  addCollider
} from '../geometry.js';
import { buildElevatorCar } from '../elevatorCar.js';
import { addCagedElectricWallLight } from '../decorations.js';
import { randomFloatForEdge } from '../random.js';
import { buildDoorwayAlongX, buildDoorwayAlongZ, buildSolidWallAlongX, buildSolidWallAlongZ } from '../walls.js';
import { addStorageChest } from '../storageChest.js';

function isOriginCell(x, z) {
  return x === 0 && z === 0;
}

function calculateSingleDoorwayBias(spanLength, doorWidth, directionRandom) {
  const halfSpan = spanLength * 0.5;
  const halfOpening = Math.min(doorWidth * 0.5, spanLength * 0.45);
  const availableBias = Math.max(0, halfSpan - halfOpening);
  if (availableBias < 1e-5) {
    return 0;
  }

  const direction = directionRandom < 0.5 ? -1 : 1;
  const targetBias = direction * halfSpan * 0.7;
  return Math.max(-availableBias, Math.min(targetBias, availableBias));
}

function calculateDoorOpening(min, max, doorWidth, openingCenterBias = 0) {
  const halfOpening = Math.min(doorWidth * 0.5, (max - min) * 0.45);
  const halfSpan = (max - min) * 0.5;
  const maxBias = Math.max(0, halfSpan - halfOpening);
  const clampedBias = Math.max(-maxBias, Math.min(openingCenterBias, maxBias));
  const openingCenter = (min + max) * 0.5 + clampedBias;
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;

  return { openingMin, openingMax };
}

function getForcedOriginEdgeState(ax, az, bx, bz) {
  const originInvolved = isOriginCell(ax, az) || isOriginCell(bx, bz);
  if (!originInvolved || (ax === bx && az === bz)) {
    return null;
  }

  if (ax === bx && Math.abs(az - bz) === 1) {
    // North/South adjacency
    return 'doorway';
  }

  if (az === bz && Math.abs(ax - bx) === 1) {
    // East/West adjacency
    return 'solid';
  }

  return null;
}

function isOriginHallwayDoorway(ax, az, bx, bz) {
  return getForcedOriginEdgeState(ax, az, bx, bz) === 'doorway';
}

export function createRoomGeometryBuilder({
  bounds,
  colliders,
  storageChests,
  decorativeLights,
  doors,
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
  getCenterLayerIndex,
  getCellProfileForLayer,
  getLayerProfiles,
  getLayerSeed,
  getCellEdgesForLayer,
  getExistingVerticalOpeningStates,
  updateCellVerticalOpeningForLayer,
  evaluateCellForBarrel,
  directionOffsets,
  updateVertexBuffer,
  getLayerIndexForHeight,
  getElevatorGateProgress,
  getElevatorOffset,
  setElevatorPanel,
  setElevatorBounds
}) {
  function resetBounds() {
    bounds.minX = Infinity;
    bounds.maxX = -Infinity;
    bounds.minY = Infinity;
    bounds.maxY = -Infinity;
    bounds.minZ = Infinity;
    bounds.maxZ = -Infinity;
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
      effectiveLayerTypes.set(getCenterLayerIndex(), layerTypes);
    }
    const dx = bx - ax;
    const dz = bz - az;
    let baseType = effectiveLayerTypes.get(getCenterLayerIndex());
    if (baseType === undefined) {
      const first = effectiveLayerTypes.values().next();
      baseType = first.done ? 'solid' : first.value;
    }

    const { min: minActiveLayer, max: maxActiveLayer } = getActiveLayerRange();
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

  function addHallwayBridge(
    vertices,
    orientation,
    minX,
    maxX,
    minZ,
    maxZ,
    baseY,
    corridorHeight,
    corridorWidth,
    localWallThickness,
    floorColor,
    wallColor,
    accentColor
  ) {
    const length = orientation === 'x' ? maxX - minX : maxZ - minZ;
    const availableWidth = orientation === 'x' ? maxZ - minZ : maxX - minX;
    if (length <= 0 || availableWidth <= 0) {
      return;
    }

    const clampedWidth = Math.min(Math.max(corridorWidth, 0.5), availableWidth * 0.9);
    const sideSpace = Math.max(availableWidth - clampedWidth, 0);
    const sideThickness = Math.min(Math.max(sideSpace * 0.5, 0), localWallThickness * 0.85);
    const halfWidth = clampedWidth * 0.5;
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const floorMinY = baseY;
    const floorMaxY = floorMinY + Math.min(0.12, corridorHeight * 0.05);
    const wallTopY = Math.min(baseY + corridorHeight * 0.66, baseY + corridorHeight - 0.2);
    const capMinY = wallTopY;
    const capMaxY = Math.min(capMinY + Math.min(corridorHeight * 0.1, 0.3), baseY + corridorHeight);
    const walkwayColor = mixColors(floorColor, accentColor, 0.4);
    const sideColor = mixColors(wallColor, accentColor, 0.3);
    const capColor = mixColors(wallColor, accentColor, 0.55);

    if (orientation === 'x') {
      const corridorMinZ = Math.max(minZ, centerZ - halfWidth);
      const corridorMaxZ = Math.min(maxZ, centerZ + halfWidth);
      addBox(vertices, minX, floorMinY, corridorMinZ, maxX, floorMaxY, corridorMaxZ, walkwayColor, bounds);

      if (sideThickness > 1e-3) {
        const leftThickness = Math.min(sideThickness, Math.max(0, corridorMinZ - minZ));
        if (leftThickness > 1e-3) {
          const leftMinZ = Math.max(minZ, corridorMinZ - leftThickness);
          const leftMaxZ = Math.max(leftMinZ, corridorMinZ);
          addBox(vertices, minX, baseY, leftMinZ, maxX, wallTopY, leftMaxZ, sideColor, bounds);
          addCollider(colliders, minX, baseY, leftMinZ, maxX, wallTopY, leftMaxZ);
        }

        const rightThickness = Math.min(sideThickness, Math.max(0, maxZ - corridorMaxZ));
        if (rightThickness > 1e-3) {
          const rightMinZ = Math.min(corridorMaxZ, maxZ - rightThickness);
          const rightMaxZ = Math.min(maxZ, corridorMaxZ + rightThickness);
          addBox(vertices, minX, baseY, rightMinZ, maxX, wallTopY, rightMaxZ, sideColor, bounds);
          addCollider(colliders, minX, baseY, rightMinZ, maxX, wallTopY, rightMaxZ);
        }
      }

      const capInsetZ = 0;
      const capMinZ = Math.min(corridorMaxZ, corridorMinZ + capInsetZ);
      const capMaxZ = Math.max(capMinZ, corridorMaxZ - capInsetZ);
      if (capMaxZ - capMinZ > 1e-3) {
        addBox(vertices, minX, capMinY, capMinZ, maxX, capMaxY, capMaxZ, capColor, bounds);
      }
    } else {
      const corridorMinX = Math.max(minX, centerX - halfWidth);
      const corridorMaxX = Math.min(maxX, centerX + halfWidth);
      addBox(vertices, corridorMinX, floorMinY, minZ, corridorMaxX, floorMaxY, maxZ, walkwayColor, bounds);

      if (sideThickness > 1e-3) {
        const leftThickness = Math.min(sideThickness, Math.max(0, corridorMinX - minX));
        if (leftThickness > 1e-3) {
          const leftMinX = Math.max(minX, corridorMinX - leftThickness);
          const leftMaxX = Math.max(leftMinX, corridorMinX);
          addBox(vertices, leftMinX, baseY, minZ, leftMaxX, wallTopY, maxZ, sideColor, bounds);
          addCollider(colliders, leftMinX, baseY, minZ, leftMaxX, wallTopY, maxZ);
        }

        const rightThickness = Math.min(sideThickness, Math.max(0, maxX - corridorMaxX));
        if (rightThickness > 1e-3) {
          const rightMinX = Math.min(corridorMaxX, maxX - rightThickness);
          const rightMaxX = Math.min(maxX, corridorMaxX + rightThickness);
          addBox(vertices, rightMinX, baseY, minZ, rightMaxX, wallTopY, maxZ, sideColor, bounds);
          addCollider(colliders, rightMinX, baseY, minZ, rightMaxX, wallTopY, maxZ);
        }
      }

      const capInsetX = 0;
      const capMinX = Math.min(corridorMaxX, corridorMinX + capInsetX);
      const capMaxX = Math.max(capMinX, corridorMaxX - capInsetX);
      if (capMaxX - capMinX > 1e-3) {
        addBox(vertices, capMinX, capMinY, minZ, capMaxX, capMaxY, maxZ, capColor, bounds);
      }
    }
  }

  function addDoorwayBalcony(
    vertices,
    direction,
    minX,
    maxX,
    minZ,
    maxZ,
    baseY,
    roomHeight,
    wallThickness,
    colliders,
    cellEdges,
    doorWidth,
    openingCenter,
    floorColor,
    wallColor,
    accentColor,
    bounds
  ) {
    if (!direction) {
      return;
    }

    const spanX = maxX - minX;
    const spanZ = maxZ - minZ;
    const crossSpan = direction === 'north' || direction === 'south' ? spanX : spanZ;
    const depthSpan = direction === 'north' || direction === 'south' ? spanZ : spanX;
    const localDoorWidth = doorWidth ?? doubleDoorWidth;
    const deckDepth = Math.min(Math.max(depthSpan * 0.35, localDoorWidth * 0.75), depthSpan * 0.55);
    const deckWidth = Math.min(
      Math.max(localDoorWidth * 3.5, localDoorWidth),
      crossSpan - wallThickness * 0.4
    );
    if (deckDepth <= 1e-4 || deckWidth <= 1e-4) {
      return;
    }

    const deckThickness = Math.min(Math.max(roomHeight * 0.05, 0.06), 0.18);
    const deckMinY = baseY - deckThickness;
    const deckMaxY = deckMinY + deckThickness;
    const deckColor = mixColors(floorColor, accentColor, 0.35);
    const railColor = mixColors(wallColor, accentColor, 0.55);
    const railHeight = Math.min(roomHeight * 0.15, roomHeight - 0.25);
    const railThickness = Math.min(Math.max(wallThickness * 0.5, 0.05), deckDepth * 0.35);
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;

    let deckMinX = minX;
    let deckMaxX = maxX;
    let deckMinZ = minZ;
    let deckMaxZ = maxZ;

    const attachesToNegativeSide =
      direction === 'north' || direction === 'south'
        ? (openingCenter ?? centerX) - minX <= maxX - (openingCenter ?? centerX)
        : (openingCenter ?? centerZ) - minZ <= maxZ - (openingCenter ?? centerZ);
    const attachToWest = direction === 'north' || direction === 'south' ? attachesToNegativeSide : null;
    const attachToNorth = direction === 'east' || direction === 'west' ? attachesToNegativeSide : null;

    const effectiveDeckWidth = Math.min(deckWidth, direction === 'north' || direction === 'south' ? spanX : spanZ);

    if (direction === 'north') {
      deckMinZ = minZ;
      deckMaxZ = Math.min(maxZ, minZ + deckDepth);
      if (attachToWest) {
        deckMinX = minX;
        deckMaxX = Math.min(maxX, deckMinX + effectiveDeckWidth);
      } else {
        deckMaxX = maxX;
        deckMinX = Math.max(minX, deckMaxX - effectiveDeckWidth);
      }
    } else if (direction === 'south') {
      deckMinZ = Math.max(minZ, maxZ - deckDepth);
      deckMaxZ = maxZ;
      if (attachToWest) {
        deckMinX = minX;
        deckMaxX = Math.min(maxX, deckMinX + effectiveDeckWidth);
      } else {
        deckMaxX = maxX;
        deckMinX = Math.max(minX, deckMaxX - effectiveDeckWidth);
      }
    } else if (direction === 'east') {
      deckMinX = Math.max(minX, maxX - deckDepth);
      deckMaxX = maxX;
      if (attachToNorth) {
        deckMinZ = minZ;
        deckMaxZ = Math.min(maxZ, deckMinZ + effectiveDeckWidth);
      } else {
        deckMaxZ = maxZ;
        deckMinZ = Math.max(minZ, deckMaxZ - effectiveDeckWidth);
      }
    } else if (direction === 'west') {
      deckMinX = minX;
      deckMaxX = Math.min(maxX, minX + deckDepth);
      if (attachToNorth) {
        deckMinZ = minZ;
        deckMaxZ = Math.min(maxZ, deckMinZ + effectiveDeckWidth);
      } else {
        deckMaxZ = maxZ;
        deckMinZ = Math.max(minZ, deckMaxZ - effectiveDeckWidth);
      }
    }

    if (deckMinX >= deckMaxX || deckMinZ >= deckMaxZ) {
      return;
    }

    addBox(vertices, deckMinX, deckMinY, deckMinZ, deckMaxX, deckMaxY, deckMaxZ, deckColor, bounds);
    addCollider(colliders, deckMinX, deckMinY, deckMinZ, deckMaxX, deckMaxY, deckMaxZ);

    if (railHeight > 1e-4 && railThickness > 1e-4) {
      const railMinY = deckMaxY;
      const railMaxY = Math.min(deckMaxY + railHeight, baseY + roomHeight - 0.1);

      const sides = [];
      if (direction === 'north' || direction === 'south') {
        const attachToEast = !attachToWest;
        if (!attachToWest) {
          sides.push([deckMinX, railMinY, deckMinZ, Math.min(deckMinX + railThickness, deckMaxX), railMaxY, deckMaxZ]);
        }
        if (!attachToEast) {
          sides.push([Math.max(deckMaxX - railThickness, deckMinX), railMinY, deckMinZ, deckMaxX, railMaxY, deckMaxZ]);
        }
        const wallAlignedZ = direction === 'south' ? deckMinZ : Math.max(deckMaxZ - railThickness, deckMinZ);
        sides.push([deckMinX, railMinY, wallAlignedZ, deckMaxX, railMaxY, Math.min(wallAlignedZ + railThickness, deckMaxZ)]);
      } else {
        const attachToSouth = attachToNorth === null ? false : !attachToNorth;
        if (!attachToNorth) {
          sides.push([deckMinX, railMinY, deckMinZ, deckMaxX, railMaxY, Math.min(deckMinZ + railThickness, deckMaxZ)]);
        }
        if (!attachToSouth) {
          sides.push([deckMinX, railMinY, Math.max(deckMaxZ - railThickness, deckMinZ), deckMaxX, railMaxY, deckMaxZ]);
        }
        const wallAlignedX = direction === 'east' ? deckMinX : Math.max(deckMaxX - railThickness, deckMinX);
        sides.push([wallAlignedX, railMinY, deckMinZ, Math.min(wallAlignedX + railThickness, deckMaxX), railMaxY, deckMaxZ]);
      }

      for (let i = 0; i < sides.length; i += 1) {
        const [sx0, sy0, sz0, sx1, sy1, sz1] = sides[i];
        if (sx1 - sx0 <= 1e-4 || sz1 - sz0 <= 1e-4) {
          continue;
        }
        addBox(vertices, sx0, sy0, sz0, sx1, sy1, sz1, railColor, bounds);
        addCollider(colliders, sx0, sy0, sz0, sx1, sy1, sz1);
      }
    }
  }

  function buildElevatorGates(vertices, colliders, bounds, elevatorCarBounds, profile, gateProgress) {
    if (!elevatorCarBounds || !profile) {
      return;
    }

    const progress = Math.min(Math.max(gateProgress ?? 0, 0), 1);
    const gateThickness = Math.min(Math.max(wallThickness * 0.35, 0.05), wallThickness);
    const gateDepth = Math.min(Math.max(wallThickness * 0.65, gateThickness), 0.16);
    const gateMinX = elevatorCarBounds.canopyMinX ?? elevatorCarBounds.minX;
    const gateMaxX = elevatorCarBounds.canopyMaxX ?? elevatorCarBounds.maxX;
    const floorY = elevatorCarBounds.floorY ?? 0;
    const openMinY = elevatorCarBounds.canopyMinY ?? floorY + roomHeight * 0.65;
    const dropDistance = Math.max(openMinY - floorY - 0.05, roomHeight * 0.25);
    const gateHeight = Math.min(Math.max(roomHeight * 0.45, dropDistance * 0.7), roomHeight * 0.9);
    const gateMinY = Math.max(floorY + 0.05, openMinY - dropDistance * progress);
    const gateMaxY = gateMinY + gateHeight;
    const gateColor = mixColors(profile.wallColor, profile.accentColor, 0.65);

    const northMinZ = elevatorCarBounds.minZ - gateDepth;
    const northMaxZ = elevatorCarBounds.minZ;
    const southMinZ = elevatorCarBounds.maxZ;
    const southMaxZ = elevatorCarBounds.maxZ + gateDepth;

    addBox(vertices, gateMinX, gateMinY, northMinZ, gateMaxX, gateMaxY, northMaxZ, gateColor, bounds);
    addCollider(colliders, gateMinX, gateMinY, northMinZ, gateMaxX, gateMaxY, northMaxZ);
    addBox(vertices, gateMinX, gateMinY, southMinZ, gateMaxX, gateMaxY, southMaxZ, gateColor, bounds);
    addCollider(colliders, gateMinX, gateMinY, southMinZ, gateMaxX, gateMaxY, southMaxZ);
  }

  function buildGeometryForCenter(cx, cz) {
    const vertices = [];
    decorativeLights.length = 0;
    resetBounds();
    colliders.length = 0;
    if (Array.isArray(doors)) {
      doors.length = 0;
    }
    if (typeof setElevatorPanel === 'function') {
      setElevatorPanel(null);
    }
    if (typeof setElevatorBounds === 'function') {
      setElevatorBounds(null);
    }

    const processedEdges = new Set();
    const { min: minActiveLayer, max: maxActiveLayer } = getActiveLayerRange();
    const elevatorOffset = typeof getElevatorOffset === 'function' ? getElevatorOffset() : 0;
    const elevatorGateProgress =
      typeof getElevatorGateProgress === 'function' ? getElevatorGateProgress() : 0;
    const elevatorLayerIndex =
      typeof getLayerIndexForHeight === 'function'
        ? getLayerIndexForHeight(elevatorOffset)
        : 0;
    const fullyEnclosedCache = new Map();
    const layerProfilesCache = new Map();
    const layerSeedCache = new Map();

    function getLayerProfilesCached(layerIndex) {
      if (!layerProfilesCache.has(layerIndex)) {
        layerProfilesCache.set(layerIndex, getLayerProfiles(layerIndex));
      }
      return layerProfilesCache.get(layerIndex);
    }

    function getLayerSeedCached(layerIndex) {
      if (!layerSeedCache.has(layerIndex)) {
        layerSeedCache.set(layerIndex, getLayerSeed(layerIndex));
      }
      return layerSeedCache.get(layerIndex);
    }

    function addDoorAnchor({
      edgeKey,
      layerIndex,
      orientation,
      wallPosition,
      spanMin,
      spanMax,
      openingMin,
      openingMax,
      baseY,
      doorHeight,
      doorWidth,
      isDoubleDoor,
      wallColor,
      accentColor,
      normalSign
    }) {
      if (!Array.isArray(doors) || typeof wallPosition !== 'number') {
        return;
      }

      const openingWidth = openingMax - openingMin;
      if (openingWidth <= 0) {
        return;
      }

      const height = Math.max(Math.min(doorHeight, roomHeight - 0.05), roomHeight * 0.25);
      const thickness = Math.min(Math.max(wallThickness * 0.6, 0.08), wallThickness);
      const centerX = orientation === 'x' ? wallPosition : (openingMin + openingMax) * 0.5;
      const centerZ = orientation === 'z' ? wallPosition : (openingMin + openingMax) * 0.5;
      const color = mixColors(wallColor, accentColor, 0.5);

      doors.push({
        id: `${edgeKey}@${layerIndex}`,
        layerIndex,
        orientation,
        wallPosition,
        openingMin,
        openingMax,
        spanMin,
        spanMax,
        width: openingWidth,
        height,
        thickness,
        baseY,
        color,
        isDoubleDoor: Boolean(isDoubleDoor),
        normalSign: Math.sign(normalSign || 1) || 1,
        center: [centerX, baseY + height * 0.5, centerZ],
        doorWidth
      });
    }

    function isCellFullyEnclosedAtLayer(x, z, layerIndex) {
      const cacheKey = `${layerIndex}:${x},${z}`;
      if (fullyEnclosedCache.has(cacheKey)) {
        return fullyEnclosedCache.get(cacheKey);
      }

      const profiles = getLayerProfilesCached(layerIndex);
      const seed = getLayerSeedCached(layerIndex);
      const neighborOffsets = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ];

      let enclosed = true;
      for (let i = 0; i < neighborOffsets.length; i += 1) {
        const [dx, dz] = neighborOffsets[i];
        const nx = x + dx;
        const nz = z + dz;
        const forcedState = getForcedOriginEdgeState(x, z, nx, nz);
        const edgeType = forcedState ?? determineEdgeType(x, z, nx, nz, profiles, seed);
        if (edgeType !== 'solid') {
          enclosed = false;
          break;
        }
      }

      fullyEnclosedCache.set(cacheKey, enclosed);
      return enclosed;
    }

    function shouldSkipSolidWallBetweenRooms(ax, az, bx, bz, layerIndex) {
      const edgesA = getCellEdgesForLayer(layerIndex, ax, az);
      const edgesB = getCellEdgesForLayer(layerIndex, bx, bz);
      const enclosedA = isCellFullyEnclosedAtLayer(ax, az, layerIndex);
      const enclosedB = isCellFullyEnclosedAtLayer(bx, bz, layerIndex);
      const balconyA = edgesA?.roomType === 'balcony';
      const balconyB = edgesB?.roomType === 'balcony';
      const bothEnclosed = enclosedA && enclosedB;
      const bothBalconies = balconyA && balconyB;
      const mixedBalconyAndEnclosed = (enclosedA && balconyB) || (balconyA && enclosedB);
      return bothEnclosed || bothBalconies || mixedBalconyAndEnclosed;
    }

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

          const forcedState = getForcedOriginEdgeState(gx, gz, nx, nz);
          if (forcedState) {
            for (let layerIndex = minActiveLayer; layerIndex <= maxActiveLayer; layerIndex += 1) {
              edgeTypes.set(layerIndex, forcedState);
            }
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
              const skipSolidWallBetweenEnclosedRooms =
                type === 'solid' &&
                shouldSkipSolidWallBetweenRooms(gx, gz, nx, nz, layerIndex);
              if (skipSolidWallBetweenEnclosedRooms) {
                continue;
              }
              const profile = profilePerLayer.get(layerIndex);
              const neighborProfile = neighborProfiles.get(layerIndex);
              const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
              const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);
              const isDoubleDoor =
                type === 'doorway'
                  ? isOriginHallwayDoorway(gx, gz, nx, nz) ||
                    randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(layerIndex)) < 0.5
                  : false;
              const localDoorWidth = isDoubleDoor ? doubleDoorWidth : singleDoorWidth;
              const localDoorHeight = clampedDoorHeight;
              const openingBias = isDoubleDoor
                ? 0
                : calculateSingleDoorwayBias(
                    edgeMaxZ - edgeMinZ,
                    localDoorWidth,
                    randomFloatForEdge(gx, gz, nx, nz, 43, getLayerSeed(layerIndex))
                  );
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
                const { openingMin, openingMax } = calculateDoorOpening(
                  edgeMinZ,
                  edgeMaxZ,
                  localDoorWidth,
                  openingBias
                );
                addDoorAnchor({
                  edgeKey,
                  layerIndex,
                  orientation: 'x',
                  wallPosition: wallX,
                  spanMin: edgeMinZ,
                  spanMax: edgeMaxZ,
                  openingMin,
                  openingMax,
                  baseY,
                  doorHeight: localDoorHeight,
                  doorWidth: localDoorWidth,
                  isDoubleDoor,
                  wallColor,
                  accentColor,
                  normalSign: Math.sign(nx - gx)
                });
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
                  baseY,
                  openingBias
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
              const skipSolidWallBetweenEnclosedRooms =
                type === 'solid' &&
                shouldSkipSolidWallBetweenRooms(gx, gz, nx, nz, layerIndex);
              if (skipSolidWallBetweenEnclosedRooms) {
                continue;
              }
              const profile = profilePerLayer.get(layerIndex);
              const neighborProfile = neighborProfiles.get(layerIndex);
              const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
              const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);
              const isDoubleDoor =
                type === 'doorway'
                  ? isOriginHallwayDoorway(gx, gz, nx, nz) ||
                    randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(layerIndex)) < 0.5
                  : false;
              const localDoorWidth = isDoubleDoor ? doubleDoorWidth : singleDoorWidth;
              const localDoorHeight = clampedDoorHeight;
              const openingBias = isDoubleDoor
                ? 0
                : calculateSingleDoorwayBias(
                    edgeMaxX - edgeMinX,
                    localDoorWidth,
                    randomFloatForEdge(gx, gz, nx, nz, 43, getLayerSeed(layerIndex))
                  );
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
                const { openingMin, openingMax } = calculateDoorOpening(
                  edgeMinX,
                  edgeMaxX,
                  localDoorWidth,
                  openingBias
                );
                addDoorAnchor({
                  edgeKey,
                  layerIndex,
                  orientation: 'z',
                  wallPosition: wallZ,
                  spanMin: edgeMinX,
                  spanMax: edgeMaxX,
                  openingMin,
                  openingMax,
                  baseY,
                  doorHeight: localDoorHeight,
                  doorWidth: localDoorWidth,
                  isDoubleDoor,
                  wallColor,
                  accentColor,
                  normalSign: Math.sign(nz - gz)
                });
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
                  baseY,
                  openingBias
                );
              }
            }
          }
        }

        const verticalOpeningStates = getExistingVerticalOpeningStates(key);

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
          let hasVerticalOpeningFromAbove = Boolean(openCeiling);
          const isTopLayer = layerIndex === maxActiveLayer;
          const profile = profilePerLayer.get(layerIndex);

          const edges = getCellEdgesForLayer(layerIndex, gx, gz);
          const isBalcony = edges?.roomType === 'balcony';
          const isFullyEnclosed =
            edges &&
            edges.north === 'solid' &&
            edges.south === 'solid' &&
            edges.east === 'solid' &&
            edges.west === 'solid';
          if (isFullyEnclosed) {
            hasVerticalOpeningFromAbove = true;
          }
          const hasVerticalOpeningOrBalconyFromAbove =
            hasVerticalOpeningFromAbove || isBalcony;
          let hallwayOrientation = null;
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
                roomSize,
                roomHeight,
                wallThickness,
                profile.wallColor,
                profile.accentColor,
                decorativeLights
              );
            }
          }

          const isOrigin = isOriginCell(gx, gz);
          const balconyDirection = edges?.balconyDirection ?? null;
          let balconyOpeningCenter = null;
          if (edges) {
            const seedForLayer = getLayerSeed(layerIndex);
            const hasOpenEdge =
              edges.north === 'open' ||
              edges.south === 'open' ||
              edges.east === 'open' ||
              edges.west === 'open';

            function hasDoubleDoor(direction) {
              if (edges[direction] !== 'doorway') {
                return false;
              }
              const offset = directionOffsets[direction];
              if (!offset) {
                return false;
              }
              const nx = gx + offset[0];
              const nz = gz + offset[1];
              if (isOriginHallwayDoorway(gx, gz, nx, nz)) {
                return true;
              }
              return randomFloatForEdge(gx, gz, nx, nz, 29, seedForLayer) < 0.5;
            }

            if (!hasOpenEdge && !isOrigin) {
              const doubleNorth = hasDoubleDoor('north');
              const doubleSouth = hasDoubleDoor('south');
              const doubleEast = hasDoubleDoor('east');
              const doubleWest = hasDoubleDoor('west');

              if (
                doubleNorth &&
                doubleSouth &&
                edges.east === 'solid' &&
                edges.west === 'solid'
              ) {
                hallwayOrientation = 'z';
              } else if (
                doubleEast &&
                doubleWest &&
                edges.north === 'solid' &&
                edges.south === 'solid'
              ) {
                hallwayOrientation = 'x';
              }
            }

            if (balconyDirection) {
              const offset = directionOffsets[balconyDirection];
              if (offset) {
                const neighborX = gx + offset[0];
                const neighborZ = gz + offset[1];
                const spanMin =
                  balconyDirection === 'north' || balconyDirection === 'south' ? minX : minZ;
                const spanMax =
                  balconyDirection === 'north' || balconyDirection === 'south' ? maxX : maxZ;
                const openingBias = calculateSingleDoorwayBias(
                  spanMax - spanMin,
                  singleDoorWidth,
                  randomFloatForEdge(gx, gz, neighborX, neighborZ, 43, seedForLayer)
                );
                const { openingMin, openingMax } = calculateDoorOpening(
                  spanMin,
                  spanMax,
                  singleDoorWidth,
                  openingBias
                );
                balconyOpeningCenter = (openingMin + openingMax) * 0.5;
              }
            }
          }

            if (isOrigin) {
              if (layerIndex === elevatorLayerIndex) {
                const elevatorBaseY = elevatorOffset;
                buildElevatorCar({
                  vertices,
                  colliders,
                  bounds,
                  minX,
                  maxX,
                  minZ,
                  maxZ,
                  baseY: elevatorBaseY,
                  roomHeight,
                  wallThickness,
                  profile,
                  onPanelBuilt: setElevatorPanel,
                  onBoundsBuilt: (carBounds) => {
                    if (typeof setElevatorBounds === 'function') {
                      setElevatorBounds(carBounds);
                    }
                    if (carBounds) {
                      buildElevatorGates(
                        vertices,
                        colliders,
                        bounds,
                        carBounds,
                        profile,
                        elevatorGateProgress
                      );
                    }
                  }
                });
              }
              edges.roomType = 'elevator';
            } else if (hallwayOrientation && !hasVerticalOpeningOrBalconyFromAbove) {
              addHallwayBridge(
                vertices,
                hallwayOrientation,
                minX,
                maxX,
                minZ,
                maxZ,
                baseY,
                roomHeight,
                doubleDoorWidth * 1.1,
                wallThickness,
                profile.floorColor,
                profile.wallColor,
                profile.accentColor
              );
              edges.roomType = 'hallwayBridge';
            } else if (!isOrigin && balconyDirection && !hasVerticalOpeningFromAbove) {
              addDoorwayBalcony(
                vertices,
                balconyDirection,
                minX,
                maxX,
                minZ,
                maxZ,
                baseY,
                roomHeight,
                wallThickness,
                colliders,
                edges,
                singleDoorWidth,
                balconyOpeningCenter,
                profile.floorColor,
                profile.wallColor,
                profile.accentColor,
                bounds
              );
              edges.roomType = 'balcony';
            } else if (
              edges.roomType === 'hallwayBridge' ||
              edges.roomType === 'elevator' ||
              edges.roomType === 'balcony'
            ) {
              edges.roomType = null;
            }

          if (!isFullyEnclosed && edges?.roomType !== 'balcony') {
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
          }

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

          if (isOrigin && layerIndex === 0) {
            const chestInsetFromWall = wallThickness * 0.75;
            const chestHalfWidth = 0.3;
            const chestHalfDepth = 0.25;
            const doorClearance = doubleDoorWidth * 0.8;
            const chestCenterX = Math.min(maxX - chestInsetFromWall - chestHalfWidth, centerX + doorClearance);
            const chestCenterZ = maxZ - chestInsetFromWall - chestHalfDepth;

            addStorageChest({
              vertices,
              colliders,
              bounds,
              storageChests,
              centerX: chestCenterX,
              centerZ: chestCenterZ,
              baseY,
              facing: 'north',
              wallColor: profile.wallColor,
              accentColor: profile.accentColor
            });
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
    updateVertexBuffer(vertexArray);
  }

  return { buildGeometryForCenter };
}
