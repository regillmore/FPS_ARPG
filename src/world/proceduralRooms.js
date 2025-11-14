const DEFAULT_ROOM_SIZE = 10;
const DEFAULT_ROOM_HEIGHT = 4;
const DEFAULT_DOOR_HEIGHT = 2.5;
const DEFAULT_DOOR_WIDTH = 1.0;
const DEFAULT_DOUBLE_DOOR_WIDTH = DEFAULT_DOOR_WIDTH * 2;
const DEFAULT_WALL_THICKNESS = 0.35;
const DEFAULT_GENERATION_RADIUS = 4;
const DEFAULT_VERTICAL_LAYER_PADDING = 2;
const DEFAULT_FLOOR_THICKNESS = 0.4;
const DEFAULT_FLOOR_OPENING_MARGIN_RATIO = 0.22;
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

function hashCoords(x, z, salt = 0, seed = 0) {
  const seedValue = seed >>> 0;
  let hash = 0x811c9dc5 ^ seedValue;
  hash = Math.imul(hash ^ hashValue(x, salt + 1), 0x01000193);
  hash = Math.imul(hash ^ hashValue(z, salt + 2), 0x01000193);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  hash ^= seedValue;
  hash = Math.imul(hash ^ 0x27d4eb2d, 0x165667b1);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

function randomFloatFromHash(hash) {
  return (hash & 0x00ffffff) / 0x01000000;
}

function randomFloatForCell(x, z, salt = 0, seed = 0) {
  return randomFloatFromHash(hashCoords(x, z, salt, seed));
}

function randomFloatForEdge(ax, az, bx, bz, salt = 0, seed = 0) {
  const fromX = Math.min(ax, bx);
  const toX = Math.max(ax, bx);
  const fromZ = Math.min(az, bz);
  const toZ = Math.max(az, bz);
  return randomFloatFromHash(
    hashCoords(fromX * 131 + toX * 137, fromZ * 149 + toZ * 163, salt, seed)
  );
}

function createCellProfile(x, z, seed = 0) {
  const openness = randomFloatForCell(x, z, 11, seed);
  const toneOffset = (randomFloatForCell(x, z, 23, seed) - 0.5) * 0.18;
  const wallShift = (randomFloatForCell(x, z, 31, seed) - 0.5) * 0.14;
  const accentShift = (randomFloatForCell(x, z, 47, seed) - 0.5) * 0.2;

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

function determineEdgeType(ax, az, bx, bz, profiles, seed = 0) {
  const keyA = `${ax},${az}`;
  const keyB = `${bx},${bz}`;
  const profileA = profiles.get(keyA) ?? createCellProfile(ax, az, seed);
  const profileB = profiles.get(keyB) ?? createCellProfile(bx, bz, seed);
  profiles.set(keyA, profileA);
  profiles.set(keyB, profileB);

  const baseRandom = randomFloatForEdge(ax, az, bx, bz, 3, seed);
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
  pushVertex(vertices, b, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
  pushVertex(vertices, a, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
  pushVertex(vertices, d, normal, color, bounds);
}

function addHorizontalSection(
  vertices,
  y,
  minX,
  maxX,
  minZ,
  maxZ,
  normal,
  color,
  bounds,
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ
) {
  const isUpward = normal[1] >= 0;

  function createCorners(x0, x1, z0, z1) {
    if (isUpward) {
      return [
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
        [x0, y, z0]
      ];
    }
    return [
        [x0, y, z0],
        [x1, y, z0],
        [x1, y, z1],
        [x0, y, z1]
    ];
  }

  if (!hasHole || holeMinX >= holeMaxX || holeMinZ >= holeMaxZ) {
    addQuad(vertices, createCorners(minX, maxX, minZ, maxZ), normal, color, bounds);
    return;
  }

  if (holeMinX > minX) {
    addQuad(vertices, createCorners(minX, holeMinX, minZ, maxZ), normal, color, bounds);
  }

  if (holeMaxX < maxX) {
    addQuad(vertices, createCorners(holeMaxX, maxX, minZ, maxZ), normal, color, bounds);
  }

  if (holeMinZ > minZ) {
    addQuad(vertices, createCorners(holeMinX, holeMaxX, minZ, holeMinZ), normal, color, bounds);
  }

  if (holeMaxZ < maxZ) {
    addQuad(vertices, createCorners(holeMinX, holeMaxX, holeMaxZ, maxZ), normal, color, bounds);
  }
}

function addSlabColliders(
  colliders,
  minX,
  maxX,
  minZ,
  maxZ,
  minY,
  maxY,
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ
) {
  if (!colliders) {
    return;
  }

  if (maxX <= minX || maxZ <= minZ || maxY <= minY) {
    return;
  }

  const holeValid = hasHole && holeMinX < holeMaxX && holeMinZ < holeMaxZ;
  if (!holeValid) {
    addCollider(colliders, minX, minY, minZ, maxX, maxY, maxZ);
    return;
  }

  if (holeMinX > minX) {
    addCollider(colliders, minX, minY, minZ, holeMinX, maxY, maxZ);
  }

  if (holeMaxX < maxX) {
    addCollider(colliders, holeMaxX, minY, minZ, maxX, maxY, maxZ);
  }

  if (holeMinZ > minZ) {
    addCollider(colliders, holeMinX, minY, minZ, holeMaxX, maxY, holeMinZ);
  }

  if (holeMaxZ < maxZ) {
    addCollider(colliders, holeMinX, minY, holeMaxZ, holeMaxX, maxY, maxZ);
  }
}

function addFloorSlab(
  vertices,
  topY,
  thickness,
  minX,
  maxX,
  minZ,
  maxZ,
  topColor,
  bottomColor,
  bounds,
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ,
  colliders
) {
  const effectiveThickness = Math.max(thickness, 0);
  const holeValid =
    hasHole && holeMinX < holeMaxX && holeMinZ < holeMaxZ;

  if (effectiveThickness <= 1e-4) {
    const colliderMinY = topY - Math.max(0.05, effectiveThickness);
    addSlabColliders(
      colliders,
      minX,
      maxX,
      minZ,
      maxZ,
      colliderMinY,
      topY,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
    );

    addHorizontalSection(
      vertices,
      topY,
      minX,
      maxX,
      minZ,
      maxZ,
      [0, 1, 0],
      topColor,
      bounds,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
    );
    addHorizontalSection(
      vertices,
      topY,
      minX,
      maxX,
      minZ,
      maxZ,
      [0, -1, 0],
      bottomColor,
      bounds,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
    );
    return;
  }

  const bottomY = topY - effectiveThickness;
  const sideColor = mixColors(topColor, bottomColor, 0.5);

  addHorizontalSection(
    vertices,
    topY,
    minX,
    maxX,
    minZ,
    maxZ,
    [0, 1, 0],
    topColor,
    bounds,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
  );

  addHorizontalSection(
    vertices,
    bottomY,
    minX,
    maxX,
    minZ,
    maxZ,
    [0, -1, 0],
    bottomColor,
    bounds,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
  );

  const outer = {
    nbl: [minX, bottomY, minZ],
    nbr: [maxX, bottomY, minZ],
    ntl: [minX, topY, minZ],
    ntr: [maxX, topY, minZ],
    fbl: [minX, bottomY, maxZ],
    fbr: [maxX, bottomY, maxZ],
    ftl: [minX, topY, maxZ],
    ftr: [maxX, topY, maxZ]
  };

  addQuad(vertices, [outer.fbl, outer.fbr, outer.ftr, outer.ftl], [0, 0, 1], sideColor, bounds);
  addQuad(vertices, [outer.nbr, outer.nbl, outer.ntl, outer.ntr], [0, 0, -1], sideColor, bounds);
  addQuad(vertices, [outer.nbl, outer.fbl, outer.ftl, outer.ntl], [-1, 0, 0], sideColor, bounds);
  addQuad(vertices, [outer.fbr, outer.nbr, outer.ntr, outer.ftr], [1, 0, 0], sideColor, bounds);

  addSlabColliders(
    colliders,
    minX,
    maxX,
    minZ,
    maxZ,
    bottomY,
    topY,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
  );

  if (!holeValid) {
    return;
  }

  const inner = {
    nbl: [holeMinX, bottomY, holeMinZ],
    nbr: [holeMaxX, bottomY, holeMinZ],
    ntl: [holeMinX, topY, holeMinZ],
    ntr: [holeMaxX, topY, holeMinZ],
    fbl: [holeMinX, bottomY, holeMaxZ],
    fbr: [holeMaxX, bottomY, holeMaxZ],
    ftl: [holeMinX, topY, holeMaxZ],
    ftr: [holeMaxX, topY, holeMaxZ]
  };

  addQuad(vertices, [inner.fbl, inner.nbl, inner.ntl, inner.ftl], [1, 0, 0], sideColor, bounds);
  addQuad(vertices, [inner.nbr, inner.fbr, inner.ftr, inner.ntr], [-1, 0, 0], sideColor, bounds);
  addQuad(vertices, [inner.nbl, inner.nbr, inner.ntr, inner.ntl], [0, 0, 1], sideColor, bounds);
  addQuad(vertices, [inner.fbr, inner.fbl, inner.ftl, inner.ftr], [0, 0, -1], sideColor, bounds);
}

function addBox(vertices, minX, minY, minZ, maxX, maxY, maxZ, color, bounds) {
  const corners = {
    nbl: [minX, minY, minZ],
    nbr: [maxX, minY, minZ],
    ntl: [minX, maxY, minZ],
    ntr: [maxX, maxY, minZ],
    fbl: [minX, minY, maxZ],
    fbr: [maxX, minY, maxZ],
    ftl: [minX, maxY, maxZ],
    ftr: [maxX, maxY, maxZ]
  };

  addQuad(vertices, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], [0, 0, 1], color, bounds);
  addQuad(vertices, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], [0, 0, -1], color, bounds);
  addQuad(vertices, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], [-1, 0, 0], color, bounds);
  addQuad(vertices, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], [1, 0, 0], color, bounds);
  addQuad(vertices, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], [0, 1, 0], color, bounds);
  addQuad(vertices, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], [0, -1, 0], color, bounds);
}

