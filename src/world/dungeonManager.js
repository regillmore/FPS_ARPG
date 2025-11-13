const FLOATS_PER_VERTEX = 9;

const ROTATION_COS = [1, 0, -1, 0];
const ROTATION_SIN = [0, 1, 0, -1];

function rotatePosition(point, rotationIndex) {
  const cos = ROTATION_COS[rotationIndex & 3];
  const sin = ROTATION_SIN[rotationIndex & 3];
  const x = point[0];
  const y = point[1];
  const z = point[2];
  return [x * cos - z * sin, y, x * sin + z * cos];
}

function rotateDirection(direction, rotationIndex) {
  const cos = ROTATION_COS[rotationIndex & 3];
  const sin = ROTATION_SIN[rotationIndex & 3];
  const x = direction[0];
  const y = direction[1];
  const z = direction[2];
  return [x * cos - z * sin, y, x * sin + z * cos];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRng(seed = Date.now()) {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x6d2b79f5;
  }
  return function rng() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function jitter(color, amount, rng) {
  const r = clamp(color[0] + (rng() - 0.5) * amount, 0, 1);
  const g = clamp(color[1] + (rng() - 0.5) * amount, 0, 1);
  const b = clamp(color[2] + (rng() - 0.5) * amount, 0, 1);
  return [r, g, b];
}

function pushVertex(buffer, vertex, normal, color) {
  buffer.push(vertex[0], vertex[1], vertex[2], normal[0], normal[1], normal[2], color[0], color[1], color[2]);
}

function pushQuad(buffer, a, b, c, d, normal, color) {
  pushVertex(buffer, a, normal, color);
  pushVertex(buffer, c, normal, color);
  pushVertex(buffer, b, normal, color);
  pushVertex(buffer, a, normal, color);
  pushVertex(buffer, d, normal, color);
  pushVertex(buffer, c, normal, color);
}

function emitWallSegment(buffer, orientation, x0, x1, y0, y1, plane, color) {
  if (x1 - x0 <= 1e-3 || y1 - y0 <= 1e-3) {
    return;
  }
  if (orientation === 'front') {
    pushQuad(
      buffer,
      [x0, y0, plane],
      [x1, y0, plane],
      [x1, y1, plane],
      [x0, y1, plane],
      [0, 0, -1],
      color
    );
  } else if (orientation === 'back') {
    pushQuad(
      buffer,
      [x1, y0, plane],
      [x0, y0, plane],
      [x0, y1, plane],
      [x1, y1, plane],
      [0, 0, 1],
      color
    );
  } else if (orientation === 'left') {
    pushQuad(
      buffer,
      [plane, y0, x1],
      [plane, y0, x0],
      [plane, y1, x0],
      [plane, y1, x1],
      [1, 0, 0],
      color
    );
  } else if (orientation === 'right') {
    pushQuad(
      buffer,
      [plane, y0, x0],
      [plane, y0, x1],
      [plane, y1, x1],
      [plane, y1, x0],
      [-1, 0, 0],
      color
    );
  }
}

function emitWallWithDoor(buffer, options) {
  const { orientation, minX, maxX, minY, maxY, z, x, color, door } = options;
  if (!door) {
    if (orientation === 'left' || orientation === 'right') {
      emitWallSegment(buffer, orientation, minX, maxX, minY, maxY, x ?? 0, color);
    } else {
      emitWallSegment(buffer, orientation, minX, maxX, minY, maxY, z ?? 0, color);
    }
    return;
  }

  if (orientation === 'left' || orientation === 'right') {
    const planeX = x ?? 0;
    const spanMin = minX;
    const spanMax = maxX;
    const spanLength = spanMax - spanMin;
    if (spanLength <= 1e-3) {
      return;
    }
    const doorHalfWidth = clamp(door.width * 0.5, 0, spanLength * 0.5 - 0.05);
    const doorOffset = clamp(door.offset ?? 0, -1, 1) * (spanLength - doorHalfWidth * 2) * 0.5;
    const doorCenter = (spanMin + spanMax) * 0.5 + doorOffset;
    const doorMin = clamp(doorCenter - doorHalfWidth, spanMin, spanMax);
    const doorMax = clamp(doorCenter + doorHalfWidth, spanMin, spanMax);
    const doorBottom = clamp(minY + (door.bottom ?? 0), minY, maxY);
    const doorTop = clamp(doorBottom + door.height, minY, maxY);

    emitWallSegment(buffer, orientation, spanMin, doorMin, minY, maxY, planeX, color);
    emitWallSegment(buffer, orientation, doorMax, spanMax, minY, maxY, planeX, color);
    emitWallSegment(buffer, orientation, doorMin, doorMax, doorTop, maxY, planeX, color);
    if (doorBottom > minY + 1e-3) {
      emitWallSegment(buffer, orientation, doorMin, doorMax, minY, doorBottom, planeX, color);
    }
    return;
  }

  const doorHalfWidth = clamp(door.width * 0.5, 0, (maxX - minX) * 0.5 - 0.05);
  const doorOffset = clamp(door.offset ?? 0, -1, 1) * (maxX - minX - doorHalfWidth * 2) * 0.5;
  const doorCenter = (minX + maxX) * 0.5 + doorOffset;
  const doorMinX = clamp(doorCenter - doorHalfWidth, minX, maxX);
  const doorMaxX = clamp(doorCenter + doorHalfWidth, minX, maxX);
  const doorBottom = clamp(minY + (door.bottom ?? 0), minY, maxY);
  const doorTop = clamp(doorBottom + door.height, minY, maxY);

  emitWallSegment(buffer, orientation, minX, doorMinX, minY, maxY, z ?? 0, color);
  emitWallSegment(buffer, orientation, doorMaxX, maxX, minY, maxY, z ?? 0, color);
  emitWallSegment(buffer, orientation, doorMinX, doorMaxX, doorTop, maxY, z ?? 0, color);
  if (doorBottom > minY + 1e-3) {
    emitWallSegment(buffer, orientation, doorMinX, doorMaxX, minY, doorBottom, z ?? 0, color);
  }
}

function emitBox(buffer, bounds, color) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  pushQuad(
    buffer,
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [minX, maxY, minZ],
    [0, 0, -1],
    color
  );
  pushQuad(
    buffer,
    [minX, maxY, maxZ],
    [maxX, maxY, maxZ],
    [maxX, minY, maxZ],
    [minX, minY, maxZ],
    [0, 0, 1],
    color
  );
  pushQuad(
    buffer,
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [maxX, maxY, maxZ],
    [maxX, maxY, minZ],
    [1, 0, 0],
    color
  );
  pushQuad(
    buffer,
    [minX, minY, maxZ],
    [minX, minY, minZ],
    [minX, maxY, minZ],
    [minX, maxY, maxZ],
    [-1, 0, 0],
    color
  );
  pushQuad(
    buffer,
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [maxX, minY, minZ],
    [minX, minY, minZ],
    [0, -1, 0],
    color
  );
  pushQuad(
    buffer,
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
    [0, 1, 0],
    color
  );
}

