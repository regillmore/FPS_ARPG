import { mat4FromRotationTranslation } from '../../math.js';

const FLOATS_PER_VERTEX = 9;
const UNIT_X = new Float32Array([1, 0, 0]);
const UNIT_Y = new Float32Array([0, 1, 0]);
const UNIT_Z = new Float32Array([0, 0, 1]);
const DEFAULT_POSITION = Object.freeze([0, 0, 0]);

const COLORS = Object.freeze({
  stand: [0.32, 0.32, 0.36],
  post: [0.38, 0.36, 0.32],
  body: [0.75, 0.22, 0.22],
  head: [0.92, 0.82, 0.7],
  targetOuter: [0.95, 0.95, 0.95],
  targetInner: [0.85, 0.15, 0.15],
  targetCenter: [0.98, 0.45, 0.2]
});

const LOCAL_BOUNDS = Object.freeze({
  minX: -0.5,
  maxX: 0.5,
  minY: 0,
  maxY: 2.45,
  minZ: -0.4,
  maxZ: 0.24
});

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
    color[2]
  );
}

function pushQuad(target, corners, normal, color) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, d, normal, color);
}

function addBox(target, min, max, color) {
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
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

  pushQuad(target, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], [0, 0, 1], color);
  pushQuad(target, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], [0, 0, -1], color);
  pushQuad(target, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], [-1, 0, 0], color);
  pushQuad(target, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], [1, 0, 0], color);
  pushQuad(target, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], [0, 1, 0], color);
  pushQuad(target, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], [0, -1, 0], color);
}

function createTargetDummyGeometry(device) {
  const vertices = [];

  // Base stand
  addBox(vertices, [-0.5, 0, -0.4], [0.5, 0.18, 0.4], COLORS.stand);

  // Support post
  addBox(vertices, [-0.1, 0.18, -0.1], [0.1, 1.2, 0.1], COLORS.post);

  // Torso
  addBox(vertices, [-0.45, 1.2, -0.15], [0.45, 2.0, 0.15], COLORS.body);

  // Head
  addBox(vertices, [-0.25, 2.0, -0.18], [0.25, 2.45, 0.18], COLORS.head);

  // Target face accents (front)
  addBox(vertices, [-0.32, 1.35, 0.15], [0.32, 1.85, 0.24], COLORS.targetOuter);
  addBox(vertices, [-0.18, 1.5, 0.24], [0.18, 1.75, 0.32], COLORS.targetInner);
  addBox(vertices, [-0.08, 1.58, 0.32], [0.08, 1.68, 0.36], COLORS.targetCenter);

  // Target face accents (back)
  addBox(vertices, [-0.32, 1.35, -0.24], [0.32, 1.85, -0.15], COLORS.targetOuter);
  addBox(vertices, [-0.18, 1.5, -0.32], [0.18, 1.75, -0.24], COLORS.targetInner);
  addBox(vertices, [-0.08, 1.58, -0.36], [0.08, 1.68, -0.32], COLORS.targetCenter);

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
    vertexCount: vertexData.length / FLOATS_PER_VERTEX,
    localBounds: LOCAL_BOUNDS
  };
}

function resolvePosition(options = {}) {
  const base = Array.isArray(options.position) ? options.position : DEFAULT_POSITION;
  const baseX = Number.isFinite(base[0]) ? base[0] : DEFAULT_POSITION[0];
  const baseY = Number.isFinite(base[1]) ? base[1] : DEFAULT_POSITION[1];
  const baseZ = Number.isFinite(base[2]) ? base[2] : DEFAULT_POSITION[2];

  const resolvedX = Number.isFinite(options.x) ? options.x : baseX;
  const resolvedY = Number.isFinite(options.y) ? options.y : baseY;
  const resolvedZ = Number.isFinite(options.z) ? options.z : baseZ;

  return new Float32Array([resolvedX, resolvedY, resolvedZ]);
}

function translateBounds(bounds, translation) {
  if (!bounds) {
    return null;
  }
  return {
    minX: bounds.minX + translation[0],
    maxX: bounds.maxX + translation[0],
    minY: bounds.minY + translation[1],
    maxY: bounds.maxY + translation[1],
    minZ: bounds.minZ + translation[2],
    maxZ: bounds.maxZ + translation[2]
  };
}

export function createTargetDummy(device, options = {}) {
  if (!device) {
    throw new Error('A GPUDevice is required to create a target dummy.');
  }

  const geometry = createTargetDummyGeometry(device);
  const translation = resolvePosition(options);
  const modelMatrix = new Float32Array(16);
  mat4FromRotationTranslation(modelMatrix, UNIT_X, UNIT_Y, UNIT_Z, translation);

  return {
    type: 'target-dummy',
    modelMatrix,
    vertexBuffer: geometry.vertexBuffer,
    vertexCount: geometry.vertexCount,
    position: translation,
    bounds: translateBounds(geometry.localBounds, translation),
    update() {},
    destroy() {
      geometry.vertexBuffer.destroy?.();
    }
  };
}
