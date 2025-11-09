import { mat4FromRotationTranslation, mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';
import { FirstPersonController } from './fpsController.js';
import { initWebGPU } from './webgpu/initWebGPU.js';
import { createBasicPipeline } from './webgpu/pipeline.js';
import { createRoomGeometry } from './world/roomGeometry.js';
import { setupPauseMenu } from './ui/pauseMenu.js';
import { getWeapon } from './game/playerWeapons.js';

const DEFAULT_WEAPON_OFFSET = {
  forward: 0.6,
  right: 0.22,
  up: -0.22
};

const DEFAULT_WEAPON_ROLL = 0.28;
const WORLD_UP = [0, 1, 0];

async function main() {
  const canvas = document.getElementById('gfx');
  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  const itemPopover = document.getElementById('item-detail-popover');

  if (!canvas) {
    throw new Error('Failed to find the rendering canvas.');
  }

  const pauseControls = setupPauseMenu({ canvas, overlay, pauseMenu, itemPopover });

  try {
    const { device, context, format, resize } = await initWebGPU(canvas);
    const pipeline = createBasicPipeline(device, format);
    const { vertexBuffer, vertexCount, bounds } = createRoomGeometry(device);
    const defaultWeapon = getWeapon('pea-shooter');
    const weaponGeometry = defaultWeapon ? defaultWeapon.createGeometry(device) : null;
    if (!weaponGeometry) {
      console.warn('Failed to create geometry for the default Pea Shooter weapon.');
    }

    const worldUniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const worldUniformBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: worldUniformBuffer
          }
        }
      ]
    });

    const weaponUniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const weaponUniformBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: weaponUniformBuffer
          }
        }
      ]
    });

    const projection = new Float32Array(16);
    const view = new Float32Array(16);
    const viewProj = new Float32Array(16);
    const weaponModel = new Float32Array(16);
    const weaponViewModel = new Float32Array(16);
    const weaponViewProj = new Float32Array(16);
    const weaponForward = new Float32Array(3);
    const weaponRight = new Float32Array(3);
    const weaponUp = new Float32Array(3);
    const weaponTranslation = new Float32Array(3);

    const controller = new FirstPersonController(canvas);
    pauseControls.setController(controller);

    let lastTime = performance.now();

    function frame(now) {
      const deltaTime = Math.min((now - lastTime) / 1000, 0.2);
      lastTime = now;

      if (!pauseControls.isPaused()) {
        controller.update(deltaTime);
      }

      const padding = 0.25;
      controller.position[0] = Math.min(
        Math.max(controller.position[0], bounds.minX + padding),
        bounds.maxX - padding
      );
      controller.position[1] = Math.min(
        Math.max(controller.position[1], bounds.minY + padding),
        bounds.maxY - padding
      );
      controller.position[2] = Math.min(
        Math.max(controller.position[2], bounds.minZ + padding),
        bounds.maxZ - padding
      );

      resize();

      const aspect = canvas.width / canvas.height;
      mat4Perspective(projection, Math.PI / 3, aspect, 0.1, 100.0);
      const eye = controller.position;
      const center = controller.getViewTarget();
      mat4LookAt(view, eye, center, WORLD_UP);
      mat4Multiply(viewProj, projection, view);

      let weaponReady = false;
      if (weaponGeometry) {
        const cosPitch = Math.cos(controller.pitch);
        const sinPitch = Math.sin(controller.pitch);
        const cosYaw = Math.cos(controller.yaw);
        const sinYaw = Math.sin(controller.yaw);

        weaponForward[0] = sinYaw * cosPitch;
        weaponForward[1] = sinPitch;
        weaponForward[2] = cosYaw * cosPitch;

        weaponRight[0] = WORLD_UP[1] * weaponForward[2] - WORLD_UP[2] * weaponForward[1];
        weaponRight[1] = WORLD_UP[2] * weaponForward[0] - WORLD_UP[0] * weaponForward[2];
        weaponRight[2] = WORLD_UP[0] * weaponForward[1] - WORLD_UP[1] * weaponForward[0];

        let length = Math.hypot(weaponRight[0], weaponRight[1], weaponRight[2]);
        if (length < 1e-5) {
          weaponRight[0] = 1;
          weaponRight[1] = 0;
          weaponRight[2] = 0;
        } else {
          weaponRight[0] /= length;
          weaponRight[1] /= length;
          weaponRight[2] /= length;
        }

        weaponUp[0] = weaponForward[1] * weaponRight[2] - weaponForward[2] * weaponRight[1];
        weaponUp[1] = weaponForward[2] * weaponRight[0] - weaponForward[0] * weaponRight[2];
        weaponUp[2] = weaponForward[0] * weaponRight[1] - weaponForward[1] * weaponRight[0];

        length = Math.hypot(weaponUp[0], weaponUp[1], weaponUp[2]);
        if (length < 1e-5) {
          weaponUp[0] = WORLD_UP[0];
          weaponUp[1] = WORLD_UP[1];
          weaponUp[2] = WORLD_UP[2];

          weaponRight[0] = weaponUp[1] * weaponForward[2] - weaponUp[2] * weaponForward[1];
          weaponRight[1] = weaponUp[2] * weaponForward[0] - weaponUp[0] * weaponForward[2];
          weaponRight[2] = weaponUp[0] * weaponForward[1] - weaponUp[1] * weaponForward[0];

          length = Math.hypot(weaponRight[0], weaponRight[1], weaponRight[2]);
          if (length < 1e-5) {
            weaponRight[0] = 1;
            weaponRight[1] = 0;
            weaponRight[2] = 0;
          } else {
            weaponRight[0] /= length;
            weaponRight[1] /= length;
            weaponRight[2] /= length;
          }

          weaponUp[0] = weaponForward[1] * weaponRight[2] - weaponForward[2] * weaponRight[1];
          weaponUp[1] = weaponForward[2] * weaponRight[0] - weaponForward[0] * weaponRight[2];
          weaponUp[2] = weaponForward[0] * weaponRight[1] - weaponForward[1] * weaponRight[0];
          length = Math.hypot(weaponUp[0], weaponUp[1], weaponUp[2]);
        }

        if (length < 1e-5) {
          weaponUp[0] = WORLD_UP[0];
          weaponUp[1] = WORLD_UP[1];
          weaponUp[2] = WORLD_UP[2];
        } else {
          weaponUp[0] /= length;
          weaponUp[1] /= length;
          weaponUp[2] /= length;
        }

        const cosRoll = Math.cos(DEFAULT_WEAPON_ROLL);
        const sinRoll = Math.sin(DEFAULT_WEAPON_ROLL);
        const baseRightX = weaponRight[0];
        const baseRightY = weaponRight[1];
        const baseRightZ = weaponRight[2];
        const baseUpX = weaponUp[0];
        const baseUpY = weaponUp[1];
        const baseUpZ = weaponUp[2];

        weaponRight[0] = baseRightX * cosRoll + baseUpX * sinRoll;
        weaponRight[1] = baseRightY * cosRoll + baseUpY * sinRoll;
        weaponRight[2] = baseRightZ * cosRoll + baseUpZ * sinRoll;

        weaponUp[0] = baseUpX * cosRoll - baseRightX * sinRoll;
        weaponUp[1] = baseUpY * cosRoll - baseRightY * sinRoll;
        weaponUp[2] = baseUpZ * cosRoll - baseRightZ * sinRoll;

        weaponTranslation[0] =
          eye[0] +
          weaponForward[0] * DEFAULT_WEAPON_OFFSET.forward +
          weaponRight[0] * DEFAULT_WEAPON_OFFSET.right +
          weaponUp[0] * DEFAULT_WEAPON_OFFSET.up;
        weaponTranslation[1] =
          eye[1] +
          weaponForward[1] * DEFAULT_WEAPON_OFFSET.forward +
          weaponRight[1] * DEFAULT_WEAPON_OFFSET.right +
          weaponUp[1] * DEFAULT_WEAPON_OFFSET.up;
        weaponTranslation[2] =
          eye[2] +
          weaponForward[2] * DEFAULT_WEAPON_OFFSET.forward +
          weaponRight[2] * DEFAULT_WEAPON_OFFSET.right +
          weaponUp[2] * DEFAULT_WEAPON_OFFSET.up;

        mat4FromRotationTranslation(
          weaponModel,
          weaponRight,
          weaponUp,
          weaponForward,
          weaponTranslation
        );
        mat4Multiply(weaponViewModel, view, weaponModel);
        mat4Multiply(weaponViewProj, projection, weaponViewModel);
        weaponReady = true;
      }

      device.queue.writeBuffer(
        worldUniformBuffer,
        0,
        viewProj.buffer,
        viewProj.byteOffset,
        viewProj.byteLength
      );

      const encoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.05, g: 0.06, b: 0.08, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, worldUniformBindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(vertexCount, 1, 0, 0);

      if (weaponReady && weaponGeometry) {
        device.queue.writeBuffer(
          weaponUniformBuffer,
          0,
          weaponViewProj.buffer,
          weaponViewProj.byteOffset,
          weaponViewProj.byteLength
        );
        pass.setBindGroup(0, weaponUniformBindGroup);
        pass.setVertexBuffer(0, weaponGeometry.vertexBuffer);
        pass.draw(weaponGeometry.vertexCount, 1, 0, 0);
        pass.setBindGroup(0, worldUniformBindGroup);
      }
      pass.end();

      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

    if (overlay) {
      const weaponLine = defaultWeapon
        ? `<div>Equipped: ${defaultWeapon.displayName}</div>`
        : '';
      overlay.innerHTML = `
        <div><strong>WebGPU FPS Prototype</strong></div>
        <div>Click to capture the mouse, then use WASD to move, Space/Shift for vertical movement. Press Esc to open the pause menu.</div>
        ${weaponLine}
      `;
    }
  } catch (error) {
    console.error(error);
    if (overlay) {
      overlay.textContent = error.message;
      overlay.style.display = '';
    }
  }
}

main();
