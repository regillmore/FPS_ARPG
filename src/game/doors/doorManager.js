import { mat4FromRotationTranslation } from '../../math.js';

const FLOATS_PER_VERTEX = 10;
const DEFAULT_DOOR_COLOR = [0.62, 0.7, 0.82];
const MAX_SWING_RADIANS = Math.PI * 0.55;
const OPEN_SPEED = 2.8;
const CLOSE_SPEED = 2.1;
const COLLIDER_DISABLE_THRESHOLD = 0.9;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function rotateY(out, vec, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  out[0] = vec[0] * c + vec[2] * s;
  out[1] = vec[1];
  out[2] = -vec[0] * s + vec[2] * c;
  return out;
}

function createBoxVertices(bounds, color) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const faces = [
    { normal: [0, 1, 0], corners: [[minX, maxY, minZ], [maxX, maxY, minZ], [maxX, maxY, maxZ], [minX, maxY, maxZ]] },
    { normal: [0, -1, 0], corners: [[minX, minY, maxZ], [maxX, minY, maxZ], [maxX, minY, minZ], [minX, minY, minZ]] },
    { normal: [1, 0, 0], corners: [[maxX, minY, minZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [maxX, maxY, minZ]] },
    { normal: [-1, 0, 0], corners: [[minX, minY, maxZ], [minX, minY, minZ], [minX, maxY, minZ], [minX, maxY, maxZ]] },
    { normal: [0, 0, 1], corners: [[minX, maxY, maxZ], [maxX, maxY, maxZ], [maxX, minY, maxZ], [minX, minY, maxZ]] },
    { normal: [0, 0, -1], corners: [[minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ]] }
  ];

  const vertices = [];
  for (const face of faces) {
    pushFace(vertices, face.corners, face.normal, color);
  }

  return vertices;
}

function pushFace(target, corners, normal, color) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, d, normal, color);
  pushVertex(target, c, normal, color);
}

function pushVertex(target, position, normal, color) {
  target.push(
    position[0],
    position[1],
    position[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2],
    0
  );
}

function createDoorLeafGeometry(device, color) {
  const vertices = createBoxVertices(
    {
      minX: -0.5,
      maxX: 0.5,
      minY: 0,
      maxY: 1,
      minZ: -0.5,
      maxZ: 0.5
    },
    color
  );

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  return {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX
  };
}

function buildCollider(anchor) {
  const halfThickness = anchor.thickness * 0.5;
  if (anchor.orientation === 'x') {
    return {
      minX: anchor.wallPosition - halfThickness,
      maxX: anchor.wallPosition + halfThickness,
      minY: anchor.baseY,
      maxY: anchor.baseY + anchor.height,
      minZ: anchor.openingMin,
      maxZ: anchor.openingMax
    };
  }
  return {
    minX: anchor.openingMin,
    maxX: anchor.openingMax,
    minY: anchor.baseY,
    maxY: anchor.baseY + anchor.height,
    minZ: anchor.wallPosition - halfThickness,
    maxZ: anchor.wallPosition + halfThickness
  };
}

function createLeaves(anchor, geometry, leafWidth) {
  const leaves = [];
  const hingeA = anchor.openingMin;
  const hingeB = anchor.openingMax;
  const hingePositions = anchor.isDoubleDoor ? [hingeA, hingeB] : [hingeA];
  const forwardDirections = anchor.isDoubleDoor ? [1, -1] : [1];

  for (let i = 0; i < hingePositions.length; i += 1) {
    const hingeValue = hingePositions[i];
    const forwardDirection = forwardDirections[i];
    const hinge =
      anchor.orientation === 'x'
        ? new Float32Array([anchor.wallPosition, anchor.baseY, hingeValue])
        : new Float32Array([hingeValue, anchor.baseY, anchor.wallPosition]);

    leaves.push({
      hinge,
      forwardDirection,
      swingSign: anchor.normalSign * forwardDirection,
      modelMatrix: new Float32Array(16),
      vertexBuffer: geometry.vertexBuffer,
      vertexCount: geometry.vertexCount,
      leafWidth
    });
  }

  return leaves;
}

function updateLeafTransform(leaf, anchor, openAmount) {
  const angle = MAX_SWING_RADIANS * clamp01(openAmount) * leaf.swingSign;
  const up = [0, anchor.height, 0];
  const rightBase =
    anchor.orientation === 'x'
      ? [anchor.thickness, 0, 0]
      : [0, 0, anchor.thickness];
  const forwardBase =
    anchor.orientation === 'x'
      ? [0, 0, leaf.leafWidth]
      : [leaf.leafWidth, 0, 0];
  const offset =
    anchor.orientation === 'x'
      ? [0, anchor.height * 0.5, (leaf.leafWidth * 0.5) * leaf.forwardDirection]
      : [(leaf.leafWidth * 0.5) * leaf.forwardDirection, anchor.height * 0.5, 0];

  const rotatedRight = rotateY([0, 0, 0], rightBase, angle);
  const rotatedForward = rotateY([0, 0, 0], forwardBase, angle);
  const rotatedOffset = rotateY([0, 0, 0], offset, angle);

  const translation = [
    leaf.hinge[0] + rotatedOffset[0],
    leaf.hinge[1] + rotatedOffset[1],
    leaf.hinge[2] + rotatedOffset[2]
  ];

  mat4FromRotationTranslation(leaf.modelMatrix, rotatedRight, up, rotatedForward, translation);
}

