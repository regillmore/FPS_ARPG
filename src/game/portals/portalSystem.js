import {
  mat4FromRotationTranslation,
  mat4InvertRigidBody,
  mat4LookAt,
  mat4Multiply
} from '../../math.js';
import { createPortalPipeline } from '../../webgpu/portalPipeline.js';
import { WORLD_UP } from '../constants.js';

const ROTATE_180_Y = new Float32Array([
  -1, 0, 0, 0,
   0, 1, 0, 0,
   0, 0, -1, 0,
   0, 0, 0, 1
]);

const QUAD_VERTICES = new Float32Array([
  -0.5, -0.5, 0, 0, 1,
   0.5, -0.5, 0, 1, 1,
   0.5,  0.5, 0, 1, 0,
  -0.5, -0.5, 0, 0, 1,
   0.5,  0.5, 0, 1, 0,
  -0.5,  0.5, 0, 0, 0
]);

function normalizeVector(out, a) {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  const len = Math.hypot(x, y, z);
  if (len > 1e-5) {
    out[0] = x / len;
    out[1] = y / len;
    out[2] = z / len;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  }
  return out;
}

function cross(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function transformPoint(out, matrix, point) {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  out[0] = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
  out[1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
  out[2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
  return out;
}

function transformDirection(out, matrix, vector) {
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  out[0] = matrix[0] * x + matrix[4] * y + matrix[8] * z;
  out[1] = matrix[1] * x + matrix[5] * y + matrix[9] * z;
  out[2] = matrix[2] * x + matrix[6] * y + matrix[10] * z;
  return out;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createPortal(device, pipeline, sampler, options = {}) {
  const width = Math.max(0.5, Number(options.width) || 1.5);
  const height = Math.max(0.5, Number(options.height) || 2.5);
  const position = new Float32Array(3);
  position[0] = Number(options.position?.[0]) || 0;
  position[1] = Number(options.position?.[1]) || 0;
  position[2] = Number(options.position?.[2]) || 0;
  const forward = new Float32Array(3);
  forward[0] = Number(options.normal?.[0]) || 0;
  forward[1] = Number(options.normal?.[1]) || 0;
  forward[2] = Number(options.normal?.[2]) || 1;
  normalizeVector(forward, forward);
  const upHint = new Float32Array(3);
  upHint[0] = Number(options.up?.[0]) || WORLD_UP[0];
  upHint[1] = Number(options.up?.[1]) || WORLD_UP[1];
  upHint[2] = Number(options.up?.[2]) || WORLD_UP[2];
  normalizeVector(upHint, upHint);
  const right = new Float32Array(3);
  cross(right, upHint, forward);
  if (Math.hypot(right[0], right[1], right[2]) < 1e-4) {
    right[0] = 1;
    right[1] = 0;
    right[2] = 0;
  }
  normalizeVector(right, right);
  const up = new Float32Array(3);
  cross(up, forward, right);
  normalizeVector(up, up);

  const scaledRight = new Float32Array([right[0] * width, right[1] * width, right[2] * width]);
  const scaledUp = new Float32Array([up[0] * height, up[1] * height, up[2] * height]);
  const renderMatrix = new Float32Array(16);
  mat4FromRotationTranslation(renderMatrix, scaledRight, scaledUp, forward, position);
  const basisMatrix = new Float32Array(16);
  mat4FromRotationTranslation(basisMatrix, right, up, forward, position);
  const inverse = new Float32Array(16);
  mat4InvertRigidBody(inverse, basisMatrix);

  const textureSize = Math.max(128, Math.min(2048, Math.floor(options.textureSize || 512)));
  const renderTexture = device.createTexture({
    size: { width: textureSize, height: textureSize },
    format: options.colorFormat,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
  });
  const renderTextureView = renderTexture.createView();
  const depthTexture = device.createTexture({
    size: { width: textureSize, height: textureSize },
    format: options.depthFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT
  });
  const depthTextureView = depthTexture.createView();
  const textureBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(1),
    entries: [
      { binding: 0, resource: sampler },
      { binding: 1, resource: renderTextureView }
    ]
  });

  return {
    position,
    forward,
    up,
    right,
    width,
    height,
    transformMatrix: basisMatrix,
    inverse,
    modelMatrix: renderMatrix,
    textureSize,
    renderTexture,
    renderTextureView,
    depthTexture,
    depthTextureView,
    textureBindGroup,
    linkedPortal: null,
    worldToLinked: new Float32Array(16)
  };
}

function updatePortalLinkTransform(portal, tempMatrix) {
  if (!portal || !portal.linkedPortal) {
    return;
  }
  const linked = portal.linkedPortal;
  mat4Multiply(tempMatrix, linked.transformMatrix, ROTATE_180_Y);
  mat4Multiply(portal.worldToLinked, tempMatrix, portal.inverse);
}

function computeCameraBasis(controller) {
  const forward = new Float32Array(3);
  const up = new Float32Array(3);
  const right = new Float32Array(3);
  const cosPitch = Math.cos(controller.pitch);
  const sinPitch = Math.sin(controller.pitch);
  const cosYaw = Math.cos(controller.yaw);
  const sinYaw = Math.sin(controller.yaw);
  forward[0] = sinYaw * cosPitch;
  forward[1] = sinPitch;
  forward[2] = cosYaw * cosPitch;
  right[0] = WORLD_UP[1] * forward[2] - WORLD_UP[2] * forward[1];
  right[1] = WORLD_UP[2] * forward[0] - WORLD_UP[0] * forward[2];
  right[2] = WORLD_UP[0] * forward[1] - WORLD_UP[1] * forward[0];
  normalizeVector(right, right);
  cross(up, forward, right);
  normalizeVector(up, up);
  return { forward, up };
}

export function createPortalSystem(device, options = {}) {
  const colorFormat = options.colorFormat || 'bgra8unorm';
  const depthFormat = options.depthFormat || 'depth24plus';
  const pipeline = createPortalPipeline(device, colorFormat, depthFormat);
  const sampler = device.createSampler({
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear'
  });
  const quadVertexBuffer = device.createBuffer({
    size: QUAD_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
  });
  device.queue.writeBuffer(quadVertexBuffer, 0, QUAD_VERTICES);
  const portalUniformBuffer = device.createBuffer({
    size: 32 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
  });
  const portalUniformData = new Float32Array(32);
  const portalUniformBindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: portalUniformBuffer } }]
  });
  const portals = [];
  const tempMatrix = new Float32Array(16);
  const scratchVecA = new Float32Array(3);
  const scratchVecB = new Float32Array(3);
  const scratchVecC = new Float32Array(3);
  const scratchVecD = new Float32Array(3);
  const scratchView = new Float32Array(16);
  const scratchViewProj = new Float32Array(16);

  function addPortalPair(portalAOptions, portalBOptions) {
    const portalA = createPortal(device, pipeline, sampler, {
      ...portalAOptions,
      colorFormat,
      depthFormat
    });
    const portalB = createPortal(device, pipeline, sampler, {
      ...portalBOptions,
      colorFormat,
      depthFormat
    });
    portalA.linkedPortal = portalB;
    portalB.linkedPortal = portalA;
    updatePortalLinkTransform(portalA, tempMatrix);
    updatePortalLinkTransform(portalB, tempMatrix);
    portals.push(portalA, portalB);
    return [portalA, portalB];
  }

  function updatePlayerTeleportation(controller, previousPosition) {
    if (!controller || portals.length === 0 || !previousPosition) {
      return false;
    }
    const currentPosition = controller.position;
    for (let i = 0; i < portals.length; i += 1) {
      const portal = portals[i];
      if (!portal || !portal.linkedPortal) {
        continue;
      }
      const prevOffset = scratchVecA;
      prevOffset[0] = previousPosition[0] - portal.position[0];
      prevOffset[1] = previousPosition[1] - portal.position[1];
      prevOffset[2] = previousPosition[2] - portal.position[2];
      const currOffset = scratchVecB;
      currOffset[0] = currentPosition[0] - portal.position[0];
      currOffset[1] = currentPosition[1] - portal.position[1];
      currOffset[2] = currentPosition[2] - portal.position[2];
      const prevDistance = dot(prevOffset, portal.forward);
      const currDistance = dot(currOffset, portal.forward);
      if (!(prevDistance > 0 && currDistance <= 0)) {
        continue;
      }
      transformPoint(scratchVecC, portal.inverse, currentPosition);
      if (Math.abs(scratchVecC[0]) > 0.5 || Math.abs(scratchVecC[1]) > 0.5) {
        continue;
      }
      transformPoint(currentPosition, portal.worldToLinked, currentPosition);
      const exitOffset = 0.1;
      currentPosition[0] += portal.linkedPortal.forward[0] * exitOffset;
      currentPosition[1] += portal.linkedPortal.forward[1] * exitOffset;
      currentPosition[2] += portal.linkedPortal.forward[2] * exitOffset;
      const { forward } = computeCameraBasis(controller);
      transformDirection(scratchVecD, portal.worldToLinked, forward);
      normalizeVector(scratchVecD, scratchVecD);
      controller.yaw = Math.atan2(scratchVecD[0], scratchVecD[2]);
      controller.pitch = Math.asin(clamp(scratchVecD[1], -1, 1));
      return true;
    }
    return false;
  }

  function renderPortalViews(params) {
    if (!params || portals.length === 0) {
      return;
    }
    const { encoder, projectionMatrix, cameraPosition, cameraForward, cameraUp, renderScene } = params;
    if (!encoder || typeof renderScene !== 'function') {
      return;
    }
    for (let i = 0; i < portals.length; i += 1) {
      const portal = portals[i];
      if (!portal || !portal.linkedPortal) {
        continue;
      }
      transformPoint(scratchVecA, portal.worldToLinked, cameraPosition);
      transformDirection(scratchVecB, portal.worldToLinked, cameraForward);
      transformDirection(scratchVecC, portal.worldToLinked, cameraUp);
      normalizeVector(scratchVecB, scratchVecB);
      normalizeVector(scratchVecC, scratchVecC);
      scratchVecD[0] = scratchVecA[0] + scratchVecB[0];
      scratchVecD[1] = scratchVecA[1] + scratchVecB[1];
      scratchVecD[2] = scratchVecA[2] + scratchVecB[2];
      mat4LookAt(scratchView, scratchVecA, scratchVecD, scratchVecC);
      mat4Multiply(scratchViewProj, projectionMatrix, scratchView);
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: portal.renderTextureView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ],
        depthStencilAttachment: {
          view: portal.depthTextureView,
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store'
        }
      });
      renderScene({
        passEncoder: pass,
        viewProjection: scratchViewProj,
        cameraPosition: scratchVecA,
        drawPortals: false
      });
      pass.end();
    }
  }

  function drawPortals(passEncoder, viewProjection) {
    if (!passEncoder || portals.length === 0) {
      return;
    }
    passEncoder.setPipeline(pipeline);
    passEncoder.setVertexBuffer(0, quadVertexBuffer);
    passEncoder.setBindGroup(0, portalUniformBindGroup);
    for (let i = 0; i < portals.length; i += 1) {
      const portal = portals[i];
      if (!portal || !portal.textureBindGroup) {
        continue;
      }
      portalUniformData.set(viewProjection, 0);
      portalUniformData.set(portal.modelMatrix, 16);
      device.queue.writeBuffer(portalUniformBuffer, 0, portalUniformData);
      passEncoder.setBindGroup(1, portal.textureBindGroup);
      passEncoder.draw(6, 1, 0, 0);
    }
  }

  function hasPortals() {
    return portals.length > 0;
  }

  return {
    addPortalPair,
    updatePlayerTeleportation,
    renderPortalViews,
    drawPortals,
    hasPortals
  };
}
