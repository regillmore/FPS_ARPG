const DEFAULT_MAX_BULLET_HOLES = 128;
const DEFAULT_BULLET_HOLE_SIZE = 0.24;
const DEFAULT_BULLET_HOLE_LIFETIME = 10.0;
const DEFAULT_BULLET_HOLE_COLOR = Object.freeze([0.08, 0.08, 0.08]);
const FLOATS_PER_VERTEX = 10;
const VERTICES_PER_DECAL = 6;
const FLOATS_PER_DECAL = FLOATS_PER_VERTEX * VERTICES_PER_DECAL;
const SURFACE_BIAS = 0.0025;
const VECTOR_EPSILON = 1e-5;

function transformPoint(matrix, point) {
  const x = point[0];
  const y = point[1];
  const z = point[2];

  return new Float32Array([
    matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  ]);
}

function transformDirection(matrix, direction) {
  const x = direction[0];
  const y = direction[1];
  const z = direction[2];

  const result = new Float32Array([
    matrix[0] * x + matrix[4] * y + matrix[8] * z,
    matrix[1] * x + matrix[5] * y + matrix[9] * z,
    matrix[2] * x + matrix[6] * y + matrix[10] * z
  ]);

  const length = Math.hypot(result[0], result[1], result[2]);
  if (length <= VECTOR_EPSILON) {
    return result;
  }

  result[0] /= length;
  result[1] /= length;
  result[2] /= length;
  return result;
}

function inverseTransformPoint(matrix, point) {
  const dx = point[0] - matrix[12];
  const dy = point[1] - matrix[13];
  const dz = point[2] - matrix[14];

  return new Float32Array([
    matrix[0] * dx + matrix[1] * dy + matrix[2] * dz,
    matrix[4] * dx + matrix[5] * dy + matrix[6] * dz,
    matrix[8] * dx + matrix[9] * dy + matrix[10] * dz
  ]);
}

function inverseTransformDirection(matrix, direction) {
  const x = direction[0];
  const y = direction[1];
  const z = direction[2];

  return normalizeVector(
    new Float32Array([
      matrix[0] * x + matrix[1] * y + matrix[2] * z,
      matrix[4] * x + matrix[5] * y + matrix[6] * z,
      matrix[8] * x + matrix[9] * y + matrix[10] * z
    ]),
    direction
  );
}

function clampMaxDecals(value) {
  const maxValue = Number(value);
  if (!Number.isFinite(maxValue) || maxValue < 1) {
    return DEFAULT_MAX_BULLET_HOLES;
  }
  return Math.min(Math.floor(maxValue), DEFAULT_MAX_BULLET_HOLES * 8);
}

function toVector3(input, fallback) {
  if (!input || typeof input !== 'object') {
    return new Float32Array(fallback);
  }
  const [x = fallback[0], y = fallback[1], z = fallback[2]] = input;
  const nx = Number(x);
  const ny = Number(y);
  const nz = Number(z);
  return new Float32Array([
    Number.isFinite(nx) ? nx : fallback[0],
    Number.isFinite(ny) ? ny : fallback[1],
    Number.isFinite(nz) ? nz : fallback[2]
  ]);
}

function normalizeVector(vector, fallback) {
  const result = toVector3(vector, fallback);
  const length = Math.hypot(result[0], result[1], result[2]);
  if (length <= VECTOR_EPSILON) {
    result[0] = fallback[0];
    result[1] = fallback[1];
    result[2] = fallback[2];
    return result;
  }
  result[0] /= length;
  result[1] /= length;
  result[2] /= length;
  return result;
}

function normalizeColor(color) {
  if (!color || typeof color !== 'object') {
    return new Float32Array(DEFAULT_BULLET_HOLE_COLOR);
  }
  const [r = DEFAULT_BULLET_HOLE_COLOR[0], g = DEFAULT_BULLET_HOLE_COLOR[1], b = DEFAULT_BULLET_HOLE_COLOR[2]] = color;
  const nr = Number(r);
  const ng = Number(g);
  const nb = Number(b);
  return new Float32Array([
    Number.isFinite(nr) ? nr : DEFAULT_BULLET_HOLE_COLOR[0],
    Number.isFinite(ng) ? ng : DEFAULT_BULLET_HOLE_COLOR[1],
    Number.isFinite(nb) ? nb : DEFAULT_BULLET_HOLE_COLOR[2]
  ]);
}

function cross(out, a, b) {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
  return out;
}

