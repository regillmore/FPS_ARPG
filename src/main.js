import { mat4FromRotationTranslation, mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';
import { FirstPersonController } from './fpsController.js';
import { initWebGPU } from './webgpu/initWebGPU.js';
import { createBasicPipeline } from './webgpu/pipeline.js';
import { createRoomGeometry } from './world/roomGeometry.js';
import { setupPauseMenu } from './ui/pauseMenu.js';
import { createHudReticle } from './ui/hudReticle.js';
import { createEnemyHealthBars } from './ui/enemyHealthBars.js';
import { createFloatingDamageNumbers } from './ui/floatingDamageNumbers.js';
import { getWeapon } from './game/playerWeapons.js';
import { createEnemyManager } from './game/enemies/enemyManager.js';
import { createProjectileManager } from './game/projectiles.js';
import { createBulletHoleManager } from './game/bulletHoles.js';
import { traceRayAABB } from './game/collisions.js';

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
  color: [0.9, 0.95, 0.4],
  damage: 6
});
const MAX_AIM_DISTANCE = 100;
const DEFAULT_RETICLE_PRIMARY_COLOR = [1, 1, 1];
const RETICLE_WHITE_BLEND = 0.45;
const MAX_LIGHTS = 2;
const AMBIENT_LIGHT = new Float32Array([0.05, 0.055, 0.06]);
const ACTIVE_LIGHTS = [
  {
    position: new Float32Array([-2.25, 3.25, -1.75, 1.0]),
    color: new Float32Array([1.0, 0.82, 0.65, 3.2])
  },
  {
    position: new Float32Array([2.5, 2.2, 2.8, 1.0]),
    color: new Float32Array([0.6, 0.8, 1.0, 2.6])
  }
];
const UNIFORM_FLOAT_COUNT = 52;
const UNIFORM_BYTE_LENGTH = UNIFORM_FLOAT_COUNT * 4;
const IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);

