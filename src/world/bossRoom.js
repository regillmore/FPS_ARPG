import { VERTEX_STRIDE } from './procedural/constants.js';
import { addBox, addQuad } from './procedural/geometry.js';
import { WORLD_UP } from '../game/constants.js';

const DEFAULT_CENTER = [0, 0, 80];
const DEFAULT_ROOM_SIZE = 50;
const DEFAULT_ROOM_HEIGHT = 8;
const DEFAULT_FLOOR_THICKNESS = 0.6;
const DEFAULT_WALL_THICKNESS = 0.7;
const PORTAL_FRAME_COLOR = [0.72, 0.76, 0.9];
const PORTAL_ACCENT_COLOR = [0.8, 0.55, 0.95, 1.2];
const FLOOR_COLOR = [0.26, 0.26, 0.32];
const CEILING_COLOR = [0.22, 0.22, 0.26];
const WALL_COLOR = [0.18, 0.2, 0.28];
const ACCENT_COLOR = [0.32, 0.35, 0.48];

function createEmptyBounds() {
  return {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
}

function normalizeVector(source, fallback) {
  if (!source || typeof source !== 'object') {
    return new Float32Array(fallback);
  }
  const [x = fallback[0], y = fallback[1], z = fallback[2]] = source;
  const nx = Number(x);
  const ny = Number(y);
  const nz = Number(z);
  const vector = new Float32Array([
    Number.isFinite(nx) ? nx : fallback[0],
    Number.isFinite(ny) ? ny : fallback[1],
    Number.isFinite(nz) ? nz : fallback[2]
  ]);
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-5) {
    vector[0] = fallback[0];
    vector[1] = fallback[1];
    vector[2] = fallback[2];
    return vector;
  }
  vector[0] /= length;
  vector[1] /= length;
  vector[2] /= length;
  return vector;
}

function cross(a, b) {
  return new Float32Array([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ]);
}

function addPortalFrameGeometry(vertices, bounds, definition, options = {}) {
  if (!definition || !vertices) {
    return;
  }

  const color = options.color ?? PORTAL_FRAME_COLOR;
  const accentColor = options.accentColor ?? PORTAL_ACCENT_COLOR;
  const frameThickness = options.frameThickness ?? 0.15;
  const depth = options.depth ?? 0.4;
  const halfWidth = definition.width * 0.5;
  const halfHeight = definition.height * 0.5;
  const cx = definition.center[0];
  const cy = definition.center[1];
  const cz = definition.center[2];
  const minZ = cz - depth * 0.5;
  const maxZ = cz + depth * 0.5;

  const leftMinX = cx - halfWidth - frameThickness;
  const leftMaxX = cx - halfWidth;
  const rightMinX = cx + halfWidth;
  const rightMaxX = cx + halfWidth + frameThickness;
  const bottomMinY = cy - halfHeight - frameThickness * 0.5;
  const bottomMaxY = cy - halfHeight + frameThickness * 0.5;
  const topMinY = cy + halfHeight - frameThickness * 0.5;
  const topMaxY = cy + halfHeight + frameThickness * 0.5;

  addBox(vertices, leftMinX, cy - halfHeight, minZ, leftMaxX, cy + halfHeight, maxZ, color, bounds);
  addBox(vertices, rightMinX, cy - halfHeight, minZ, rightMaxX, cy + halfHeight, maxZ, color, bounds);
  addBox(vertices, cx - halfWidth, topMinY, minZ, cx + halfWidth, topMaxY, maxZ, color, bounds);
  addBox(vertices, cx - halfWidth, bottomMinY, minZ, cx + halfWidth, bottomMaxY, maxZ, color, bounds);

  const accentInset = frameThickness * 0.5;
  const accentMinX = cx - halfWidth + accentInset;
  const accentMaxX = cx + halfWidth - accentInset;
  const accentMinY = cy - halfHeight + accentInset;
  const accentMaxY = cy + halfHeight - accentInset;

  addQuad(
    vertices,
    [
      [accentMinX, accentMaxY, maxZ + 1e-4],
      [accentMaxX, accentMaxY, maxZ + 1e-4],
      [accentMaxX, accentMinY, maxZ + 1e-4],
      [accentMinX, accentMinY, maxZ + 1e-4]
    ],
    [0, 0, 1],
    accentColor,
    bounds
  );
}