function writeVertex(target, offset, position, normal, color) {
  target[offset++] = position[0];
  target[offset++] = position[1];
  target[offset++] = position[2];
  target[offset++] = normal[0];
  target[offset++] = normal[1];
  target[offset++] = normal[2];
  target[offset++] = color[0];
  target[offset++] = color[1];
  target[offset++] = color[2];
  target[offset++] = 0;
  return offset;
}

function writeQuad(target, offset, corners, normal, color) {
  const [a, b, c, d] = corners;
  offset = writeVertex(target, offset, a, normal, color);
  offset = writeVertex(target, offset, b, normal, color);
  offset = writeVertex(target, offset, c, normal, color);
  offset = writeVertex(target, offset, a, normal, color);
  offset = writeVertex(target, offset, c, normal, color);
  offset = writeVertex(target, offset, d, normal, color);
  return offset;
}

export function createBulletHoleManager(device, options = {}) {
  const maxDecals = clampMaxDecals(options.maxDecals ?? DEFAULT_MAX_BULLET_HOLES);
  const bulletHoles = [];
  const vertexData = new Float32Array(maxDecals * FLOATS_PER_DECAL);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  let vertexCount = 0;
  let vertexDataDirty = false;

  function markDirty() {
    vertexDataDirty = true;
  }

  function computeOrthonormalBasis(normal) {
    const fallbackA = Math.abs(normal[1]) < 0.999 ? new Float32Array([0, 1, 0]) : new Float32Array([1, 0, 0]);
    const fallbackB = Math.abs(normal[0]) < 0.999 ? new Float32Array([1, 0, 0]) : new Float32Array([0, 0, 1]);
    const tangent = new Float32Array(3);
    cross(tangent, fallbackA, normal);
    let length = Math.hypot(tangent[0], tangent[1], tangent[2]);
    if (length <= VECTOR_EPSILON) {
      cross(tangent, fallbackB, normal);
      length = Math.hypot(tangent[0], tangent[1], tangent[2]);
    }
    if (length <= VECTOR_EPSILON) {
      tangent[0] = 1;
      tangent[1] = 0;
      tangent[2] = 0;
    } else {
      tangent[0] /= length;
      tangent[1] /= length;
      tangent[2] /= length;
    }

    const bitangent = new Float32Array(3);
    cross(bitangent, normal, tangent);
    length = Math.hypot(bitangent[0], bitangent[1], bitangent[2]);
    if (length <= VECTOR_EPSILON) {
      bitangent[0] = 0;
      bitangent[1] = 0;
      bitangent[2] = 1;
    } else {
      bitangent[0] /= length;
      bitangent[1] /= length;
      bitangent[2] /= length;
    }

    return { tangent, bitangent };
  }

  function spawnBulletHole({ position, normal, size, lifetime, color, attachment } = {}) {
    const basePosition = toVector3(position, [0, 0, 0]);
    const normalizedNormal = normalizeVector(normal, [0, 0, 1]);

    const resolvedSize = (() => {
      const numericSize = Number(size);
      if (Number.isFinite(numericSize) && numericSize > 0) {
        return numericSize;
      }
      return DEFAULT_BULLET_HOLE_SIZE;
    })();

    const resolvedLifetime = (() => {
      const numericLifetime = Number(lifetime);
      if (Number.isFinite(numericLifetime) && numericLifetime > 0) {
        return numericLifetime;
      }
      return DEFAULT_BULLET_HOLE_LIFETIME;
    })();

    const resolvedColor = normalizeColor(color);

    const { tangent, bitangent } = computeOrthonormalBasis(normalizedNormal);
    const rotation = Math.random() * Math.PI * 2;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);

    const rotatedTangent = new Float32Array(3);
    const rotatedBitangent = new Float32Array(3);
    rotatedTangent[0] = tangent[0] * cosR + bitangent[0] * sinR;
    rotatedTangent[1] = tangent[1] * cosR + bitangent[1] * sinR;
    rotatedTangent[2] = tangent[2] * cosR + bitangent[2] * sinR;
    rotatedBitangent[0] = bitangent[0] * cosR - tangent[0] * sinR;
    rotatedBitangent[1] = bitangent[1] * cosR - tangent[1] * sinR;
    rotatedBitangent[2] = bitangent[2] * cosR - tangent[2] * sinR;

    const attachmentData = (() => {
      const leaf = attachment?.leaf;
      const modelMatrix = leaf?.modelMatrix;
      if (!modelMatrix) {
        return null;
      }

      return {
        leaf,
        localPosition: inverseTransformPoint(modelMatrix, basePosition),
        localNormal: inverseTransformDirection(modelMatrix, normalizedNormal),
        localTangent: inverseTransformDirection(modelMatrix, rotatedTangent),
        localBitangent: inverseTransformDirection(modelMatrix, rotatedBitangent)
      };
    })();

    if (bulletHoles.length >= maxDecals) {
      bulletHoles.shift();
    }

    bulletHoles.push({
      position: basePosition,
      normal: normalizedNormal,
      tangent: rotatedTangent,
      bitangent: rotatedBitangent,
      size: resolvedSize,
      lifetime: resolvedLifetime,
      age: 0,
      color: resolvedColor,
      surfaceBias: SURFACE_BIAS,
      attachment: attachmentData
    });

    markDirty();
  }

  function update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    let changed = false;
    for (let index = bulletHoles.length - 1; index >= 0; index -= 1) {
      const bulletHole = bulletHoles[index];
      bulletHole.age += deltaTime;
      if (bulletHole.age >= bulletHole.lifetime) {
        bulletHoles.splice(index, 1);
        changed = true;
      }
    }

    if (!changed) {
      for (const bulletHole of bulletHoles) {
        if (bulletHole?.attachment) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      markDirty();
    }
  }

  function rebuildVertexData() {
    if (!vertexDataDirty) {
      return false;
    }

    let offset = 0;
    for (let i = 0; i < bulletHoles.length; i += 1) {
      const bulletHole = bulletHoles[i];
      const half = bulletHole.size / 2;
      let tangent = bulletHole.tangent;
      let bitangent = bulletHole.bitangent;
      let normal = bulletHole.normal;
      let center = bulletHole.position;
      const bias = bulletHole.surfaceBias;

      const attachment = bulletHole.attachment;
      const modelMatrix = attachment?.leaf?.modelMatrix;
      if (attachment && modelMatrix) {
        tangent = transformDirection(modelMatrix, attachment.localTangent);
        bitangent = transformDirection(modelMatrix, attachment.localBitangent);
        normal = transformDirection(modelMatrix, attachment.localNormal);
        center = transformPoint(modelMatrix, attachment.localPosition);
      }

      const corners = [
        [
          center[0] - tangent[0] * half - bitangent[0] * half + normal[0] * bias,
          center[1] - tangent[1] * half - bitangent[1] * half + normal[1] * bias,
          center[2] - tangent[2] * half - bitangent[2] * half + normal[2] * bias
        ],
        [
          center[0] + tangent[0] * half - bitangent[0] * half + normal[0] * bias,
          center[1] + tangent[1] * half - bitangent[1] * half + normal[1] * bias,
          center[2] + tangent[2] * half - bitangent[2] * half + normal[2] * bias
        ],
        [
          center[0] + tangent[0] * half + bitangent[0] * half + normal[0] * bias,
          center[1] + tangent[1] * half + bitangent[1] * half + normal[1] * bias,
          center[2] + tangent[2] * half + bitangent[2] * half + normal[2] * bias
        ],
        [
          center[0] - tangent[0] * half + bitangent[0] * half + normal[0] * bias,
          center[1] - tangent[1] * half + bitangent[1] * half + normal[1] * bias,
          center[2] - tangent[2] * half + bitangent[2] * half + normal[2] * bias
        ]
      ];

      offset = writeQuad(vertexData, offset, corners, normal, bulletHole.color);
    }

    vertexCount = offset / FLOATS_PER_VERTEX;
    vertexDataDirty = false;
    return true;
  }

  function syncGPU() {
    const rebuilt = rebuildVertexData();
    if (!rebuilt) {
      return;
    }
    if (vertexCount === 0) {
      return;
    }

    const floatsToWrite = vertexCount * FLOATS_PER_VERTEX;
    device.queue.writeBuffer(vertexBuffer, 0, vertexData.subarray(0, floatsToWrite));
  }

  function clear() {
    if (bulletHoles.length === 0) {
      return;
    }
    bulletHoles.length = 0;
    vertexCount = 0;
    markDirty();
  }

  function getVertexCount() {
    return vertexCount;
  }

  function getVertexBuffer() {
    return vertexBuffer;
  }

  return {
    spawnBulletHole,
    update,
    syncGPU,
    clear,
    getVertexCount,
    getVertexBuffer
  };
}
