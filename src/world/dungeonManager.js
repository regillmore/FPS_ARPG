const FLOATS_PER_VERTEX = 9;

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

function emitWallSegment(buffer, orientation, x0, x1, y0, y1, z, color) {
  if (x1 - x0 <= 1e-3 || y1 - y0 <= 1e-3) {
    return;
  }
  if (orientation === 'front') {
    pushQuad(
      buffer,
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
      [0, 0, -1],
      color
    );
  } else {
    pushQuad(
      buffer,
      [x1, y0, z],
      [x0, y0, z],
      [x0, y1, z],
      [x1, y1, z],
      [0, 0, 1],
      color
    );
  }
}

function emitWallWithDoor(buffer, options) {
  const { orientation, minX, maxX, minY, maxY, z, color, door } = options;
  if (!door) {
    emitWallSegment(buffer, orientation, minX, maxX, minY, maxY, z, color);
    return;
  }

  const doorHalfWidth = clamp(door.width * 0.5, 0, (maxX - minX) * 0.5 - 0.05);
  const doorOffset = clamp(door.offset ?? 0, -1, 1) * (maxX - minX - doorHalfWidth * 2) * 0.5;
  const doorCenter = (minX + maxX) * 0.5 + doorOffset;
  const doorMinX = clamp(doorCenter - doorHalfWidth, minX, maxX);
  const doorMaxX = clamp(doorCenter + doorHalfWidth, minX, maxX);
  const doorBottom = clamp(minY + (door.bottom ?? 0), minY, maxY);
  const doorTop = clamp(doorBottom + door.height, minY, maxY);

  emitWallSegment(buffer, orientation, minX, doorMinX, minY, maxY, z, color);
  emitWallSegment(buffer, orientation, doorMaxX, maxX, minY, maxY, z, color);
  emitWallSegment(buffer, orientation, doorMinX, doorMaxX, doorTop, maxY, z, color);
  if (doorBottom > minY + 1e-3) {
    emitWallSegment(buffer, orientation, doorMinX, doorMaxX, minY, doorBottom, z, color);
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

function buildEntryModule(startZ, rng) {
  const length = 12;
  const endZ = startZ + length;
  const minX = -5;
  const maxX = 5;
  const minY = 0;
  const maxY = 4;
  const minZ = startZ;
  const maxZ = endZ;

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
    startZ,
    endZ,
    vertexData: new Float32Array(buffer),
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth: 4.5
  };
}

function buildRoomModule(startZ, rng, previous) {
  const length = lerp(10, 16, rng());
  const endZ = startZ + length;
  const halfWidth = lerp(5.5, 7.5, rng());
  const minX = -halfWidth;
  const maxX = halfWidth;
  const minY = 0;
  const maxY = lerp(4.2, 5.0, rng());
  const minZ = startZ;
  const maxZ = endZ;

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
    const centerZ = lerp(minZ + length * 0.25, maxZ - length * 0.25, t);
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
    startZ,
    endZ,
    vertexData: new Float32Array(buffer),
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth
  };
}

function buildHallwayModule(startZ, rng, previous) {
  const length = lerp(8, 14, rng());
  const endZ = startZ + length;
  const halfWidth = lerp(2.5, 3.5, rng());
  const minX = -halfWidth;
  const maxX = halfWidth;
  const minY = 0;
  const maxY = 3.6;
  const minZ = startZ;
  const maxZ = endZ;

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
    const beamZ = lerp(minZ + 1, maxZ - 1, t);
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
    startZ,
    endZ,
    vertexData: new Float32Array(buffer),
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    exitWidth: halfWidth * 2 - 0.6
  };
}

function chooseNextType(rng, previousType) {
  const roll = rng();
  if (previousType === 'hallway') {
    return roll < 0.65 ? 'room' : 'hallway';
  }
  if (previousType === 'room') {
    return roll < 0.45 ? 'hallway' : 'room';
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

  let nextStartZ = -6;

  const boundsTransitionPadding = Math.max(0, options.boundsTransitionPadding ?? 0.85);
  let lastKnownPlayerZ = 0;

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

  function updateActiveBounds(playerPosition) {
    let targetZ = lastKnownPlayerZ;
    const inputZ = playerPosition && Number.isFinite(playerPosition[2]) ? playerPosition[2] : null;
    if (inputZ !== null) {
      targetZ = inputZ;
      lastKnownPlayerZ = inputZ;
    } else if (!Number.isFinite(targetZ)) {
      targetZ = (globalBounds.minZ + globalBounds.maxZ) * 0.5;
      if (!Number.isFinite(targetZ)) {
        targetZ = 0;
      }
    }

    let closest = null;
    let closestDistance = Infinity;
    for (const module of modules) {
      const m = module?.bounds;
      if (!m) {
        continue;
      }
      const paddedMinZ = m.minZ - boundsTransitionPadding;
      const paddedMaxZ = m.maxZ + boundsTransitionPadding;
      let distance = 0;
      if (targetZ < paddedMinZ) {
        distance = paddedMinZ - targetZ;
      } else if (targetZ > paddedMaxZ) {
        distance = targetZ - paddedMaxZ;
      }
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = m;
        if (distance <= 0) {
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
    updateActiveBounds(null);
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

  function appendModule(type) {
    const previous = modules.length > 0 ? modules[modules.length - 1] : null;
    let module;
    if (!previous) {
      module = buildEntryModule(nextStartZ, rng);
      nextStartZ = module.endZ;
    } else if (type === 'hallway') {
      module = buildHallwayModule(nextStartZ, rng, previous);
      nextStartZ = module.endZ;
    } else {
      module = buildRoomModule(nextStartZ, rng, previous);
      nextStartZ = module.endZ;
    }
    modules.push(module);
    needsRebuild = true;
  }

  function initializeModules() {
    appendModule('entry');
    let previousType = 'entry';
    const initialCount = Math.max(minActiveModules, options.initialModuleCount ?? 8);
    while (modules.length < initialCount) {
      const nextType = chooseNextType(rng, previousType);
      appendModule(nextType);
      previousType = nextType;
    }
  }

  function cullBehind(playerZ) {
    if (modules.length <= minActiveModules) {
      return;
    }
    while (modules.length > minActiveModules) {
      const first = modules[0];
      if (!first) {
        break;
      }
      if (playerZ - first.endZ < behindCullDistance) {
        break;
      }
      modules.shift();
      needsRebuild = true;
    }
  }

  function extendAhead(playerZ) {
    let safety = 0;
    while (playerZ + aheadDistance > nextStartZ && safety < 32) {
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
      const playerZ = playerPosition && Number.isFinite(playerPosition[2]) ? playerPosition[2] : 0;
      extendAhead(playerZ);
      cullBehind(playerZ);
      if (needsRebuild) {
        rebuildVertexData();
        needsRebuild = false;
      }
      updateActiveBounds(playerPosition);
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