function addCollider(colliders, minX, minY, minZ, maxX, maxY, maxZ) {
  if (!colliders) {
    return;
  }
  colliders.push({ minX, minY, minZ, maxX, maxY, maxZ });
}

function buildSolidWallAlongX(
  vertices,
  wallX,
  minZ,
  maxZ,
  height,
  color,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const halfThickness = thickness * 0.5;
  const minX = wallX - halfThickness;
  const maxX = wallX + halfThickness;
  addBox(vertices, minX, baseY, minZ, maxX, baseY + height, maxZ, color, bounds);
  addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, maxZ);
}

function buildSolidWallAlongZ(
  vertices,
  wallZ,
  minX,
  maxX,
  height,
  color,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const halfThickness = thickness * 0.5;
  const minZ = wallZ - halfThickness;
  const maxZ = wallZ + halfThickness;
  addBox(vertices, minX, baseY, minZ, maxX, baseY + height, maxZ, color, bounds);
  addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, maxZ);
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
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const openingCenter = (minZ + maxZ) * 0.5;
  const halfOpening = Math.min(doorWidth * 0.5, (maxZ - minZ) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;
  const halfThickness = thickness * 0.5;
  const minX = wallX - halfThickness;
  const maxX = wallX + halfThickness;

  if (openingMin > minZ) {
    addBox(vertices, minX, baseY, minZ, maxX, baseY + height, openingMin, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, openingMin);
  }

  if (openingMax < maxZ) {
    addBox(vertices, minX, baseY, openingMax, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, openingMax, maxX, baseY + height, maxZ);
  }

  if (doorHeight < height - 1e-5) {
    const doorwayMinY = baseY + doorHeight;
    addBox(
      vertices,
      minX,
      doorwayMinY,
      openingMin,
      maxX,
      baseY + height,
      openingMax,
      accentColor,
      bounds
    );
    addCollider(colliders, minX, doorwayMinY, openingMin, maxX, baseY + height, openingMax);
  }
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
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const openingCenter = (minX + maxX) * 0.5;
  const halfOpening = Math.min(doorWidth * 0.5, (maxX - minX) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;
  const halfThickness = thickness * 0.5;
  const minZ = wallZ - halfThickness;
  const maxZ = wallZ + halfThickness;

  if (openingMin > minX) {
    addBox(vertices, minX, baseY, minZ, openingMin, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, openingMin, baseY + height, maxZ);
  }

  if (openingMax < maxX) {
    addBox(vertices, openingMax, baseY, minZ, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, openingMax, baseY, minZ, maxX, baseY + height, maxZ);
  }

  if (doorHeight < height - 1e-5) {
    const doorwayMinY = baseY + doorHeight;
    addBox(
      vertices,
      openingMin,
      doorwayMinY,
      minZ,
      openingMax,
      baseY + height,
      maxZ,
      accentColor,
      bounds
    );
    addCollider(colliders, openingMin, doorwayMinY, minZ, openingMax, baseY + height, maxZ);
  }
}

function positionToCell(value, roomSize, halfRoom) {
  return Math.floor((value + halfRoom) / roomSize);
}

function positionToLayer(value, levelHeight, floorThickness) {
  return Math.floor((value + floorThickness) / levelHeight);
}

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
  const generationRadius = Math.max(1, Math.floor(options.generationRadius ?? DEFAULT_GENERATION_RADIUS));
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
  const cellEdgeStates = new Map();
  const cellLayerEdgeStates = new Map();
  const cellVerticalOpenings = new Map();
  const discoveredBarrelRooms = new Set();
  const pendingBarrelSpawns = [];

  function getCellKey(x, z) {
    return `${x},${z}`;
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

  function getCellEdges(x, z) {
    const key = getCellKey(x, z);
    let edges = cellEdgeStates.get(key);
    if (!edges) {
      edges = { north: null, south: null, east: null, west: null };
      cellEdgeStates.set(key, edges);
    }
    return edges;
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

  function evaluateCellForBarrel(x, z) {
    const key = getCellKey(x, z);
    if (discoveredBarrelRooms.has(key)) {
      return;
    }

    const edges = cellEdgeStates.get(key);
    if (!edges) {
      return;
    }

    const doorNorth = edges.north === 'doorway';
    const doorSouth = edges.south === 'doorway';
    const doorEast = edges.east === 'doorway';
    const doorWest = edges.west === 'doorway';
    const doorwayCount = (doorNorth ? 1 : 0) + (doorSouth ? 1 : 0) + (doorEast ? 1 : 0) + (doorWest ? 1 : 0);

    if (doorwayCount !== 2) {
      return;
    }

    const hasNorthSouth = doorNorth && doorSouth;
    const hasEastWest = doorEast && doorWest;

    if (!hasNorthSouth && !hasEastWest) {
      return;
    }

    const perpendicularSolid = hasNorthSouth
      ? edges.east === 'solid' && edges.west === 'solid'
      : edges.north === 'solid' && edges.south === 'solid';

    if (!perpendicularSolid) {
      return;
    }

    const position = [x * roomSize, 0, z * roomSize];
    pendingBarrelSpawns.push({ key, position });
    discoveredBarrelRooms.add(key);
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

    const shouldOpen = doorwayCount === 1 && closedCount >= 3 && !openEdge;
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
    const edgeA = getCellEdges(ax, az);
    const edgeB = getCellEdges(bx, bz);
    const dx = bx - ax;
    const dz = bz - az;
    let baseType = effectiveLayerTypes.get(centerLayerIndex);
    if (baseType === undefined) {
      const first = effectiveLayerTypes.values().next();
      baseType = first.done ? 'solid' : first.value;
    }

    if (dx === 1 && dz === 0) {
      edgeA.east = baseType;
      edgeB.west = baseType;
    } else if (dx === -1 && dz === 0) {
      edgeA.west = baseType;
      edgeB.east = baseType;
    } else if (dx === 0 && dz === 1) {
      edgeA.south = baseType;
      edgeB.north = baseType;
    } else if (dx === 0 && dz === -1) {
      edgeA.north = baseType;
      edgeB.south = baseType;
    }

    evaluateCellForBarrel(ax, az);
    evaluateCellForBarrel(bx, bz);

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
              const isDoubleDoor = type === 'doorway'
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
              const isDoubleDoor = type === 'doorway'
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