function emitFloorAndCeiling(buffer, minX, maxX, minZ, maxZ, minY, maxY, floorColor, ceilingColor) {
  pushQuad(
    buffer,
    [minX, minY, minZ],
    [maxX, minY, minZ],
    [maxX, minY, maxZ],
    [minX, minY, maxZ],
    [0, 1, 0],
    floorColor
  );
  pushQuad(
    buffer,
    [minX, maxY, maxZ],
    [maxX, maxY, maxZ],
    [maxX, maxY, minZ],
    [minX, maxY, minZ],
    [0, -1, 0],
    ceilingColor
  );
}

function buildEntryModule(rng) {
  const length = 12;
  const minX = -5;
  const maxX = 5;
  const minY = 0;
  const maxY = 4;
  const minZ = 0;
  const maxZ = length;

  const buffer = [];
  const baseFloor = [0.28, 0.28, 0.31];
  const baseCeiling = [0.18, 0.18, 0.21];
  const baseWall = [0.32, 0.34, 0.4];

  emitFloorAndCeiling(buffer, minX, maxX, minZ, maxZ, minY, maxY, baseFloor, baseCeiling);

  emitWallSegment(buffer, 'back', minX, maxX, minY, maxY, minZ, baseWall);
  emitWallWithDoor(buffer, {
    orientation: 'front',
    minX,
    maxX,
    minY,
    maxY,
    z: maxZ,
    color: baseWall,
    door: {
      width: 4.5,
      height: 2.8,
      bottom: 0,
      offset: 0
    }
  });

  // Add a couple of structural supports for interest.
  const supportWidth = 0.6;
  const supportDepth = 0.8;
  const supportHeight = 3.6;
  const supportColor = [0.26, 0.27, 0.33];

  emitBox(buffer, {
    minX: minX + 0.5,
    maxX: minX + 0.5 + supportWidth,
    minY,
    maxY: minY + supportHeight,
    minZ: maxZ - supportDepth - 0.2,
    maxZ: maxZ - 0.2
  }, supportColor);

  emitBox(buffer, {
    minX: maxX - 0.5 - supportWidth,
    maxX: maxX - 0.5,
    minY,
    maxY: minY + supportHeight,
    minZ: maxZ - supportDepth - 0.2,
    maxZ: maxZ - 0.2
  }, supportColor);

  return {
    type: 'entry',
    vertexData: new Float32Array(buffer),
    localBounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth: 4.5,
    length,
    exitPosition: [0, 0, length],
    exitForward: [0, 0, 1],
    exitRotationDelta: 0,
    centerline: [
      { start: [0, 0], end: [0, length], length }
    ]
  };
}