function createPortalDefinition(definition) {
  if (!definition) {
    return null;
  }
  const id = definition.id ?? '';
  if (!id) {
    return null;
  }
  const width = Math.max(Number(definition.width) || 0, 1.2);
  const height = Math.max(Number(definition.height) || 0, 2.4);
  const center = new Float32Array([
    Number(definition.center?.[0]) || 0,
    Number(definition.center?.[1]) || 0,
    Number(definition.center?.[2]) || 0
  ]);
  const normal = normalizeVector(definition.normal ?? [0, 0, 1], [0, 0, 1]);
  const up = normalizeVector(definition.up ?? WORLD_UP, WORLD_UP);
  let right = definition.right ? normalizeVector(definition.right, [1, 0, 0]) : cross(up, normal);
  const rightLength = Math.hypot(right[0], right[1], right[2]);
  if (rightLength <= 1e-5) {
    right = new Float32Array([1, 0, 0]);
  } else {
    right[0] /= rightLength;
    right[1] /= rightLength;
    right[2] /= rightLength;
  }

  const exitOffset = Number(definition.exitOffset);
  const cooldown = Number(definition.cooldown);
  const triggerThreshold = Number(definition.triggerThreshold);

  return {
    id,
    linkedPortalId: definition.linkedPortalId ?? '',
    center,
    normal,
    up,
    right,
    width,
    height,
    halfWidth: width * 0.5,
    halfHeight: height * 0.5,
    exitOffset: Number.isFinite(exitOffset) ? exitOffset : 1.0,
    cooldown: Number.isFinite(cooldown) ? Math.max(0.05, cooldown) : 0.35,
    triggerThreshold: Number.isFinite(triggerThreshold) ? Math.max(0, triggerThreshold) : 0.05
  };
}

