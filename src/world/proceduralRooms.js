const DEFAULT_ROOM_SIZE = 10;
const DEFAULT_ROOM_HEIGHT = 4;
const DEFAULT_DOOR_HEIGHT = 2.6;
const DEFAULT_DOOR_WIDTH = 1.8;
const DEFAULT_GENERATION_RADIUS = 4;
const VERTEX_STRIDE = 9;

const BASE_FLOOR_COLOR = [0.36, 0.36, 0.42];
const BASE_CEILING_COLOR = [0.3, 0.3, 0.34];
const BASE_WALL_COLOR = [0.42, 0.44, 0.52];
const BASE_ACCENT_COLOR = [0.62, 0.48, 0.38];

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function mixColors(a, b, factor = 0.5) {
  const t = clamp01(factor);
  return [
    clamp01(a[0] * (1 - t) + b[0] * t),
    clamp01(a[1] * (1 - t) + b[1] * t),
    clamp01(a[2] * (1 - t) + b[2] * t)
  ];
}

function shiftColor(color, amount) {
  return [
    clamp01(color[0] + amount),
    clamp01(color[1] + amount),
    clamp01(color[2] + amount)
  ];
}

function hashValue(value, salt) {
  let hash = Math.imul(value ^ (salt * 0x9e3779b9), 0x85ebca6b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function hashCoords(x, z, salt = 0) {
  let hash = 0x811c9dc5;
  hash = Math.imul(hash ^ hashValue(x, salt + 1), 0x01000193);
  hash = Math.imul(hash ^ hashValue(z, salt + 2), 0x01000193);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function randomFloatFromHash(hash) {
  return (hash & 0x00ffffff) / 0x01000000;
}

function randomFloatForCell(x, z, salt = 0) {
  return randomFloatFromHash(hashCoords(x, z, salt));
}

function randomFloatForEdge(ax, az, bx, bz, salt = 0) {
  const fromX = Math.min(ax, bx);
  const toX = Math.max(ax, bx);
  const fromZ = Math.min(az, bz);
  const toZ = Math.max(az, bz);
  return randomFloatFromHash(hashCoords(fromX * 131 + toX * 137, fromZ * 149 + toZ * 163, salt));
}

function createCellProfile(x, z) {
  const openness = randomFloatForCell(x, z, 11);
  const toneOffset = (randomFloatForCell(x, z, 23) - 0.5) * 0.18;
  const wallShift = (randomFloatForCell(x, z, 31) - 0.5) * 0.14;
  const accentShift = (randomFloatForCell(x, z, 47) - 0.5) * 0.2;

  return {
    openness,
    floorColor: shiftColor(BASE_FLOOR_COLOR, toneOffset),
    ceilingColor: shiftColor(BASE_CEILING_COLOR, toneOffset * 0.6),
    wallColor: shiftColor(BASE_WALL_COLOR, wallShift),
    accentColor: shiftColor(BASE_ACCENT_COLOR, accentShift * 0.5)
  };
}

function createEdgeKey(ax, az, bx, bz) {
  if (ax < bx || (ax === bx && az <= bz)) {
    return `${ax},${az}:${bx},${bz}`;
  }
  return `${bx},${bz}:${ax},${az}`;
}

function determineEdgeType(ax, az, bx, bz, profiles) {
  const keyA = `${ax},${az}`;
  const keyB = `${bx},${bz}`;
  const profileA = profiles.get(keyA) ?? createCellProfile(ax, az);
  const profileB = profiles.get(keyB) ?? createCellProfile(bx, bz);
  profiles.set(keyA, profileA);
  profiles.set(keyB, profileB);

  const baseRandom = randomFloatForEdge(ax, az, bx, bz, 3);
  const openness = (profileA.openness + profileB.openness) * 0.5;
  const variance = Math.abs(profileA.openness - profileB.openness);
  const openThreshold = clamp01(0.12 + openness * 0.5);
  const doorwayThreshold = clamp01(openThreshold + 0.18 + (1 - variance) * 0.12);

  if (baseRandom < openThreshold) {
    return 'open';
  }
  if (baseRandom < doorwayThreshold) {
    return 'doorway';
  }
  return 'solid';
}

function extendBounds(bounds, point) {
  const [x, y, z] = point;
  if (x < bounds.minX) bounds.minX = x;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (y > bounds.maxY) bounds.maxY = y;
  if (z < bounds.minZ) bounds.minZ = z;
  if (z > bounds.maxZ) bounds.maxZ = z;
}

function pushVertex(vertices, point, normal, color, bounds) {
  extendBounds(bounds, point);
  vertices.push(
    point[0],
    point[1],
    point[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2]
  );
}

function addQuad(vertices, corners, normal, color, bounds) {
  const [a, b, c, d] = corners;
  pushVertex(vertices, a, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
  pushVertex(vertices, b, normal, color, bounds);
  pushVertex(vertices, a, normal, color, bounds);
  pushVertex(vertices, d, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
}

function addDoubleSidedQuad(vertices, corners, normal, color, bounds) {
  addQuad(vertices, corners, normal, color, bounds);
  const oppositeCorners = [corners[0], corners[3], corners[2], corners[1]];
  addQuad(vertices, oppositeCorners, [-normal[0], -normal[1], -normal[2]], color, bounds);
}

function buildSolidWallAlongX(vertices, wallX, minZ, maxZ, height, color, bounds) {
  const corners = [
    [wallX, 0, minZ],
    [wallX, 0, maxZ],
    [wallX, height, maxZ],
    [wallX, height, minZ]
  ];
  addDoubleSidedQuad(vertices, corners, [1, 0, 0], color, bounds);
}

function buildSolidWallAlongZ(vertices, wallZ, minX, maxX, height, color, bounds) {
  const corners = [
    [minX, 0, wallZ],
    [maxX, 0, wallZ],
    [maxX, height, wallZ],
    [minX, height, wallZ]
  ];
  addDoubleSidedQuad(vertices, corners, [0, 0, 1], color, bounds);
}

function buildDoorwayAlongX(
  vertices,
  wallX,
  minZ,
  maxZ,
  height,
  doorHeight,
  doorWidth,
  wallColor,
  accentColor,
  bounds
) {
  const openingCenter = (minZ + maxZ) * 0.5;
  const halfOpening = Math.min(Math.max(doorWidth * 0.5, 0.5), (maxZ - minZ) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;

  if (openingMin > minZ) {
    const corners = [
      [wallX, 0, minZ],
      [wallX, 0, openingMin],
      [wallX, height, openingMin],
      [wallX, height, minZ]
    ];
    addDoubleSidedQuad(vertices, corners, [1, 0, 0], wallColor, bounds);
  }

  if (openingMax < maxZ) {
    const corners = [
      [wallX, 0, openingMax],
      [wallX, 0, maxZ],
      [wallX, height, maxZ],
      [wallX, height, openingMax]
    ];
    addDoubleSidedQuad(vertices, corners, [1, 0, 0], wallColor, bounds);
  }

  const lintelCorners = [
    [wallX, doorHeight, openingMin],
    [wallX, doorHeight, openingMax],
    [wallX, height, openingMax],
    [wallX, height, openingMin]
  ];
  addDoubleSidedQuad(vertices, lintelCorners, [1, 0, 0], accentColor, bounds);
}

function buildDoorwayAlongZ(
  vertices,
  wallZ,
  minX,
  maxX,
  height,
  doorHeight,
  doorWidth,
  wallColor,
  accentColor,
  bounds
) {
  const openingCenter = (minX + maxX) * 0.5;
  const halfOpening = Math.min(Math.max(doorWidth * 0.5, 0.5), (maxX - minX) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;

  if (openingMin > minX) {
    const corners = [
      [minX, 0, wallZ],
      [openingMin, 0, wallZ],
      [openingMin, height, wallZ],
      [minX, height, wallZ]
    ];
    addDoubleSidedQuad(vertices, corners, [0, 0, 1], wallColor, bounds);
  }

  if (openingMax < maxX) {
    const corners = [
      [openingMax, 0, wallZ],
      [maxX, 0, wallZ],
      [maxX, height, wallZ],
      [openingMax, height, wallZ]
    ];
    addDoubleSidedQuad(vertices, corners, [0, 0, 1], wallColor, bounds);
  }

  const lintelCorners = [
    [openingMin, doorHeight, wallZ],
    [openingMax, doorHeight, wallZ],
    [openingMax, height, wallZ],
    [openingMin, height, wallZ]
  ];
  addDoubleSidedQuad(vertices, lintelCorners, [0, 0, 1], accentColor, bounds);
}

function positionToCell(value, roomSize, halfRoom) {
  return Math.floor((value + halfRoom) / roomSize);
}

export function createProceduralRoomSystem(device, options = {}) {
  const roomSize = options.roomSize ?? DEFAULT_ROOM_SIZE;
  const roomHeight = options.roomHeight ?? DEFAULT_ROOM_HEIGHT;
  const doorHeight = options.doorHeight ?? DEFAULT_DOOR_HEIGHT;
  const doorWidth = options.doorWidth ?? DEFAULT_DOOR_WIDTH;
  const generationRadius = Math.max(1, Math.floor(options.generationRadius ?? DEFAULT_GENERATION_RADIUS));
  const halfRoom = roomSize * 0.5;

  const clampedDoorHeight =
    clamp01(Math.min(Math.max(doorHeight, roomHeight * 0.3), roomHeight - 0.2) / roomHeight) * roomHeight;
  const clampedDoorWidth = Math.max(roomSize * 0.2, Math.min(roomSize * 0.95, doorWidth));

  const bounds = {
    minX: -halfRoom,
    maxX: halfRoom,
    minY: 0,
    maxY: roomHeight,
    minZ: -halfRoom,
    maxZ: halfRoom
  };

  let vertexBuffer = null;
  let vertexCount = 0;
  let centerCellX = 0;
  let centerCellZ = 0;

  const cellProfiles = new Map();

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
    resetBounds();

    const processedEdges = new Set();

    for (let gx = cx - generationRadius; gx <= cx + generationRadius; gx += 1) {
      for (let gz = cz - generationRadius; gz <= cz + generationRadius; gz += 1) {
        const key = `${gx},${gz}`;
        let profile = cellProfiles.get(key);
        if (!profile) {
          profile = createCellProfile(gx, gz);
          cellProfiles.set(key, profile);
        }

        const centerX = gx * roomSize;
        const centerZ = gz * roomSize;
        const minX = centerX - halfRoom;
        const maxX = centerX + halfRoom;
        const minZ = centerZ - halfRoom;
        const maxZ = centerZ + halfRoom;

        const floorCorners = [
          [minX, 0, minZ],
          [maxX, 0, minZ],
          [maxX, 0, maxZ],
          [minX, 0, maxZ]
        ];
        addQuad(vertices, floorCorners, [0, 1, 0], profile.floorColor, bounds);
        const floorUnderCorners = [
          floorCorners[0],
          floorCorners[3],
          floorCorners[2],
          floorCorners[1]
        ];
        addQuad(vertices, floorUnderCorners, [0, -1, 0], profile.floorColor, bounds);

        const ceilingCorners = [
          [minX, roomHeight, maxZ],
          [maxX, roomHeight, maxZ],
          [maxX, roomHeight, minZ],
          [minX, roomHeight, minZ]
        ];
        addQuad(vertices, ceilingCorners, [0, -1, 0], profile.ceilingColor, bounds);
        const ceilingTopCorners = [
          ceilingCorners[0],
          ceilingCorners[3],
          ceilingCorners[2],
          ceilingCorners[1]
        ];
        addQuad(vertices, ceilingTopCorners, [0, 1, 0], profile.ceilingColor, bounds);

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

          const type = determineEdgeType(gx, gz, nx, nz, cellProfiles);
          const neighborProfileKey = `${nx},${nz}`;
          let neighborProfile = cellProfiles.get(neighborProfileKey);
          if (!neighborProfile) {
            neighborProfile = createCellProfile(nx, nz);
            cellProfiles.set(neighborProfileKey, neighborProfile);
          }

          const wallColor = mixColors(profile.wallColor, neighborProfile.wallColor, 0.5);
          const accentColor = mixColors(profile.accentColor, neighborProfile.accentColor, 0.5);

          if (nx !== gx) {
            const wallX = (gx + nx) * 0.5 * roomSize;
            const edgeMinZ = Math.min(gz, nz) * roomSize - halfRoom;
            const edgeMaxZ = Math.max(gz, nz) * roomSize + halfRoom;
            if (type === 'solid') {
              buildSolidWallAlongX(vertices, wallX, edgeMinZ, edgeMaxZ, roomHeight, wallColor, bounds);
            } else if (type === 'doorway') {
              const widthFactor = 0.55 + randomFloatForEdge(gx, gz, nx, nz, 19) * 0.45;
              const heightFactor = 0.7 + randomFloatForEdge(gx, gz, nx, nz, 23) * 0.3;
              const localDoorWidth = Math.min(clampedDoorWidth * widthFactor, roomSize * 0.95);
              const localDoorHeight = Math.min(
                Math.max(clampedDoorHeight * heightFactor, roomHeight * 0.35),
                roomHeight - 0.2
              );
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
                bounds
              );
            }
          } else if (nz !== gz) {
            const wallZ = (gz + nz) * 0.5 * roomSize;
            const edgeMinX = Math.min(gx, nx) * roomSize - halfRoom;
            const edgeMaxX = Math.max(gx, nx) * roomSize + halfRoom;
            if (type === 'solid') {
              buildSolidWallAlongZ(vertices, wallZ, edgeMinX, edgeMaxX, roomHeight, wallColor, bounds);
            } else if (type === 'doorway') {
              const widthFactor = 0.55 + randomFloatForEdge(gx, gz, nx, nz, 19) * 0.45;
              const heightFactor = 0.7 + randomFloatForEdge(gx, gz, nx, nz, 23) * 0.3;
              const localDoorWidth = Math.min(clampedDoorWidth * widthFactor, roomSize * 0.95);
              const localDoorHeight = Math.min(
                Math.max(clampedDoorHeight * heightFactor, roomHeight * 0.35),
                roomHeight - 0.2
              );
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
                bounds
              );
            }
          }
        }
      }
    }

    if (!Number.isFinite(bounds.minX)) {
      bounds.minX = cx * roomSize - halfRoom;
      bounds.maxX = cx * roomSize + halfRoom;
      bounds.minY = 0;
      bounds.maxY = roomHeight;
      bounds.minZ = cz * roomSize - halfRoom;
      bounds.maxZ = cz * roomSize + halfRoom;
    }

    bounds.minY = Math.min(bounds.minY, 0);
    bounds.maxY = Math.max(bounds.maxY, roomHeight);

    const vertexArray = new Float32Array(vertices);
    ensureBufferCapacity(vertexArray);
  }

  function update(playerPosition) {
    const px = playerPosition?.[0] ?? 0;
    const pz = playerPosition?.[2] ?? 0;
    const cellX = positionToCell(px, roomSize, halfRoom);
    const cellZ = positionToCell(pz, roomSize, halfRoom);

    if (vertexBuffer === null) {
      centerCellX = cellX;
      centerCellZ = cellZ;
      buildGeometryForCenter(cellX, cellZ);
      return true;
    }

    if (cellX === centerCellX && cellZ === centerCellZ) {
      return false;
    }

    centerCellX = cellX;
    centerCellZ = cellZ;
    buildGeometryForCenter(cellX, cellZ);
    return true;
  }

  buildGeometryForCenter(centerCellX, centerCellZ);

  return {
    update,
    getVertexBuffer: () => vertexBuffer,
    getVertexCount: () => vertexCount,
    getBounds: () => bounds,
    getGeometry: () => ({ vertexBuffer, vertexCount, bounds }),
    dispose: () => {
      if (vertexBuffer) {
        vertexBuffer.destroy();
        vertexBuffer = null;
      }
    }
  };
}
