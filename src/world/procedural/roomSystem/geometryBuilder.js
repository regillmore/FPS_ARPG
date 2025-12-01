import { mixColors } from '../color.js';
import { createEdgeKey, determineEdgeType } from '../profile.js';
import { addFloorSlab } from '../geometry.js';
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
  getCellProfileForLayer,
  getLayerProfiles,
  getLayerSeed,
  getCellEdgesForLayer,
  evaluateCellForFighter,
  updateVertexBuffer
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
      effectiveLayerTypes.set(0, layerTypes);
    }
    const dx = bx - ax;
    const dz = bz - az;
    let baseType = effectiveLayerTypes.get(0);
    if (baseType === undefined) {
      const first = effectiveLayerTypes.values().next();
      baseType = first.done ? 'solid' : first.value;
    }

    const type = effectiveLayerTypes.get(0) ?? baseType;
    const edgesA = getCellEdgesForLayer(0, ax, az);
    const edgesB = getCellEdgesForLayer(0, bx, bz);

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

    evaluateCellForFighter(ax, az, 0);
    evaluateCellForFighter(bx, bz, 0);
  }

  function buildGeometryForCenter(cx, cz) {
    const vertices = [];
    decorativeLights.length = 0;
    resetBounds();
    colliders.length = 0;
    if (Array.isArray(doors)) {
      doors.length = 0;
    }

    const processedEdges = new Set();

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

    for (let gx = cx - generationRadius; gx <= cx + generationRadius; gx += 1) {
      for (let gz = cz - generationRadius; gz <= cz + generationRadius; gz += 1) {
        const key = `${gx},${gz}`;
        const profilePerLayer = new Map();
        profilePerLayer.set(0, getCellProfileForLayer(0, gx, gz));

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
          const profiles = getLayerProfiles(0);
          const seed = getLayerSeed(0);
          edgeTypes.set(0, determineEdgeType(gx, gz, nx, nz, profiles, seed));
          neighborProfiles.set(0, getCellProfileForLayer(0, nx, nz));

          const forcedState = getForcedOriginEdgeState(gx, gz, nx, nz);
          if (forcedState) {
            edgeTypes.set(0, forcedState);
          }

          recordEdge(gx, gz, nx, nz, edgeTypes);

          if (nx !== gx) {
            const wallX = (gx + nx) * 0.5 * roomSize;
            const edgeMinZ = Math.min(gz, nz) * roomSize - halfRoom;
            const edgeMaxZ = Math.max(gz, nz) * roomSize + halfRoom;
            const type = edgeTypes.get(0);
            if (type === 'open') {
              continue;
            }
            const profile = profilePerLayer.get(0);
            const neighborProfile = neighborProfiles.get(0);
            const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
            const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);
            const isDoubleDoor =
              type === 'doorway'
                ? isOriginHallwayDoorway(gx, gz, nx, nz) ||
                  randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(0)) < 0.5
                : false;
            const localDoorWidth = isDoubleDoor ? doubleDoorWidth : singleDoorWidth;
            const localDoorHeight = clampedDoorHeight;
            const openingBias = isDoubleDoor
              ? 0
              : calculateSingleDoorwayBias(
                  edgeMaxZ - edgeMinZ,
                  localDoorWidth,
                  randomFloatForEdge(gx, gz, nx, nz, 43, getLayerSeed(0))
                );
            const baseY = 0;
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
                layerIndex: 0,
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
          } else if (nz !== gz) {
            const wallZ = (gz + nz) * 0.5 * roomSize;
            const edgeMinX = Math.min(gx, nx) * roomSize - halfRoom;
            const edgeMaxX = Math.max(gx, nx) * roomSize + halfRoom;
            let layerIndex = 0;
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

        const baseY = 0;
        const openFloor = false;
        const profile = profilePerLayer.get(0);

        const edges = getCellEdgesForLayer(0, gx, gz);
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
          colliders
        );

        if (isOrigin) {
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

    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = cx * roomSize - halfRoom;
      bounds.maxX = cx * roomSize + halfRoom;
      bounds.minY = -floorThickness;
      bounds.maxY = roomHeight;
      bounds.minZ = cz * roomSize - halfRoom;
      bounds.maxZ = cz * roomSize + halfRoom;
    } else {
      bounds.minY = Math.min(bounds.minY, -floorThickness);
      bounds.maxY = Math.max(bounds.maxY, roomHeight);
    }

    const vertexArray = new Float32Array(vertices);
    updateVertexBuffer(vertexArray);
  }

  return { buildGeometryForCenter };
}