function buildRoomModule(rng, previous) {
  const length = lerp(10, 16, rng());
  const halfWidth = lerp(5.5, 7.5, rng());
  const minX = -halfWidth;
  const maxX = halfWidth;
  const minY = 0;
  const maxY = lerp(4.2, 5.0, rng());
  const minZ = 0;
  const maxZ = length;

  const buffer = [];
  const baseFloor = jitter([0.23, 0.24, 0.27], 0.04, rng);
  const baseCeiling = jitter([0.17, 0.18, 0.22], 0.03, rng);
  const wallColor = jitter([0.3, 0.32, 0.38], 0.05, rng);
  const accentColor = jitter([0.38, 0.36, 0.45], 0.06, rng);

  emitFloorAndCeiling(buffer, minX, maxX, minZ, maxZ, minY, maxY, baseFloor, baseCeiling);

  const entryWidth = previous?.exitWidth
    ? clamp(previous.exitWidth, 3, halfWidth * 2 - 1)
    : Math.min(halfWidth * 2 - 1, 4.5);
  const exitWidth = clamp(lerp(3.6, Math.min(halfWidth * 2 - 1.2, 5.5), rng()), 3, halfWidth * 2 - 0.6);

  emitWallWithDoor(buffer, {
    orientation: 'back',
    minX,
    maxX,
    minY,
    maxY,
    z: minZ,
    color: wallColor,
    door: {
      width: entryWidth,
      height: 2.9,
      bottom: 0,
      offset: lerp(-0.3, 0.3, rng())
    }
  });

  emitWallWithDoor(buffer, {
    orientation: 'front',
    minX,
    maxX,
    minY,
    maxY,
    z: maxZ,
    color: wallColor,
    door: {
      width: exitWidth,
      height: 2.9,
      bottom: 0,
      offset: lerp(-0.35, 0.35, rng())
    }
  });

  // Left and right walls
  pushQuad(
    buffer,
    [minX, minY, minZ],
    [minX, minY, maxZ],
    [minX, maxY, maxZ],
    [minX, maxY, minZ],
    [1, 0, 0],
    wallColor
  );
  pushQuad(
    buffer,
    [maxX, minY, maxZ],
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [-1, 0, 0],
    wallColor
  );

  // Crown trim near the ceiling for visual breakup
  const trimHeight = 0.35;
  const trimDepth = 0.45;
  emitBox(buffer, {
    minX,
    maxX,
    minY: maxY - trimHeight,
    maxY,
    minZ,
    maxZ: minZ + trimDepth
  }, accentColor);
  emitBox(buffer, {
    minX,
    maxX,
    minY: maxY - trimHeight,
    maxY,
    minZ: maxZ - trimDepth,
    maxZ
  }, accentColor);
  emitBox(buffer, {
    minX,
    maxX: minX + trimDepth,
    minY: maxY - trimHeight,
    maxY,
    minZ,
    maxZ
  }, accentColor);
  emitBox(buffer, {
    minX: maxX - trimDepth,
    maxX,
    minY: maxY - trimHeight,
    maxY,
    minZ,
    maxZ
  }, accentColor);

  // Raised floor plinth in the center of the room
  const platformHeight = lerp(0.15, 0.35, rng());
  const platformInset = 1.2;
  emitBox(buffer, {
    minX: minX + platformInset,
    maxX: maxX - platformInset,
    minY,
    maxY: minY + platformHeight,
    minZ: minZ + platformInset,
    maxZ: maxZ - platformInset
  }, jitter([0.27, 0.28, 0.3], 0.03, rng));

  const columnCount = 1 + Math.floor(rng() * 3);
  const columnRadius = lerp(0.35, 0.55, rng());
  const columnHeight = maxY - trimHeight - 0.1;
  for (let i = 0; i < columnCount; i += 1) {
    const t = (i + 1) / (columnCount + 1);
    const centerX = lerp(minX + columnRadius * 2.0, maxX - columnRadius * 2.0, rng());
    const centerZ = lerp(length * 0.25, length * 0.75, t);
    emitBox(buffer, {
      minX: centerX - columnRadius,
      maxX: centerX + columnRadius,
      minY,
      maxY: minY + columnHeight,
      minZ: centerZ - columnRadius,
      maxZ: centerZ + columnRadius
    }, accentColor);
  }

  return {
    type: 'room',
    vertexData: new Float32Array(buffer),
    localBounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth,
    length,
    exitPosition: [0, 0, length],
    exitForward: [0, 0, 1],
    exitRotationDelta: 0,
    centerline: [
      { start: [0, 0], end: [0, length], length }
    ]
  };
}