async function main() {
  const canvas = document.getElementById('gfx');
  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  const itemPopover = document.getElementById('item-detail-popover');
  const hudLayer = document.getElementById('hud');

  if (!canvas) {
    throw new Error('Failed to find the rendering canvas.');
  }

  const pauseControls = setupPauseMenu({ canvas, overlay, pauseMenu, itemPopover });
  pauseControls.setPaused(true);
  const hudReticle = createHudReticle({ mount: hudLayer });
  const enemyHealthBars = createEnemyHealthBars({ mount: hudLayer });
  const floatingDamageNumbers = createFloatingDamageNumbers({ mount: hudLayer });

  const blendWithWhite = (color, factor = RETICLE_WHITE_BLEND) => {
    if (!Array.isArray(color) || color.length < 3) {
      return null;
    }

    const blend = Math.min(Math.max(factor, 0), 1);
    const keep = 1 - blend;
    const r = Number.isFinite(color[0]) ? color[0] : 0;
    const g = Number.isFinite(color[1]) ? color[1] : 0;
    const b = Number.isFinite(color[2]) ? color[2] : 0;
    return [
      Math.min(Math.max(r * keep + blend, 0), 1),
      Math.min(Math.max(g * keep + blend, 0), 1),
      Math.min(Math.max(b * keep + blend, 0), 1)
    ];
  };

  const applyWeaponHudTheme = (weaponDefinition) => {
    if (!hudReticle) {
      return;
    }

    if (!weaponDefinition) {
      hudReticle.setVisible(false);
      return;
    }

    const theme = weaponDefinition.getHudTheme?.() ?? null;
    const accentColor = theme?.reticleAccentColor
      ? blendWithWhite(theme.reticleAccentColor)
      : undefined;
    const primaryColor = theme?.reticlePrimaryColor ?? DEFAULT_RETICLE_PRIMARY_COLOR;

    hudReticle.setTheme({
      primaryColor,
      accentColor
    });
  };

  try {
    const {
      device,
      context,
      format,
      depthFormat,
      resize,
      getDepthTextureView
    } = await initWebGPU(canvas);
    const pipeline = createBasicPipeline(device, format, depthFormat);
    const uniformBindGroupLayout = pipeline.getBindGroupLayout(0);
    const { vertexBuffer, vertexCount, bounds } = createRoomGeometry(device);
    const bulletHoleManager = createBulletHoleManager(device);
    const enemyManager = createEnemyManager(device, {
      onEnemyDamaged: (details) => {
        if (floatingDamageNumbers) {
          floatingDamageNumbers.spawn(details);
        }
      }
    });
    const projectileManager = createProjectileManager(device, {
      bounds,
      getDynamicColliders: () => enemyManager.getHitBoxes(),
      onImpact: (impact) => {
        const size = Number.isFinite(impact.projectileSize)
          ? Math.max(impact.projectileSize * 3, 0.12)
          : undefined;
        bulletHoleManager.spawnBulletHole({
          position: impact.position,
          normal: impact.normal,
          size,
          color: impact.projectileColor
        });
      }
    });
    enemyManager.spawnTargetDummy({ position: [0, 0, -2.5] });
    enemyManager.spawnBarrel({ position: [2.5, 0, -4.25] });
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
      applyWeaponHudTheme(equippedWeaponDefinition);
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
      size: UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const worldUniformBindGroup = device.createBindGroup({
      layout: uniformBindGroupLayout,
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
      size: UNIFORM_BYTE_LENGTH,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const weaponUniformBindGroup = device.createBindGroup({
      layout: uniformBindGroupLayout,
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
    const worldUniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
    const weaponUniformData = new Float32Array(UNIFORM_FLOAT_COUNT);
    const activeLightCount = Math.min(ACTIVE_LIGHTS.length, MAX_LIGHTS);

    const ensureEnemyUniformResources = (enemy) => {
      if (!enemy || enemy.uniformBuffer) {
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
      const originalDestroy = typeof enemy.destroy === 'function' ? enemy.destroy.bind(enemy) : null;

      enemy.uniformBuffer = uniformBuffer;
      enemy.uniformBindGroup = uniformBindGroup;
      enemy.uniformData = uniformData;
      enemy.destroy = () => {
        uniformBuffer.destroy?.();
        enemy.uniformBuffer = null;
        enemy.uniformBindGroup = null;
        enemy.uniformData = null;
        if (originalDestroy) {
          originalDestroy();
        }
      };
    };

    const writeUniformData = (target, viewProjection, modelMatrix) => {
      target.set(viewProjection, 0);
      target.set(modelMatrix, 16);
      target[32] = AMBIENT_LIGHT[0];
      target[33] = AMBIENT_LIGHT[1];
      target[34] = AMBIENT_LIGHT[2];
      target[35] = activeLightCount;
      for (let i = 0; i < MAX_LIGHTS; i += 1) {
        const base = 36 + i * 8;
        const light = ACTIVE_LIGHTS[i];
        if (light) {
          target[base + 0] = light.position[0];
          target[base + 1] = light.position[1];
          target[base + 2] = light.position[2];
          target[base + 3] = light.position[3] ?? 1.0;
          target[base + 4] = light.color[0];
          target[base + 5] = light.color[1];
          target[base + 6] = light.color[2];
          target[base + 7] = light.color[3] ?? 1.0;
        } else {
          target.fill(0, base, base + 8);
        }
      }
    };

    const weaponForward = new Float32Array(3);
    const weaponRight = new Float32Array(3);
    const weaponUp = new Float32Array(3);
    const weaponTranslation = new Float32Array(3);
    const muzzlePosition = new Float32Array(3);
    const cameraAimPoint = new Float32Array(3);
    const projectileDirection = new Float32Array(3);

    const controller = new FirstPersonController(canvas);
    pauseControls.setController(controller);

    let lastTime = performance.now();

    function frame(now) {
      const deltaTime = Math.min((now - lastTime) / 1000, 0.2);
      lastTime = now;

      const isPaused = pauseControls.isPaused();

      if (hudReticle) {
        const shouldShowHudReticle = !isPaused && Boolean(equippedWeaponDefinition);
        hudReticle.setVisible(shouldShowHudReticle);
      }

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
        weaponTransformReady = true;
      }

      if (!isPaused) {
        bulletHoleManager.update(deltaTime);
        projectileManager.update(deltaTime);
        enemyManager.update(deltaTime);
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
          const damageStat = 'projectileDamage' in stats ? stats.projectileDamage : stats.baseDamage;
          const damageValue = Number(damageStat);
          const projectileDamage =
            Number.isFinite(damageValue) && damageValue > 0
              ? damageValue
              : DEFAULT_PROJECTILE_SETTINGS.damage;

          const resolvedRateOfFire = Number.isFinite(rateOfFire) && rateOfFire > 0 ? rateOfFire : 1;
          const resolvedVelocity = Number.isFinite(muzzleVelocity) && muzzleVelocity > 0 ? muzzleVelocity : 20;

          muzzlePosition[0] =
            weaponTranslation[0] + weaponForward[0] * muzzleOffset;
          muzzlePosition[1] =
            weaponTranslation[1] + weaponForward[1] * muzzleOffset;
          muzzlePosition[2] =
            weaponTranslation[2] + weaponForward[2] * muzzleOffset;

          let closestAimHit = null;
          const tryAimHit = (hit) => {
            if (!hit) {
              return;
            }
            if (!closestAimHit || hit.distance < closestAimHit.distance) {
              closestAimHit = hit;
            }
          };

          const dynamicAimColliders = enemyManager.getHitBoxes?.();
          if (Array.isArray(dynamicAimColliders)) {
            for (let i = 0; i < dynamicAimColliders.length; i += 1) {
              const colliderBounds = dynamicAimColliders[i]?.bounds;
              if (!colliderBounds) {
                continue;
              }
              tryAimHit(traceRayAABB(eye, weaponForward, MAX_AIM_DISTANCE, colliderBounds));
            }
          }

          tryAimHit(traceRayAABB(eye, weaponForward, MAX_AIM_DISTANCE, bounds));

          if (closestAimHit) {
            cameraAimPoint.set(closestAimHit.position);
          } else {
            cameraAimPoint[0] = eye[0] + weaponForward[0] * MAX_AIM_DISTANCE;
            cameraAimPoint[1] = eye[1] + weaponForward[1] * MAX_AIM_DISTANCE;
            cameraAimPoint[2] = eye[2] + weaponForward[2] * MAX_AIM_DISTANCE;
          }

          projectileDirection[0] = cameraAimPoint[0] - muzzlePosition[0];
          projectileDirection[1] = cameraAimPoint[1] - muzzlePosition[1];
          projectileDirection[2] = cameraAimPoint[2] - muzzlePosition[2];

          let projectileDirectionLength = Math.hypot(
            projectileDirection[0],
            projectileDirection[1],
            projectileDirection[2]
          );

          if (projectileDirectionLength <= 1e-5) {
            projectileDirection[0] = weaponForward[0];
            projectileDirection[1] = weaponForward[1];
            projectileDirection[2] = weaponForward[2];
            projectileDirectionLength = 1;
          } else {
            projectileDirection[0] /= projectileDirectionLength;
            projectileDirection[1] /= projectileDirectionLength;
            projectileDirection[2] /= projectileDirectionLength;
          }

          projectileManager.spawnProjectile({
            position: muzzlePosition,
            direction: projectileDirection,
            speed: resolvedVelocity,
            color: projectileColor,
            size: projectileSize,
            lifetime: projectileLifetime,
            damage: projectileDamage
          });

          primaryFireCooldown = 1 / resolvedRateOfFire;
        }
      }

      const enemies = enemyManager.getEnemies();
      const viewportWidth = hudLayer?.clientWidth ?? canvas.clientWidth ?? canvas.width;
      const viewportHeight = hudLayer?.clientHeight ?? canvas.clientHeight ?? canvas.height;

      if (enemyHealthBars) {
        enemyHealthBars.update({
          enemies,
          viewProjectionMatrix: viewProj,
          viewportWidth,
          viewportHeight
        });
      }

      if (floatingDamageNumbers) {
        floatingDamageNumbers.update({
          deltaTime: isPaused ? 0 : deltaTime,
          viewProjectionMatrix: viewProj,
          viewportWidth,
          viewportHeight
        });
      }

      writeUniformData(worldUniformData, viewProj, IDENTITY_MATRIX);
      device.queue.writeBuffer(worldUniformBuffer, 0, worldUniformData);

      bulletHoleManager.syncGPU();
      projectileManager.syncGPU();

      const encoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const depthTextureView = getDepthTextureView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.05, g: 0.06, b: 0.08, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ],
        depthStencilAttachment: {
          view: depthTextureView,
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store'
        }
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, worldUniformBindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(vertexCount, 1, 0, 0);

      if (enemies.length > 0) {
        for (const enemy of enemies) {
          if (!enemy || !enemy.vertexBuffer || !enemy.vertexCount) {
            continue;
          }
          ensureEnemyUniformResources(enemy);
          if (!enemy.uniformBuffer || !enemy.uniformBindGroup || !enemy.uniformData) {
            continue;
          }
          writeUniformData(enemy.uniformData, viewProj, enemy.modelMatrix ?? IDENTITY_MATRIX);
          device.queue.writeBuffer(enemy.uniformBuffer, 0, enemy.uniformData);
          pass.setBindGroup(0, enemy.uniformBindGroup);
          pass.setVertexBuffer(0, enemy.vertexBuffer);
          pass.draw(enemy.vertexCount, 1, 0, 0);
        }
        pass.setBindGroup(0, worldUniformBindGroup);
        pass.setVertexBuffer(0, vertexBuffer);
      }

      const bulletHoleVertexCount = bulletHoleManager.getVertexCount();
      if (bulletHoleVertexCount > 0) {
        pass.setVertexBuffer(0, bulletHoleManager.getVertexBuffer());
        pass.draw(bulletHoleVertexCount, 1, 0, 0);
      }

      const projectileVertexCount = projectileManager.getVertexCount();
      if (projectileVertexCount > 0) {
        pass.setVertexBuffer(0, projectileManager.getVertexBuffer());
        pass.draw(projectileVertexCount, 1, 0, 0);
      }

      if (weaponTransformReady && weaponGeometry) {
        writeUniformData(weaponUniformData, viewProj, weaponModel);
        device.queue.writeBuffer(weaponUniformBuffer, 0, weaponUniformData);
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
