import { mat4FromRotationTranslation, mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';
import { FirstPersonController } from './fpsController.js';
import { initWebGPU } from './webgpu/initWebGPU.js';
import { createBasicPipeline } from './webgpu/pipeline.js';
import { createRoomGeometry } from './world/roomGeometry.js';
import { setupPauseMenu } from './ui/pauseMenu.js';
import { getWeapon } from './game/playerWeapons.js';
import { createProjectileManager } from './game/projectiles.js';

const DEFAULT_WEAPON_OFFSET = {
  forward: 0.6,
  right: -0.22,
  up: -0.22
};

const DEFAULT_WEAPON_ROLL = 0.0;
const WORLD_UP = [0, 1, 0];
const PRIMARY_WEAPON_SLOT_SELECTOR = '.item-slot[data-slot-kind="gear"][data-slot-allowed="primary"]';
const DEFAULT_PROJECTILE_SETTINGS = Object.freeze({
  size: 0.075,
  lifetime: 2.0,
  muzzleOffset: 0.9,
  color: [0.9, 0.95, 0.4]
});

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
    const projectileManager = createProjectileManager(device);
    const primaryWeaponSlot = document.querySelector(PRIMARY_WEAPON_SLOT_SELECTOR);
    const fallbackWeapon = getWeapon('pea-shooter');

    let weaponGeometry = null;
    let equippedWeaponDefinition = null;
    let primaryFireCooldown = 0;

    let overlayWeaponLine = null;
    if (overlay) {
      overlay.innerHTML = `
        <div><strong>WebGPU FPS Prototype</strong></div>
        <div>Click to capture the mouse, then use WASD to move, Space/Shift for vertical movement. Press Esc to open the pause menu.</div>
        <div data-overlay-role="equipped-weapon"></div>
      `;
      overlayWeaponLine = overlay.querySelector('[data-overlay-role="equipped-weapon"]');
    }

    const updateOverlayWeaponLine = () => {
      if (!overlayWeaponLine) {
        return;
      }
      if (equippedWeaponDefinition) {
        overlayWeaponLine.textContent = `Equipped: ${equippedWeaponDefinition.displayName}`;
        overlayWeaponLine.style.display = '';
      } else {
        overlayWeaponLine.textContent = '';
        overlayWeaponLine.style.display = 'none';
      }
    };

    const setEquippedWeaponDefinition = (weaponDefinition) => {
      if (equippedWeaponDefinition === weaponDefinition) {
        updateOverlayWeaponLine();
        return;
      }

      if (weaponGeometry?.vertexBuffer) {
        weaponGeometry.vertexBuffer.destroy?.();
      }

      weaponGeometry = null;
      equippedWeaponDefinition = weaponDefinition ?? null;
      primaryFireCooldown = 0;

      if (equippedWeaponDefinition) {
        weaponGeometry = equippedWeaponDefinition.createGeometry(device);
        if (!weaponGeometry) {
          console.warn(`Failed to create geometry for weapon "${equippedWeaponDefinition.id}".`);
        }
      }

      updateOverlayWeaponLine();
    };

    const resolveWeaponForSlot = (slot) => {
      if (!slot) {
        return fallbackWeapon ?? null;
      }
      if (slot.dataset.slot === 'empty') {
        return null;
      }
      const weaponId = slot.dataset.weaponId;
      if (!weaponId) {
        return null;
      }
      const weapon = getWeapon(weaponId);
      if (!weapon) {
        console.warn(`Unknown weapon id "${weaponId}".`);
        return null;
      }
      return weapon;
    };

    const syncPrimaryWeapon = () => {
      const nextWeapon = resolveWeaponForSlot(primaryWeaponSlot);
      setEquippedWeaponDefinition(nextWeapon);
    };

    syncPrimaryWeapon();

    window.addEventListener('player-slot-change', (event) => {
      const slot = event.detail?.slot ?? null;
      if (slot === primaryWeaponSlot) {
        syncPrimaryWeapon();
      }
    });

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
    const muzzlePosition = new Float32Array(3);

    const controller = new FirstPersonController(canvas);
    pauseControls.setController(controller);

    let lastTime = performance.now();

    function frame(now) {
      const deltaTime = Math.min((now - lastTime) / 1000, 0.2);
      lastTime = now;

      const isPaused = pauseControls.isPaused();

      if (!isPaused) {
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

      let weaponTransformReady = false;
      if (equippedWeaponDefinition) {
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
        weaponTransformReady = true;
      }

      if (!isPaused) {
        projectileManager.update(deltaTime);
        if (primaryFireCooldown > 0) {
          primaryFireCooldown = Math.max(primaryFireCooldown - deltaTime, 0);
        }

        if (
          weaponTransformReady &&
          controller.isPrimaryFireActive() &&
          primaryFireCooldown <= 0 &&
          equippedWeaponDefinition
        ) {
          const stats = equippedWeaponDefinition.stats ?? {};
          const rateOfFire = Number(stats.rateOfFire);
          const muzzleVelocity = Number(stats.muzzleVelocity);
          const sizeValue = Number(stats.projectileSize);
          const lifetimeValue = Number(stats.projectileLifetime);
          const muzzleOffsetValue = Number(stats.projectileMuzzleOffset);
          const projectileSize = Number.isFinite(sizeValue) && sizeValue > 0
            ? sizeValue
            : DEFAULT_PROJECTILE_SETTINGS.size;
          const projectileLifetime = Number.isFinite(lifetimeValue) && lifetimeValue > 0
            ? lifetimeValue
            : DEFAULT_PROJECTILE_SETTINGS.lifetime;
          const muzzleOffset = Number.isFinite(muzzleOffsetValue)
            ? muzzleOffsetValue
            : DEFAULT_PROJECTILE_SETTINGS.muzzleOffset;
          const projectileColor = Array.isArray(stats.projectileColor)
            ? stats.projectileColor
            : DEFAULT_PROJECTILE_SETTINGS.color;

          const resolvedRateOfFire = Number.isFinite(rateOfFire) && rateOfFire > 0 ? rateOfFire : 1;
          const resolvedVelocity = Number.isFinite(muzzleVelocity) && muzzleVelocity > 0 ? muzzleVelocity : 20;

          muzzlePosition[0] =
            weaponTranslation[0] + weaponForward[0] * muzzleOffset;
          muzzlePosition[1] =
            weaponTranslation[1] + weaponForward[1] * muzzleOffset;
          muzzlePosition[2] =
            weaponTranslation[2] + weaponForward[2] * muzzleOffset;

          projectileManager.spawnProjectile({
            position: muzzlePosition,
            direction: weaponForward,
            speed: resolvedVelocity,
            color: projectileColor,
            size: projectileSize,
            lifetime: projectileLifetime
          });

          primaryFireCooldown = 1 / resolvedRateOfFire;
        }
      }

      device.queue.writeBuffer(
        worldUniformBuffer,
        0,
        viewProj.buffer,
        viewProj.byteOffset,
        viewProj.byteLength
      );

      projectileManager.syncGPU();

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

      const projectileVertexCount = projectileManager.getVertexCount();
      if (projectileVertexCount > 0) {
        pass.setVertexBuffer(0, projectileManager.getVertexBuffer());
        pass.draw(projectileVertexCount, 1, 0, 0);
      }

      if (weaponTransformReady && weaponGeometry) {
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

  } catch (error) {
    console.error(error);
    if (overlay) {
      overlay.textContent = error.message;
      overlay.style.display = '';
    }
  }
}

main();