function buildHallwayModule(rng, previous) {
  const length = lerp(8, 14, rng());
  const halfWidth = lerp(2.5, 3.5, rng());
  const minX = -halfWidth;
  const maxX = halfWidth;
  const minY = 0;
  const maxY = 3.6;
  const minZ = 0;
  const maxZ = length;

  const buffer = [];
  const floorColor = jitter([0.2, 0.22, 0.24], 0.03, rng);
  const ceilingColor = jitter([0.12, 0.13, 0.16], 0.02, rng);
  const wallColor = jitter([0.28, 0.3, 0.34], 0.04, rng);
  const trimColor = jitter([0.35, 0.36, 0.4], 0.05, rng);

  emitFloorAndCeiling(buffer, minX, maxX, minZ, maxZ, minY, maxY, floorColor, ceilingColor);

  // Back wall (entrance)
  emitWallWithDoor(buffer, {
    orientation: 'back',
    minX,
    maxX,
    minY,
    maxY,
    z: minZ,
    color: wallColor,
    door: {
      width: previous?.exitWidth ? clamp(previous.exitWidth, 2.5, halfWidth * 2 - 0.4) : halfWidth * 2 - 0.5,
      height: 2.6,
      bottom: 0,
      offset: 0
    }
  });

  // Front wall (exit)
  emitWallWithDoor(buffer, {
    orientation: 'front',
    minX,
    maxX,
    minY,
    maxY,
    z: maxZ,
    color: wallColor,
    door: {
      width: halfWidth * 2 - 0.6,
      height: 2.6,
      bottom: 0,
      offset: lerp(-0.25, 0.25, rng())
    }
  });

  // Side walls
  pushQuad(
    buffer,
    [minX, minY, minZ],
    [minX, minY, maxZ],
    [minX, maxY, maxZ],
    [minX, maxY, minZ],
    [1, 0, 0],
    wallColor
  );
  pushQuad(
    buffer,
    [maxX, minY, maxZ],
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [-1, 0, 0],
    wallColor
  );

  // Ceiling beams for interest
  const beamCount = 2 + Math.floor(rng() * 3);
  const beamThickness = 0.25;
  for (let i = 0; i < beamCount; i += 1) {
    const t = (i + 1) / (beamCount + 1);
    const beamZ = lerp(1, length - 1, t);
    emitBox(buffer, {
      minX,
      maxX,
      minY: maxY - beamThickness * 2,
      maxY: maxY,
      minZ: beamZ - beamThickness,
      maxZ: beamZ + beamThickness
    }, trimColor);
  }

  return {
    type: 'hallway',
    vertexData: new Float32Array(buffer),
    localBounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth: halfWidth * 2 - 0.6,
    length,
    exitPosition: [0, 0, length],
    exitForward: [0, 0, 1],
    exitRotationDelta: 0,
    centerline: [
      { start: [0, 0], end: [0, length], length }
    ]
  };
}

