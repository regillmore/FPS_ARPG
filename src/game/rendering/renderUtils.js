import { AMBIENT_LIGHT, MAX_LIGHTS, UNIFORM_BYTE_LENGTH, UNIFORM_FLOAT_COUNT } from '../constants.js';

export function createEntityUniformManager(device, uniformBindGroupLayout) {
  if (!device || !uniformBindGroupLayout) {
    throw new Error('createEntityUniformManager requires a GPU device and bind group layout.');
  }

  return function ensureRenderableUniformResources(entity) {
    if (!entity || entity.uniformBuffer) {
      return;
    }

    const uniformBuffer = device.createBuffer({
      size: UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const uniformBindGroup = device.createBindGroup({
      layout: uniformBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer
          }
        }
      ]
    });

    const uniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
    const originalDestroy = typeof entity.destroy === 'function' ? entity.destroy.bind(entity) : null;

    entity.uniformBuffer = uniformBuffer;
    entity.uniformBindGroup = uniformBindGroup;
    entity.uniformData = uniformData;
    entity.destroy = () => {
      uniformBuffer.destroy?.();
      entity.uniformBuffer = null;
      entity.uniformBindGroup = null;
      entity.uniformData = null;
      if (originalDestroy) {
        originalDestroy();
      }
    };
  };
}

export function createLightGatherer(roomSystem, { maxLights = MAX_LIGHTS, disableLightsRef = () => false } = {}) {
  const selectionScratch = [];

  return function gatherActiveLights(position, target) {
    selectionScratch.length = 0;
    target.length = 0;

    if (disableLightsRef()) {
      return target;
    }

    const px = position?.[0] ?? 0;
    const py = position?.[1] ?? 0;
    const pz = position?.[2] ?? 0;

    const considerLight = (light) => {
      if (!light || !light.position || !light.color) {
        return;
      }
      const lp = light.position;
      const dx = lp[0] - px;
      const dy = lp[1] - py;
      const dz = lp[2] - pz;
      const distanceSq = dx * dx + dy * dy + dz * dz;

      let insertIndex = target.length;
      for (let i = 0; i < target.length; i += 1) {
        if (distanceSq < selectionScratch[i]) {
          insertIndex = i;
          break;
        }
      }

      if (insertIndex < maxLights) {
        selectionScratch.splice(insertIndex, 0, distanceSq);
        target.splice(insertIndex, 0, light);
        if (target.length > maxLights) {
          target.length = maxLights;
          selectionScratch.length = maxLights;
        }
      } else if (target.length < maxLights) {
        selectionScratch.push(distanceSq);
        target.push(light);
      }
    };

    const decorativeLights = roomSystem?.getDecorativeLights?.();
    if (decorativeLights) {
      for (let i = 0; i < decorativeLights.length; i += 1) {
        considerLight(decorativeLights[i]);
      }
    }

    return target;
  };
}

export function writeUniformData(target, viewProjection, modelMatrix, lights) {
  target.set(viewProjection, 0);
  target.set(modelMatrix, 16);
  target[32] = AMBIENT_LIGHT[0];
  target[33] = AMBIENT_LIGHT[1];
  target[34] = AMBIENT_LIGHT[2];
  const lightCount = Math.min(Array.isArray(lights) ? lights.length : 0, MAX_LIGHTS);
  target[35] = lightCount;
  for (let i = 0; i < MAX_LIGHTS; i += 1) {
    const base = 36 + i * 12;
    const light = i < lightCount ? lights[i] : null;
    if (light) {
      target[base + 0] = light.position[0];
      target[base + 1] = light.position[1];
      target[base + 2] = light.position[2];
      target[base + 3] = light.position[3] ?? 1.0;
      target[base + 4] = light.color[0];
      target[base + 5] = light.color[1];
      target[base + 6] = light.color[2];
      target[base + 7] = light.color[3] ?? 1.0;
      const direction = light.direction;
      target[base + 8] = direction ? direction[0] : 0;
      target[base + 9] = direction ? direction[1] : 0;
      target[base + 10] = direction ? direction[2] : 0;
      target[base + 11] = direction ? direction[3] ?? 0 : 0;
    } else {
      target.fill(0, base, base + 12);
    }
  }
}