export function createDoorManager(device) {
  if (!device) {
    throw new Error('GPUDevice is required to create the door manager.');
  }

  const doors = [];
  const geometryCache = new Map();

  const getGeometryForColor = (color = DEFAULT_DOOR_COLOR) => {
    const key = color.map((component) => component.toFixed(4)).join(',');
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = createDoorLeafGeometry(device, color);
      geometryCache.set(key, geometry);
    }
    return geometry;
  };

  function rebuildDoorFromAnchor(anchor, previous) {
    const geometry = getGeometryForColor(anchor.color ?? DEFAULT_DOOR_COLOR);
    const leafWidth = anchor.isDoubleDoor ? anchor.width * 0.5 : anchor.width;
    const leaves = createLeaves(anchor, geometry, leafWidth);
    const collider = buildCollider(anchor);
    const openAmount = clamp01(previous?.openAmount ?? 0);
    const state = previous?.state ?? 'closed';

    const door = {
      id: anchor.id,
      anchor,
      leaves,
      collider,
      interactionBounds: collider,
      center: anchor.center
        ? [anchor.center[0], anchor.center[1], anchor.center[2]]
        : [anchor.wallPosition, anchor.baseY + anchor.height * 0.5, anchor.wallPosition],
      openAmount,
      state: state === 'open' && openAmount <= 0.01 ? 'closed' : state,
      pendingOpen: previous?.pendingOpen ?? false,
      color: anchor.color ?? DEFAULT_DOOR_COLOR,
      leafWidth
    };

    updateDoorTransforms(door);
    return door;
  }

  function updateDoorTransforms(door) {
    if (!door || !Array.isArray(door.leaves)) {
      return;
    }
    for (const leaf of door.leaves) {
      if (!leaf) continue;
      updateLeafTransform(leaf, door.anchor, door.openAmount);
    }
  }

  function syncDoors(anchors = []) {
    const next = [];
    const existingMap = new Map(doors.map((door) => [door.id, door]));

    for (const anchor of anchors) {
      if (!anchor || !anchor.id) {
        continue;
      }
      const previous = existingMap.get(anchor.id);
      next.push(rebuildDoorFromAnchor(anchor, previous));
    }

    doors.length = 0;
    doors.push(...next);
  }

  function requestOpen(id) {
    const door = doors.find((entry) => entry.id === id);
    if (!door) {
      return false;
    }
    door.pendingOpen = true;
    if (door.state === 'closed' || door.state === 'closing') {
      door.state = 'opening';
    }
    return true;
  }

  function update(deltaTime, playerPosition) {
    const px = playerPosition?.[0] ?? 0;
    const py = playerPosition?.[1] ?? 0;
    const pz = playerPosition?.[2] ?? 0;
    const closeDistanceSq = 3.5;

    for (const door of doors) {
      if (!door || !door.center) {
        continue;
      }

      const dx = px - door.center[0];
      const dz = pz - door.center[2];
      const dy = py - door.center[1];
      const horizontalDistanceSq = dx * dx + dz * dz;
      const nearDoor = horizontalDistanceSq <= closeDistanceSq && Math.abs(dy) <= door.anchor.height * 0.75;

      if (door.state === 'opening') {
        door.openAmount = Math.min(1, door.openAmount + OPEN_SPEED * deltaTime);
        if (door.openAmount >= 0.999) {
          door.state = 'open';
        }
      } else if (door.state === 'closing') {
        door.openAmount = Math.max(0, door.openAmount - CLOSE_SPEED * deltaTime);
        if (door.openAmount <= 0.001) {
          door.state = 'closed';
          door.pendingOpen = false;
        }
      } else if (door.state === 'open') {
        if (!nearDoor) {
          door.state = 'closing';
        }
      } else if (door.pendingOpen && nearDoor) {
        door.state = 'opening';
      }

      updateDoorTransforms(door);
    }
  }

  function getActiveColliders() {
    const result = [];
    for (const door of doors) {
      if (!door || !door.collider) {
        continue;
      }
      if (door.openAmount >= COLLIDER_DISABLE_THRESHOLD) {
        continue;
      }
      result.push(door.collider);
    }
    return result;
  }

  function getRenderables() {
    const leaves = [];
    for (const door of doors) {
      if (!door || !Array.isArray(door.leaves)) {
        continue;
      }
      for (const leaf of door.leaves) {
        if (!leaf || !leaf.vertexBuffer) {
          continue;
        }
        leaves.push(leaf);
      }
    }
    return leaves;
  }

  function dispose() {
    for (const geometry of geometryCache.values()) {
      geometry.vertexBuffer?.destroy?.();
    }
    geometryCache.clear();
    doors.length = 0;
  }

  return {
    syncDoors,
    update,
    requestOpen,
    getDoors: () => doors,
    getActiveColliders,
    getRenderables,
    dispose
  };
}