function buildLeftTurnModule(rng, previous) {
  const forwardLength = lerp(5.5, 8, rng());
  const sideLength = lerp(5, 7.5, rng());
  const halfWidth = lerp(2.6, 3.2, rng());
  const minY = 0;
  const maxY = 3.6;
  const minZ = 0;
  const maxZ = forwardLength + halfWidth;
  const minX = -sideLength;
  const maxX = halfWidth;

  const buffer = [];
  const floorColor = jitter([0.2, 0.22, 0.24], 0.03, rng);
  const ceilingColor = jitter([0.12, 0.13, 0.16], 0.02, rng);
  const wallColor = jitter([0.28, 0.3, 0.34], 0.04, rng);
  const trimColor = jitter([0.35, 0.36, 0.4], 0.05, rng);

  // Entry leg floor and ceiling
  emitFloorAndCeiling(buffer, -halfWidth, halfWidth, 0, forwardLength, minY, maxY, floorColor, ceilingColor);
  // Side leg floor and ceiling (extend slightly into the entry leg for overlap)
  emitFloorAndCeiling(
    buffer,
    -sideLength,
    halfWidth,
    forwardLength - halfWidth,
    forwardLength + halfWidth,
    minY,
    maxY,
    floorColor,
    ceilingColor
  );

  const entryWidth = previous?.exitWidth
    ? clamp(previous.exitWidth, 2.5, halfWidth * 2 - 0.4)
    : halfWidth * 2 - 0.5;
  const exitWidth = clamp(halfWidth * 2 - 0.6, 2.4, halfWidth * 2 - 0.4);

  // Back wall with entry door
  emitWallWithDoor(buffer, {
    orientation: 'back',
    minX: -halfWidth,
    maxX: halfWidth,
    minY,
    maxY,
    z: 0,
    color: wallColor,
    door: {
      width: entryWidth,
      height: 2.7,
      bottom: 0,
      offset: lerp(-0.25, 0.25, rng())
    }
  });

  // Right outer wall along the long leg
  emitWallSegment(buffer, 'right', 0, forwardLength + halfWidth, minY, maxY, halfWidth, wallColor);

  // Front outer wall closing the top
  emitWallSegment(buffer, 'front', minX, maxX, minY, maxY, forwardLength + halfWidth, wallColor);

  // Exit wall with doorway on the side corridor
  emitWallWithDoor(buffer, {
    orientation: 'left',
    minX: forwardLength - halfWidth,
    maxX: forwardLength + halfWidth,
    minY,
    maxY,
    x: -sideLength,
    color: wallColor,
    door: {
      width: exitWidth,
      height: 2.6,
      bottom: 0,
      offset: lerp(-0.2, 0.2, rng())
    }
  });

  // Inner corner walls to carve the turn opening
  emitWallSegment(buffer, 'back', minX, -halfWidth, minY, maxY, forwardLength - halfWidth, wallColor);
  emitWallSegment(buffer, 'left', 0, forwardLength - halfWidth, minY, maxY, -halfWidth, wallColor);

  // Decorative elements: ceiling ribs leading into the turn
  const ribCount = 2 + Math.floor(rng() * 2);
  const ribThickness = 0.22;
  for (let i = 0; i < ribCount; i += 1) {
    const t = (i + 1) / (ribCount + 1);
    const ribZ = lerp(1.2, forwardLength - 0.6, t);
    emitBox(buffer, {
      minX: -halfWidth,
      maxX: halfWidth,
      minY: maxY - ribThickness * 2,
      maxY: maxY,
      minZ: ribZ - ribThickness,
      maxZ: ribZ + ribThickness
    }, trimColor);
  }

  // Corner column to visually anchor the bend
  const columnSize = lerp(0.6, 0.8, rng());
  emitBox(buffer, {
    minX: -halfWidth - columnSize * 0.5,
    maxX: -halfWidth + columnSize * 0.5,
    minY,
    maxY: minY + 3.2,
    minZ: forwardLength - halfWidth - columnSize * 0.5,
    maxZ: forwardLength - halfWidth + columnSize * 0.5
  }, trimColor);

  const localBounds = { minX, maxX, minY, maxY, minZ, maxZ };
  const length = forwardLength + sideLength;
  const exitPosition = [-sideLength, 0, forwardLength];
  const exitForward = [-1, 0, 0];

  return {
    type: 'turn-left',
    vertexData: new Float32Array(buffer),
    localBounds,
    exitWidth,
    length,
    exitPosition,
    exitForward,
    exitRotationDelta: -1,
    centerline: [
      { start: [0, 0], end: [0, forwardLength], length: forwardLength },
      { start: [0, forwardLength], end: [-sideLength, forwardLength], length: sideLength }
    ]
  };
}

function mirrorTurnModule(base) {
  const mirroredVertices = new Float32Array(base.vertexData.length);
  for (let i = 0; i < base.vertexData.length; i += FLOATS_PER_VERTEX) {
    mirroredVertices[i] = -base.vertexData[i];
    mirroredVertices[i + 1] = base.vertexData[i + 1];
    mirroredVertices[i + 2] = base.vertexData[i + 2];
    mirroredVertices[i + 3] = -base.vertexData[i + 3];
    mirroredVertices[i + 4] = base.vertexData[i + 4];
    mirroredVertices[i + 5] = base.vertexData[i + 5];
    mirroredVertices[i + 6] = base.vertexData[i + 6];
    mirroredVertices[i + 7] = base.vertexData[i + 7];
    mirroredVertices[i + 8] = base.vertexData[i + 8];
  }

  const bounds = base.localBounds;
  const mirroredBounds = {
    minX: -bounds.maxX,
    maxX: -bounds.minX,
    minY: bounds.minY,
    maxY: bounds.maxY,
    minZ: bounds.minZ,
    maxZ: bounds.maxZ
  };

  const centerline = base.centerline.map((segment) => ({
    start: [-segment.start[0], segment.start[1]],
    end: [-segment.end[0], segment.end[1]],
    length: segment.length
  }));

  return {
    type: 'turn-right',
    vertexData: mirroredVertices,
    localBounds: mirroredBounds,
    exitWidth: base.exitWidth,
    length: base.length,
    exitPosition: [-base.exitPosition[0], base.exitPosition[1], base.exitPosition[2]],
    exitForward: [-base.exitForward[0], base.exitForward[1], base.exitForward[2]],
    exitRotationDelta: 1,
    centerline
  };
}

function buildTurnModule(turnDirection, rng, previous) {
  const template = buildLeftTurnModule(rng, previous);
  if (turnDirection === 'right') {
    return mirrorTurnModule(template);
  }
  return template;
}

function chooseNextType(rng, previousType) {
  const allowTurn = previousType !== 'turn-left' && previousType !== 'turn-right';
  const turnRoll = allowTurn ? rng() : 1;
  if (turnRoll < 0.18) {
    return rng() < 0.5 ? 'turn-left' : 'turn-right';
  }
  const roll = rng();
  if (previousType === 'hallway') {
    return roll < 0.65 ? 'room' : 'hallway';
  }
  if (previousType === 'room') {
    return roll < 0.45 ? 'hallway' : 'room';
  }
  if (previousType === 'turn-left' || previousType === 'turn-right') {
    return roll < 0.55 ? 'hallway' : 'room';
  }
  return roll < 0.5 ? 'room' : 'hallway';
}