export function createBossRoom(device, options = {}) {
  const center = options.center ?? DEFAULT_CENTER;
  const size = Math.max(Number(options.size) || DEFAULT_ROOM_SIZE, 20);
  const halfSize = size * 0.5;
  const roomHeight = Math.max(Number(options.height) || DEFAULT_ROOM_HEIGHT, 4);
  const floorThickness = Math.max(Number(options.floorThickness) || DEFAULT_FLOOR_THICKNESS, 0.1);
  const wallThickness = Math.max(Number(options.wallThickness) || DEFAULT_WALL_THICKNESS, 0.2);
  const baseY = Number(options.baseY) || 0;
  const floorY = baseY;
  const ceilingY = baseY + roomHeight;

  const minX = center[0] - halfSize;
  const maxX = center[0] + halfSize;
  const minZ = center[2] - halfSize;
  const maxZ = center[2] + halfSize;

  const roomVertices = [];
  const roomBounds = createEmptyBounds();

  addBox(roomVertices, minX, floorY - floorThickness, minZ, maxX, floorY, maxZ, FLOOR_COLOR, roomBounds);
  addBox(roomVertices, minX, ceilingY, minZ, maxX, ceilingY + floorThickness * 0.5, maxZ, CEILING_COLOR, roomBounds);

  addBox(roomVertices, minX - wallThickness, floorY, minZ - wallThickness, minX, ceilingY, maxZ + wallThickness, WALL_COLOR, roomBounds);
  addBox(roomVertices, maxX, floorY, minZ - wallThickness, maxX + wallThickness, ceilingY, maxZ + wallThickness, WALL_COLOR, roomBounds);
  addBox(roomVertices, minX - wallThickness, floorY, minZ - wallThickness, maxX + wallThickness, ceilingY, minZ, WALL_COLOR, roomBounds);
  addBox(roomVertices, minX - wallThickness, floorY, maxZ, maxX + wallThickness, ceilingY, maxZ + wallThickness, WALL_COLOR, roomBounds);

  const accentHeight = Math.min(1.5, roomHeight * 0.25);
  addBox(roomVertices, minX + 4, floorY, minZ + 4, maxX - 4, floorY + accentHeight, maxZ - 4, ACCENT_COLOR, roomBounds);

  const roomVertexArray = new Float32Array(roomVertices);
  const roomVertexBuffer = device.createBuffer({
    size: roomVertexArray.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(roomVertexBuffer.getMappedRange()).set(roomVertexArray);
  roomVertexBuffer.unmap();

  const portalFrameVertices = [];
  const portalBounds = createEmptyBounds();

  const overworldPortal = createPortalDefinition({
    id: 'overworld-entry',
    center: options.portalNearStart ?? [2.5, 1.6, -4.5],
    normal: [0, 0, 1],
    width: 2.4,
    height: 3.2,
    exitOffset: 1.15,
    cooldown: 0.35,
    triggerThreshold: 0.05,
    linkedPortalId: 'boss-entry'
  });

  const bossPortal = createPortalDefinition({
    id: 'boss-entry',
    center: [center[0], floorY + 1.6, minZ + 2.0],
    normal: [0, 0, 1],
    width: 2.4,
    height: 3.2,
    exitOffset: 1.25,
    cooldown: 0.35,
    triggerThreshold: 0.05,
    linkedPortalId: 'overworld-entry'
  });

  const portals = [];
  if (overworldPortal) {
    portals.push(overworldPortal);
    addPortalFrameGeometry(portalFrameVertices, portalBounds, overworldPortal);
  }
  if (bossPortal) {
    portals.push(bossPortal);
    addPortalFrameGeometry(portalFrameVertices, portalBounds, bossPortal);
  }

  const portalVertexArray = portalFrameVertices.length > 0 ? new Float32Array(portalFrameVertices) : null;
  let portalGeometry = null;
  if (portalVertexArray) {
    const buffer = device.createBuffer({
      size: portalVertexArray.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true
    });
    new Float32Array(buffer.getMappedRange()).set(portalVertexArray);
    buffer.unmap();
    portalGeometry = {
      vertexBuffer: buffer,
      vertexCount: portalVertexArray.length / VERTEX_STRIDE
    };
  }

  const colliders = [
    { minX, maxX, minY: floorY - floorThickness, maxY: floorY, minZ, maxZ },
    { minX, maxX, minY: ceilingY, maxY: ceilingY + floorThickness * 0.5, minZ, maxZ },
    {
      minX: minX - wallThickness,
      maxX: maxX + wallThickness,
      minY: floorY,
      maxY: ceilingY,
      minZ: minZ - wallThickness,
      maxZ: minZ
    },
    {
      minX: minX - wallThickness,
      maxX: maxX + wallThickness,
      minY: floorY,
      maxY: ceilingY,
      minZ: maxZ,
      maxZ: maxZ + wallThickness
    },
    {
      minX: minX - wallThickness,
      maxX: minX,
      minY: floorY,
      maxY: ceilingY,
      minZ: minZ - wallThickness,
      maxZ: maxZ + wallThickness
    },
    {
      minX: maxX,
      maxX: maxX + wallThickness,
      minY: floorY,
      maxY: ceilingY,
      minZ: minZ - wallThickness,
      maxZ: maxZ + wallThickness
    }
  ];

  const lights = [
    {
      position: [minX + 4, floorY + roomHeight - 1.5, minZ + 4],
      color: [0.6, 0.6, 0.95, 1.4],
      layerIndex: 0
    },
    {
      position: [maxX - 4, floorY + roomHeight - 1.5, minZ + 4],
      color: [0.6, 0.6, 0.95, 1.4],
      layerIndex: 0
    },
    {
      position: [minX + 4, floorY + roomHeight - 1.5, maxZ - 4],
      color: [0.55, 0.6, 0.85, 1.3],
      layerIndex: 0
    },
    {
      position: [maxX - 4, floorY + roomHeight - 1.5, maxZ - 4],
      color: [0.55, 0.6, 0.85, 1.3],
      layerIndex: 0
    }
  ];

  return {
    geometry: {
      vertexBuffer: roomVertexBuffer,
      vertexCount: roomVertexArray.length / VERTEX_STRIDE
    },
    portalGeometry,
    colliders,
    bounds: roomBounds,
    portals,
    lights
  };
}
