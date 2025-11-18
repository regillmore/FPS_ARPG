import { mixColors } from '../color.js';
import { createEdgeKey, determineEdgeType } from '../profile.js';
import {
  addFloorSlab,
  addHorizontalSection,
  addSlabColliders,
  addBox,
  addCollider
} from '../geometry.js';
import { addCagedElectricWallLight } from '../decorations.js';
import { randomFloatForEdge } from '../random.js';
import { buildDoorwayAlongX, buildDoorwayAlongZ, buildSolidWallAlongX, buildSolidWallAlongZ } from '../walls.js';

function isOriginCell(x, z) {
  return x === 0 && z === 0;
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
  getCenterLayerIndex,
  getCellProfileForLayer,
  getLayerProfiles,
  getLayerSeed,
  getCellEdgesForLayer,
  getExistingVerticalOpeningStates,
  updateCellVerticalOpeningForLayer,
  evaluateCellForBarrel,
  evaluateCellForCamera,
  directionOffsets,
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
      evaluateCellForCamera(ax, az, layerIndex);
      evaluateCellForCamera(bx, bz, layerIndex);
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

  function addOriginElevator(
    vertices,
    minX,
    maxX,
    minZ,
    maxZ,
    baseY,
    roomHeight,
    wallThickness,
    profile
  ) {
    const width = maxX - minX;
    const depth = maxZ - minZ;
    if (!(width > 0) || !(depth > 0)) {
      return;
    }

    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const elevatorSize = Math.min(width, depth) * 0.62;
    const halfSize = elevatorSize * 0.5;
    const platformMinX = centerX - halfSize;
    const platformMaxX = centerX + halfSize;
    const platformMinZ = centerZ - halfSize;
    const platformMaxZ = centerZ + halfSize;
    const platformHeight = Math.min(Math.max(roomHeight * 0.05, 0.05), 0.10);
    const platformColor = mixColors(profile.floorColor, profile.accentColor, 0.45);
    const trimMargin = 0.05;
    addBox(
      vertices,
      platformMinX + trimMargin / 2,
      baseY,
      platformMinZ - trimMargin / 2,
      platformMaxX - trimMargin / 2,
      baseY + platformHeight + trimMargin,
      platformMaxZ + trimMargin / 2,
      platformColor,
      bounds
    );
    addCollider(colliders, platformMinX, baseY, platformMinZ, platformMaxX, baseY + platformHeight + trimMargin, platformMaxZ);

    const trimHeight = Math.min(platformHeight * 0.5, 0.07);
    if (trimHeight > 1e-3) {
      const trimColor = mixColors(profile.floorColor, profile.ceilingColor, 0.4);
      addBox(
        vertices,
        platformMinX - trimMargin,
        baseY + platformHeight - trimHeight,
        platformMinZ - trimMargin,
        platformMaxX + trimMargin,
        baseY + platformHeight,
        platformMaxZ + trimMargin,
        trimColor,
        bounds
      );
    }

    const railThickness = Math.min(Math.max(elevatorSize * 0.08, wallThickness * 0.5), wallThickness * 1.4);
    const railMinY = baseY + platformHeight;
    const railMaxY = Math.min(baseY + roomHeight - 0.25, railMinY + Math.max(roomHeight * 0.6, 1.2));
    const railColor = mixColors(profile.wallColor, profile.accentColor, 0.55);

    // East and west rails leave openings toward the doorways on the north/south axis.
    addBox(
      vertices,
      platformMaxX - railThickness,
      railMinY,
      platformMinZ,
      platformMaxX,
      railMaxY,
      platformMaxZ,
      railColor,
      bounds
    );
    addCollider(
      colliders,
      platformMaxX - railThickness,
      railMinY,
      platformMinZ,
      platformMaxX,
      railMaxY,
      platformMaxZ
    );
    addBox(
      vertices,
      platformMinX,
      railMinY,
      platformMinZ,
      platformMinX + railThickness,
      railMaxY,
      platformMaxZ,
      railColor,
      bounds
    );
    addCollider(
      colliders,
      platformMinX,
      railMinY,
      platformMinZ,
      platformMinX + railThickness,
      railMaxY,
      platformMaxZ
    );

    const postThickness = Math.min(Math.max(elevatorSize * 0.06, 0.08), railThickness);
    const postColor = mixColors(profile.wallColor, profile.ceilingColor, 0.55);
    const postMinY = railMinY;
    const postMaxY = Math.min(baseY + roomHeight - 0.15, railMaxY + Math.max(roomHeight * 0.2, 0.6));
    const postPositions = [
      [platformMinX, platformMinZ],
      [platformMinX, platformMaxZ - postThickness],
      [platformMaxX - postThickness, platformMinZ],
      [platformMaxX - postThickness, platformMaxZ - postThickness]
    ];
    for (const [px, pz] of postPositions) {
      addBox(vertices, px - trimMargin, postMinY, pz - trimMargin, px + postThickness + trimMargin, postMaxY, pz + postThickness + trimMargin, postColor, bounds);
      addCollider(colliders, px, postMinY, pz, px + postThickness, postMaxY, pz + postThickness);
    }

    const canopyMinY = Math.max(postMaxY + 0.05, baseY + roomHeight * 0.7);
    const canopyMaxY = Math.min(canopyMinY + Math.min(roomHeight * 0.08, 0.2), baseY + roomHeight - 0.05);
    const canopyInset = Math.min(elevatorSize * 0.08, wallThickness * 0.6);
    const canopyColor = mixColors(profile.ceilingColor, profile.accentColor, 0.55);
    addBox(
      vertices,
      platformMinX + canopyInset,
      canopyMinY,
      platformMinZ + canopyInset,
      platformMaxX - canopyInset,
      canopyMaxY,
      platformMaxZ - canopyInset,
      canopyColor,
      bounds
    );

    const indicatorWidth = Math.min(wallThickness * 1.1, elevatorSize * 0.18);
    const indicatorDepth = Math.min(railThickness * 0.85, 0.14);
    const indicatorHeight = Math.min(Math.max(roomHeight * 0.25, 0.6), roomHeight - 0.4);
    const indicatorMinY = baseY + roomHeight * 0.25;
    const indicatorMaxY = indicatorMinY + Math.min(indicatorHeight, roomHeight - 0.5);
    const indicatorMinX = platformMaxX - railThickness + indicatorDepth * 0.2 - trimMargin;
    const indicatorMaxX = indicatorMinX + indicatorDepth;
    const indicatorMinZ = centerZ - indicatorWidth * 0.5;
    const indicatorMaxZ = indicatorMinZ + indicatorWidth;
    const indicatorColor = mixColors(profile.accentColor, profile.ceilingColor, 0.5);
    addBox(
      vertices,
      indicatorMinX,
      indicatorMinY,
      indicatorMinZ,
      indicatorMaxX,
      indicatorMaxY,
      indicatorMaxZ,
      indicatorColor,
      bounds
    );
  }

  function buildGeometryForCenter(cx, cz) {
    const vertices = [];
    decorativeLights.length = 0;
    resetBounds();
    colliders.length = 0;

    const processedEdges = new Set();
    const { min: minActiveLayer, max: maxActiveLayer } = getActiveLayerRange();

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
                  ? isOriginHallwayDoorway(gx, gz, nx, nz) ||
                    randomFloatForEdge(gx, gz, nx, nz, 29, getLayerSeed(layerIndex)) < 0.5
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
          const hasVerticalOpeningFromAbove = Boolean(openCeiling);
          const isTopLayer = layerIndex === maxActiveLayer;
          const profile = profilePerLayer.get(layerIndex);

          const edges = getCellEdgesForLayer(layerIndex, gx, gz);
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
          }

          if (isOrigin) {
            addOriginElevator(
              vertices,
              minX,
              maxX,
              minZ,
              maxZ,
              baseY,
              roomHeight,
              wallThickness,
              profile
            );
            edges.roomType = 'elevator';
          } else if (hallwayOrientation && !hasVerticalOpeningFromAbove) {
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
          } else if (edges.roomType === 'hallwayBridge' || edges.roomType === 'elevator') {
            edges.roomType = null;
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
    updateVertexBuffer(vertexArray);
  }

  return { buildGeometryForCenter };
}