export function createDungeonManager(device, options = {}) {
  const rng = createRng(options.seed ?? Date.now());
  const defaultBounds = {
    minX: -5,
    maxX: 5,
    minY: 0,
    maxY: 4,
    minZ: -6,
    maxZ: 6
  };
  const bounds = {
    minX: defaultBounds.minX,
    maxX: defaultBounds.maxX,
    minY: defaultBounds.minY,
    maxY: defaultBounds.maxY,
    minZ: defaultBounds.minZ,
    maxZ: defaultBounds.maxZ
  };
  const globalBounds = {
    minX: defaultBounds.minX,
    maxX: defaultBounds.maxX,
    minY: defaultBounds.minY,
    maxY: defaultBounds.maxY,
    minZ: defaultBounds.minZ,
    maxZ: defaultBounds.maxZ
  };

  const modules = [];
  let vertexData = new Float32Array(0);
  let vertexBuffer = null;
  let vertexCount = 0;
  let gpuDirty = true;
  let needsRebuild = true;

  const aheadDistance = options.aheadDistance ?? 70;
  const behindCullDistance = options.behindCullDistance ?? 45;
  const minActiveModules = Math.max(3, options.minActiveModules ?? 6);

  let cursorPosition = [0, 0, -6];
  let cursorRotationIndex = 0;
  let cursorPathDistance = 0;

  const boundsTransitionPadding = Math.max(0, options.boundsTransitionPadding ?? 0.85);
  let lastKnownPlayerDistance = 0;

  function ensureFiniteBounds(target, fallback) {
    if (!Number.isFinite(target.minX) || !Number.isFinite(target.maxX)) {
      target.minX = fallback.minX;
      target.maxX = fallback.maxX;
    }
    if (!Number.isFinite(target.minY) || !Number.isFinite(target.maxY)) {
      target.minY = fallback.minY;
      target.maxY = fallback.maxY;
    }
    if (!Number.isFinite(target.minZ) || !Number.isFinite(target.maxZ)) {
      target.minZ = fallback.minZ;
      target.maxZ = fallback.maxZ;
    }
  }

  function estimatePlayerDistance(playerPosition) {
    const px = playerPosition && Number.isFinite(playerPosition[0]) ? playerPosition[0] : null;
    const pz = playerPosition && Number.isFinite(playerPosition[2]) ? playerPosition[2] : null;
    let bestDistance = Number.isFinite(lastKnownPlayerDistance) ? lastKnownPlayerDistance : 0;
    let bestScore = Infinity;

    if (px === null || pz === null) {
      if (!Number.isFinite(bestDistance) && modules.length > 0) {
        bestDistance = modules[0].pathStart;
      }
      return bestDistance;
    }

    for (const module of modules) {
      const segments = module?.centerline;
      if (!segments) {
        continue;
      }
      for (const segment of segments) {
        const sx = segment.start[0];
        const sz = segment.start[1];
        const ex = segment.end[0];
        const ez = segment.end[1];
        const dx = ex - sx;
        const dz = ez - sz;
        const lengthSq = dx * dx + dz * dz;
        if (lengthSq <= 1e-6) {
          continue;
        }
        const t = clamp(((px - sx) * dx + (pz - sz) * dz) / lengthSq, 0, 1);
        const closestX = sx + dx * t;
        const closestZ = sz + dz * t;
        const distSq = (px - closestX) * (px - closestX) + (pz - closestZ) * (pz - closestZ);
        if (distSq < bestScore) {
          bestScore = distSq;
          bestDistance = module.pathStart + segment.startOffset + segment.length * t;
        }
      }
    }

    return bestDistance;
  }

  function updateActiveBounds(playerDistance) {
    let targetDistance = Number.isFinite(playerDistance) ? playerDistance : lastKnownPlayerDistance;
    if (!Number.isFinite(targetDistance)) {
      if (modules.length > 0) {
        targetDistance = modules[0].pathStart;
      } else {
        targetDistance = 0;
      }
    }

    lastKnownPlayerDistance = targetDistance;

    let closest = null;
    let closestGap = Infinity;
    for (const module of modules) {
      if (!module?.bounds) {
        continue;
      }
      const paddedStart = module.pathStart - boundsTransitionPadding;
      const paddedEnd = module.pathEnd + boundsTransitionPadding;
      let gap = 0;
      if (targetDistance < paddedStart) {
        gap = paddedStart - targetDistance;
      } else if (targetDistance > paddedEnd) {
        gap = targetDistance - paddedEnd;
      }
      if (gap < closestGap) {
        closestGap = gap;
        closest = module.bounds;
        if (gap <= 0) {
          break;
        }
      }
    }

    if (closest) {
      bounds.minX = closest.minX;
      bounds.maxX = closest.maxX;
      bounds.minY = closest.minY;
      bounds.maxY = closest.maxY;
    } else {
      bounds.minX = globalBounds.minX;
      bounds.maxX = globalBounds.maxX;
      bounds.minY = globalBounds.minY;
      bounds.maxY = globalBounds.maxY;
    }

    bounds.minZ = globalBounds.minZ;
    bounds.maxZ = globalBounds.maxZ;

    ensureFiniteBounds(bounds, defaultBounds);
  }

  function rebuildBounds() {
    globalBounds.minX = Infinity;
    globalBounds.maxX = -Infinity;
    globalBounds.minY = Infinity;
    globalBounds.maxY = -Infinity;
    globalBounds.minZ = Infinity;
    globalBounds.maxZ = -Infinity;

    for (const module of modules) {
      if (!module || !module.bounds) {
        continue;
      }
      const m = module.bounds;
      globalBounds.minX = Math.min(globalBounds.minX, m.minX);
      globalBounds.maxX = Math.max(globalBounds.maxX, m.maxX);
      globalBounds.minY = Math.min(globalBounds.minY, m.minY);
      globalBounds.maxY = Math.max(globalBounds.maxY, m.maxY);
      globalBounds.minZ = Math.min(globalBounds.minZ, m.minZ);
      globalBounds.maxZ = Math.max(globalBounds.maxZ, m.maxZ);
    }

    ensureFiniteBounds(globalBounds, defaultBounds);
    updateActiveBounds(lastKnownPlayerDistance);
  }

  function rebuildVertexData() {
    let totalFloats = 0;
    for (const module of modules) {
      totalFloats += module.vertexData.length;
    }
    const combined = new Float32Array(totalFloats);
    let offset = 0;
    for (const module of modules) {
      combined.set(module.vertexData, offset);
      offset += module.vertexData.length;
    }
    vertexData = combined;
    vertexCount = totalFloats / FLOATS_PER_VERTEX;
    gpuDirty = true;
    rebuildBounds();
  }

  function ensureGpuResources() {
    if (!gpuDirty) {
      return;
    }
    if (vertexBuffer) {
      vertexBuffer.destroy?.();
      vertexBuffer = null;
    }
    if (vertexData.length === 0) {
      vertexBuffer = device.createBuffer({
        size: Float32Array.BYTES_PER_ELEMENT,
        usage: GPUBufferUsage.VERTEX
      });
      vertexCount = 0;
      gpuDirty = false;
      return;
    }
    vertexBuffer = device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
    vertexBuffer.unmap();
    gpuDirty = false;
  }

  function placeModule(template) {
    if (!template) {
      return null;
    }
    const rotationIndex = cursorRotationIndex & 3;
    const translation = cursorPosition;
    const transformedVertices = new Float32Array(template.vertexData.length);

    for (let i = 0; i < template.vertexData.length; i += FLOATS_PER_VERTEX) {
      const position = rotatePosition(
        [template.vertexData[i], template.vertexData[i + 1], template.vertexData[i + 2]],
        rotationIndex
      );
      position[0] += translation[0];
      position[1] += translation[1];
      position[2] += translation[2];

      const normal = rotateDirection(
        [template.vertexData[i + 3], template.vertexData[i + 4], template.vertexData[i + 5]],
        rotationIndex
      );

      transformedVertices[i] = position[0];
      transformedVertices[i + 1] = position[1];
      transformedVertices[i + 2] = position[2];
      transformedVertices[i + 3] = normal[0];
      transformedVertices[i + 4] = normal[1];
      transformedVertices[i + 5] = normal[2];
      transformedVertices[i + 6] = template.vertexData[i + 6];
      transformedVertices[i + 7] = template.vertexData[i + 7];
      transformedVertices[i + 8] = template.vertexData[i + 8];
    }

    const localBounds = template.localBounds ?? {
      minX: -1,
      maxX: 1,
      minY: 0,
      maxY: 1,
      minZ: 0,
      maxZ: template.length ?? 1
    };
    const corners = [
      [localBounds.minX, localBounds.minY, localBounds.minZ],
      [localBounds.minX, localBounds.minY, localBounds.maxZ],
      [localBounds.minX, localBounds.maxY, localBounds.minZ],
      [localBounds.minX, localBounds.maxY, localBounds.maxZ],
      [localBounds.maxX, localBounds.minY, localBounds.minZ],
      [localBounds.maxX, localBounds.minY, localBounds.maxZ],
      [localBounds.maxX, localBounds.maxY, localBounds.minZ],
      [localBounds.maxX, localBounds.maxY, localBounds.maxZ]
    ];

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const corner of corners) {
      const worldCorner = rotatePosition(corner, rotationIndex);
      worldCorner[0] += translation[0];
      worldCorner[1] += translation[1];
      worldCorner[2] += translation[2];
      minX = Math.min(minX, worldCorner[0]);
      maxX = Math.max(maxX, worldCorner[0]);
      minY = Math.min(minY, worldCorner[1]);
      maxY = Math.max(maxY, worldCorner[1]);
      minZ = Math.min(minZ, worldCorner[2]);
      maxZ = Math.max(maxZ, worldCorner[2]);
    }

    const pathStart = cursorPathDistance;
    const pathEnd = pathStart + (template.length ?? 0);

    const segments = [];
    let segmentOffset = 0;
    if (Array.isArray(template.centerline)) {
      for (const segment of template.centerline) {
        const startLocal = rotatePosition([segment.start[0], 0, segment.start[1]], rotationIndex);
        const endLocal = rotatePosition([segment.end[0], 0, segment.end[1]], rotationIndex);
        const start = [startLocal[0] + translation[0], startLocal[2] + translation[2]];
        const end = [endLocal[0] + translation[0], endLocal[2] + translation[2]];
        const length = segment.length ?? Math.hypot(end[0] - start[0], end[1] - start[1]);
        segments.push({ start, end, length, startOffset: segmentOffset });
        segmentOffset += length;
      }
    }

    const exitLocalPosition = rotatePosition(template.exitPosition, rotationIndex);
    exitLocalPosition[0] += translation[0];
    exitLocalPosition[1] += translation[1];
    exitLocalPosition[2] += translation[2];

    const exitForward = rotateDirection(template.exitForward, rotationIndex);

    const module = {
      type: template.type,
      vertexData: transformedVertices,
      bounds: { minX, maxX, minY, maxY, minZ, maxZ },
      exitWidth: template.exitWidth,
      exitPosition: exitLocalPosition.slice(),
      exitForward,
      pathStart,
      pathEnd,
      centerline: segments,
      length: template.length ?? 0
    };

    cursorPosition = exitLocalPosition.slice();
    cursorRotationIndex = (cursorRotationIndex + template.exitRotationDelta + 4) % 4;
    cursorPathDistance = pathEnd;

    return module;
  }

  function appendModule(type) {
    const previous = modules.length > 0 ? modules[modules.length - 1] : null;
    let template;
    if (!previous) {
      template = buildEntryModule(rng);
    } else if (type === 'hallway') {
      template = buildHallwayModule(rng, previous);
    } else if (type === 'room') {
      template = buildRoomModule(rng, previous);
    } else if (type === 'turn-left' || type === 'turn-right') {
      template = buildTurnModule(type === 'turn-left' ? 'left' : 'right', rng, previous);
    } else {
      template = buildHallwayModule(rng, previous);
    }

    const module = placeModule(template);
    if (module) {
      modules.push(module);
      needsRebuild = true;
    }
  }

  function initializeModules() {
    cursorPosition = [0, 0, -6];
    cursorRotationIndex = 0;
    cursorPathDistance = 0;
    lastKnownPlayerDistance = 0;
    appendModule('entry');
    let previousType = 'entry';
    const initialCount = Math.max(minActiveModules, options.initialModuleCount ?? 8);
    while (modules.length < initialCount) {
      const nextType = chooseNextType(rng, previousType);
      appendModule(nextType);
      previousType = nextType;
    }
  }

  function cullBehind(playerDistance) {
    if (modules.length <= minActiveModules) {
      return;
    }
    while (modules.length > minActiveModules) {
      const first = modules[0];
      if (!first) {
        break;
      }
      if (playerDistance - first.pathEnd < behindCullDistance) {
        break;
      }
      modules.shift();
      needsRebuild = true;
    }
  }

  function extendAhead(playerDistance) {
    let safety = 0;
    let referenceDistance = Number.isFinite(playerDistance) ? playerDistance : lastKnownPlayerDistance;
    if (!Number.isFinite(referenceDistance)) {
      referenceDistance = cursorPathDistance;
    }
    while (referenceDistance + aheadDistance > cursorPathDistance && safety < 32) {
      const previous = modules[modules.length - 1];
      const previousType = previous?.type ?? 'room';
      const nextType = chooseNextType(rng, previousType);
      appendModule(nextType);
      safety += 1;
    }
  }

  initializeModules();

  return {
    getVertexBuffer() {
      return vertexBuffer;
    },
    getVertexCount() {
      return vertexCount;
    },
    getBounds() {
      return bounds;
    },
    update(playerPosition) {
      const playerDistance = estimatePlayerDistance(playerPosition);
      extendAhead(playerDistance);
      cullBehind(playerDistance);
      if (needsRebuild) {
        rebuildVertexData();
        needsRebuild = false;
      }
      updateActiveBounds(playerDistance);
    },
    syncGPU() {
      ensureGpuResources();
    },
    destroy() {
      if (vertexBuffer) {
        vertexBuffer.destroy?.();
        vertexBuffer = null;
      }
    }
  };
}
