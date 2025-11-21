import { mat4FromRotationTranslation, mat4LookAt, mat4Multiply, mat4Perspective } from '../math.js';
import { FirstPersonController } from '../fpsController.js';
import { initWebGPU } from '../webgpu/initWebGPU.js';
import { createBasicPipeline } from '../webgpu/pipeline.js';
import { createProceduralRoomSystem } from '../world/proceduralRooms.js';
import { getWeapon } from './playerWeapons.js';
import { createEnemyManager } from './enemies/enemyManager.js';
import { createProjectileManager } from './projectiles.js';
import { createBulletHoleManager } from './bulletHoles.js';
import { traceRayAABB } from './collisions.js';
import { createWorldItemManager } from './worldItems.js';
import {
  DEFAULT_PROJECTILE_SETTINGS,
  DEFAULT_WEAPON_OFFSET,
  DEFAULT_WEAPON_ROLL,
  IDENTITY_MATRIX,
  ITEM_AIM_MAX_DISTANCE,
  ITEM_INTERACTION_DISTANCE_SQ,
  ITEM_INTERACTION_VERTICAL_LIMIT,
  MAX_AIM_DISTANCE,
  PICKUP_PROMPT_BLOCKED_COLOR,
  PICKUP_PROMPT_FAILURE_COLOR,
  PICKUP_PROMPT_FAILURE_DURATION,
  PICKUP_PROMPT_SUCCESS_DURATION,
  PICKUP_USE_KEY,
  UNIFORM_BYTE_LENGTH,
  UNIFORM_FLOAT_COUNT,
  WORLD_UP
} from './constants.js';
import { blendWithWhite, floatColorToCss } from './ui/colorUtils.js';
import {
  resolvePlayerCollisions,
  PLAYER_COLLISION_RADIUS,
  PLAYER_COLLISION_HALF_HEIGHT
} from './playerCollisions.js';
import { createProceduralSpawner } from './proceduralSpawner.js';
import {
  createEntityUniformManager,
  createLightGatherer,
  writeUniformData
} from './rendering/renderUtils.js';

export async function initializeGame({
  canvas,
  pauseControls,
  hudController,
  overlayController,
  experienceTracker,
  inventoryManager,
  framerateDisplay
}) {
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
    const roomSystem = createProceduralRoomSystem(device, {
      generationRadius: 5,
      initialLayer: 0
    });
    const layerResolver =
      typeof roomSystem.getLayerIndexForHeight === 'function'
        ? roomSystem.getLayerIndexForHeight
        : null;
    const levelHeight =
      typeof roomSystem.getLevelHeight === 'function' ? roomSystem.getLevelHeight() : null;
    const roomColliders = roomSystem.getColliders();
    const playerCollisionScratch = [];
    let roomVertexBuffer = roomSystem.getVertexBuffer();
    let roomVertexCount = roomSystem.getVertexCount();
    const bounds = roomSystem.getBounds();
    const bulletHoleManager = createBulletHoleManager(device);
    let requeueProceduralEnemy = () => {};

    const enemyManager = createEnemyManager(device, {
      onEnemyDamaged: (details) => {
        hudController?.spawnFloatingDamageNumber?.(details);
      },
      onEnemyDeath: (details) => {
        const reward = Number(details?.experienceReward);
        if (experienceTracker && Number.isFinite(reward) && reward > 0) {
          experienceTracker.addExperience(reward, {
            source: 'enemy',
            enemyType: details?.enemy?.type ?? '',
            enemy: details?.enemy ?? null,
            context: details?.context ?? null
          });
        }
      },
      shouldRetainEnemy: (enemy) => {
        if (!enemy || typeof roomSystem.isPositionWithinGenerationRadius !== 'function') {
          return true;
        }

        let position = enemy.position ?? null;
        if (!position && enemy.bounds) {
          const minX = Number(enemy.bounds.minX);
          const maxX = Number(enemy.bounds.maxX);
          const minY = Number(enemy.bounds.minY);
          const maxY = Number(enemy.bounds.maxY);
          const minZ = Number(enemy.bounds.minZ);
          const maxZ = Number(enemy.bounds.maxZ);

          if (
            Number.isFinite(minX) &&
            Number.isFinite(maxX) &&
            Number.isFinite(minY) &&
            Number.isFinite(maxY) &&
            Number.isFinite(minZ) &&
            Number.isFinite(maxZ)
          ) {
            position = [
              (minX + maxX) * 0.5,
              (minY + maxY) * 0.5,
              (minZ + maxZ) * 0.5
            ];
          }
        }

        if (!position) {
          return true;
        }

        const withinGenerationRadius = roomSystem.isPositionWithinGenerationRadius(position, {
          horizontalPadding: 1,
          verticalPadding: 0
        });

        if (!withinGenerationRadius) {
          requeueProceduralEnemy(enemy);
        }

        return withinGenerationRadius;
      }
    });

    const proceduralSpawner = createProceduralSpawner({
      roomSystem,
      enemyManager,
      layerResolver,
      eventTarget: window
    });
    requeueProceduralEnemy = proceduralSpawner.requeueProceduralEnemy;

    const projectileManager = createProjectileManager(device, {
      bounds,
      getDynamicColliders: () =>
        disableEnemies ? [] : enemyManager.getHitBoxes(),
      getStaticColliders: () => roomColliders,
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

    const worldItemManager = createWorldItemManager(device);
    //enemyManager.spawnTargetDummy({ position: [0, 0, -2.5] });

    const { spawnProceduralBarrels, spawnProceduralCameras } = proceduralSpawner;

    spawnProceduralBarrels();
    spawnProceduralCameras();

    worldItemManager.spawnPickup({
      id: 'pickup-field-medkit',
      itemId: 'field-medkit',
      displayName: 'Field Medkit',
      rarity: 'uncommon',
      position: [0.85, 0, -1.35],
      inventory: {
        itemId: 'field-medkit',
        itemType: 'consumable',
        rarity: 'uncommon',
        description: 'Rapidly mends 40% health over 5 seconds. Shares cooldown.',
        bonuses: 'Health Restored:+40%;Regeneration:+8% per second',
        name: 'Field Medkit',
        abbreviation: 'FM',
        tag: 'Consume'
      }
    });

    const {
      primaryWeaponSlot,
      grantInventoryItem,
      findFirstEmptyInventorySlot
    } = inventoryManager ?? {};

    const fallbackWeapon = getWeapon('pea-shooter');

    const handleWorldItemPickup = (item) => {
      if (!item) {
        return false;
      }
      const inventoryDetails = item.inventory ?? null;
      if (!inventoryDetails) {
        worldItemManager.removeItem(item);
        return true;
      }
      const itemName =
        inventoryDetails.name ?? inventoryDetails.displayName ?? item.displayName ?? 'Item';
      const granted = grantInventoryItem?.({
        itemId: inventoryDetails.itemId ?? item.itemId ?? '',
        itemType: inventoryDetails.itemType ?? '',
        rarity: inventoryDetails.rarity ?? item.rarity ?? '',
        description: inventoryDetails.description ?? '',
        bonuses: inventoryDetails.bonuses ?? '',
        name: itemName,
        abbreviation: inventoryDetails.abbreviation ?? inventoryDetails.itemAbbr ?? '',
        tag: inventoryDetails.tag ?? 'Item',
        weaponId: inventoryDetails.weaponId ?? ''
      });
      if (!granted) {
        return false;
      }
      worldItemManager.removeItem(item);
      return true;
    };

    const controller = new FirstPersonController(canvas);
    pauseControls?.setController?.(controller);
    const enemyUpdateContext = {
      playerPosition: controller.position,
      playerRadius: PLAYER_COLLISION_RADIUS,
      playerHalfHeight: PLAYER_COLLISION_HALF_HEIGHT,
      staticColliders: roomColliders,
      playerLayerIndex: layerResolver ? layerResolver(controller.position[1]) : null
    };

    const handleInventoryDrop = (detail) => {
      if (!detail || !controller) {
        return;
      }
      const itemState = detail.itemState;
      if (!itemState) {
        return;
      }
      const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
      const dropDistance = 1.1;
      const forwardX = Math.sin(controller.yaw);
      const forwardZ = Math.cos(controller.yaw);
      const dropX = controller.position[0] + forwardX * dropDistance;
      const dropZ = controller.position[2] + forwardZ * dropDistance;
      const playerFeetY = controller.position[1] - PLAYER_COLLISION_HALF_HEIGHT;
      const preferredDropY = Number.isFinite(playerFeetY) ? playerFeetY + 0.05 : 0;
      const verticalBase = bounds
        ? clamp(preferredDropY, bounds.minY + 0.05, bounds.maxY - 0.05)
        : preferredDropY;
      const margin = 0.35;
      const resolvedX = bounds ? clamp(dropX, bounds.minX + margin, bounds.maxX - margin) : dropX;
      const resolvedZ = bounds ? clamp(dropZ, bounds.minZ + margin, bounds.maxZ - margin) : dropZ;
      const resolvedY = bounds ? clamp(verticalBase, bounds.minY, bounds.maxY) : verticalBase;
      const displayName = itemState.name || itemState.abbreviation || 'Item';
      const abbreviation = itemState.abbreviation || displayName.slice(0, 2).toUpperCase();
      const tagLabel = itemState.tag || 'Item';

      worldItemManager.spawnPickup({
        itemId: itemState.itemId || '',
        displayName,
        rarity: itemState.rarity || 'common',
        position: [resolvedX, resolvedY, resolvedZ],
        inventory: {
          itemId: itemState.itemId || '',
          itemType: itemState.itemType || '',
          rarity: itemState.rarity || '',
          description: itemState.description || '',
          bonuses: itemState.bonuses || '',
          name: itemState.name || displayName,
          abbreviation,
          tag: tagLabel,
          weaponId: itemState.weaponId || ''
        }
      });
    };

    window.addEventListener('player-inventory-drop', (event) => {
      handleInventoryDrop(event?.detail ?? null);
    });

    let weaponGeometry = null;
    let equippedWeaponDefinition = null;
    let primaryFireCooldown = 0;

    const setEquippedWeaponDefinition = (weaponDefinition) => {
      if (equippedWeaponDefinition === weaponDefinition) {
        overlayController?.setEquippedWeaponLabel?.(
          equippedWeaponDefinition?.displayName ?? ''
        );
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

      overlayController?.setEquippedWeaponLabel?.(
        equippedWeaponDefinition?.displayName ?? ''
      );
      hudController?.setWeaponTheme?.(equippedWeaponDefinition);
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
    const activeLightsScratch = [];
    const initialDiagnostics =
      typeof pauseControls?.getDiagnosticsState === 'function'
        ? pauseControls.getDiagnosticsState()
        : null;
    const initialOptions =
      typeof pauseControls?.getOptionsState === 'function'
        ? pauseControls.getOptionsState()
        : null;
    let disableDynamicLights = Boolean(initialDiagnostics?.disableLights);
    let disableEnemies = Boolean(initialDiagnostics?.disableEnemies);
    let showFramerate = Boolean(initialDiagnostics?.showFramerate);
    const resolveFramerateCap = (value) => {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return 0;
      }
      return Math.max(1, Math.round(numericValue));
    };
    let frameIntervalTargetMs = 0;
    const applyFramerateTarget = (value) => {
      const normalized = resolveFramerateCap(value);
      frameIntervalTargetMs = normalized > 0 ? 1000 / normalized : 0;
    };

    framerateDisplay?.setVisible?.(showFramerate);
    applyFramerateTarget(initialOptions?.framerateCap);

    window.addEventListener('game-diagnostics-change', (event) => {
      disableDynamicLights = Boolean(event?.detail?.disableLights);
      disableEnemies = Boolean(event?.detail?.disableEnemies);
      showFramerate = Boolean(event?.detail?.showFramerate);
      framerateDisplay?.setVisible?.(showFramerate);
    });

    window.addEventListener('game-options-change', (event) => {
      applyFramerateTarget(event?.detail?.framerateCap);
    });

    const ensureRenderableUniformResources = createEntityUniformManager(
      device,
      uniformBindGroupLayout
    );
    const gatherActiveLights = createLightGatherer(roomSystem, {
      disableLightsRef: () => disableDynamicLights
    });

    const elevatorControls = { raise: false, lower: false, autoReturn: false };
    const elevatorSpeed = 1.5;
    const elevatorGateSpeed = 1.8;
    let elevatorGateTarget = 0;
    let elevatorGateProgress =
      typeof roomSystem.getElevatorGateProgress === 'function'
        ? roomSystem.getElevatorGateProgress()
        : 0;
    let lastElevatorOffset =
      typeof roomSystem.getElevatorOffset === 'function' ? roomSystem.getElevatorOffset() : 0;

    function translateItemVertically(item, delta) {
      if (!item || !item.modelMatrix || !item.bounds || !item.center) {
        return;
      }

      item.modelMatrix[13] += delta;
      item.bounds.minY += delta;
      item.bounds.maxY += delta;
      item.center[1] += delta;
    }

    function movePlayerWithElevator(delta) {
      if (!Number.isFinite(delta) || Math.abs(delta) < 1e-4) {
        return;
      }

      const bounds =
        typeof roomSystem.getElevatorBounds === 'function'
          ? roomSystem.getElevatorBounds()
          : null;

      if (!bounds) {
        return;
      }

      const px = controller.position[0];
      const pz = controller.position[2];
      const footY = controller.position[1] - PLAYER_COLLISION_HALF_HEIGHT;
      const horizontalMargin = PLAYER_COLLISION_RADIUS * 0.75;
      const surfaces = [
        {
          minX: bounds.minX,
          maxX: bounds.maxX,
          minZ: bounds.minZ,
          maxZ: bounds.maxZ,
          height: bounds.floorY
        }
      ];

      if (
        Number.isFinite(bounds.canopyMinX) &&
        Number.isFinite(bounds.canopyMaxX) &&
        Number.isFinite(bounds.canopyMinZ) &&
        Number.isFinite(bounds.canopyMaxZ) &&
        Number.isFinite(bounds.canopyMaxY)
      ) {
        surfaces.push({
          minX: bounds.canopyMinX,
          maxX: bounds.canopyMaxX,
          minZ: bounds.canopyMinZ,
          maxZ: bounds.canopyMaxZ,
          height: bounds.canopyMaxY
        });
      }

      const belowTolerance = Math.max(0.05, PLAYER_COLLISION_HALF_HEIGHT * 0.15);
      const aboveTolerance = Math.max(belowTolerance, 0.25);

      for (const surface of surfaces) {
        if (!surface) {
          continue;
        }

        const withinX =
          px >= surface.minX - horizontalMargin && px <= surface.maxX + horizontalMargin;
        const withinZ =
          pz >= surface.minZ - horizontalMargin && pz <= surface.maxZ + horizontalMargin;
        const nearSurface =
          withinX &&
          withinZ &&
          footY >= surface.height - belowTolerance &&
          footY <= surface.height + aboveTolerance;

        if (nearSurface) {
          controller.position[1] += delta;
          break;
        }
      }
    }

    function moveWorldItemsWithElevator(delta, items) {
      if (!Number.isFinite(delta) || Math.abs(delta) < 1e-4) {
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        return;
      }

      const bounds =
        typeof roomSystem.getElevatorBounds === 'function'
          ? roomSystem.getElevatorBounds()
          : null;

      if (!bounds) {
        return;
      }

      const surfaces = [
        {
          minX: bounds.minX,
          maxX: bounds.maxX,
          minZ: bounds.minZ,
          maxZ: bounds.maxZ,
          height: bounds.floorY
        }
      ];

      if (
        Number.isFinite(bounds.canopyMinX) &&
        Number.isFinite(bounds.canopyMaxX) &&
        Number.isFinite(bounds.canopyMinZ) &&
        Number.isFinite(bounds.canopyMaxZ) &&
        Number.isFinite(bounds.canopyMaxY)
      ) {
        surfaces.push({
          minX: bounds.canopyMinX,
          maxX: bounds.canopyMaxX,
          minZ: bounds.canopyMinZ,
          maxZ: bounds.canopyMaxZ,
          height: bounds.canopyMaxY
        });
      }

      const verticalTolerance = 0.35;

      for (const item of items) {
        if (!item || !item.bounds || !item.center) {
          continue;
        }

        const cx = item.center[0];
        const cz = item.center[2];
        const horizontalMargin = Math.max(
          (item.bounds.maxX - item.bounds.minX) * 0.5,
          (item.bounds.maxZ - item.bounds.minZ) * 0.5,
          0.12
        );

        for (const surface of surfaces) {
          if (!surface) {
            continue;
          }

          const withinX =
            cx >= surface.minX - horizontalMargin && cx <= surface.maxX + horizontalMargin;
          const withinZ =
            cz >= surface.minZ - horizontalMargin && cz <= surface.maxZ + horizontalMargin;

          if (!withinX || !withinZ) {
            continue;
          }

          const verticalDistance = Math.min(
            Math.abs(item.bounds.minY - surface.height),
            Math.abs(item.bounds.maxY - surface.height),
            Math.abs(item.center[1] - surface.height)
          );

          if (verticalDistance <= verticalTolerance) {
            translateItemVertically(item, delta);
            break;
          }
        }
      }
    }

    const handleElevatorControl = (event, pressed) => {
      if (!event || typeof event.code !== 'string') {
        return;
      }
      if (event.code === 'KeyR') {
        if (pressed) {
          elevatorControls.autoReturn = false;
          elevatorGateTarget = 0;
        }
        elevatorControls.raise = pressed;
        event.preventDefault();
      } else if (event.code === 'KeyF') {
        if (pressed) {
          elevatorControls.autoReturn = false;
          elevatorGateTarget = 0;
        }
        elevatorControls.lower = pressed;
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', (event) => handleElevatorControl(event, true));
    window.addEventListener('keyup', (event) => handleElevatorControl(event, false));
    window.addEventListener('blur', () => {
      elevatorControls.raise = false;
      elevatorControls.lower = false;
      elevatorControls.autoReturn = false;
      elevatorGateTarget = 0;
    });

    const weaponForward = new Float32Array(3);
    const weaponRight = new Float32Array(3);
    const weaponUp = new Float32Array(3);
    const weaponTranslation = new Float32Array(3);
    const muzzlePosition = new Float32Array(3);
    const cameraAimPoint = new Float32Array(3);
    const projectileDirection = new Float32Array(3);
    const viewDirection = new Float32Array(3);

    let lastTime = performance.now();

    function frame(now) {
      const elapsed = now - lastTime;
      if (frameIntervalTargetMs > 0 && elapsed + 0.25 < frameIntervalTargetMs) {
        requestAnimationFrame(frame);
        return;
      }
      const deltaTime = Math.min(elapsed / 1000, 0.2);
      lastTime = now;
      framerateDisplay?.update?.(deltaTime);

      const isPaused = pauseControls?.isPaused?.();
      const usePressedThisFrame =
        typeof controller.consumeUsePress === 'function' ? controller.consumeUsePress() : false;

      const worldItems =
        typeof worldItemManager.getItems === 'function' ? worldItemManager.getItems() : [];

      hudController?.setReticleVisible?.(!isPaused && Boolean(equippedWeaponDefinition));

      if (!isPaused) {
        controller.update(deltaTime);
      }

      let geometryChanged = false;
      const previousElevatorOffset =
        typeof roomSystem.getElevatorOffset === 'function'
          ? roomSystem.getElevatorOffset()
          : lastElevatorOffset;
      if (!isPaused && typeof roomSystem.adjustElevatorOffset === 'function') {
        if (elevatorControls.raise || elevatorControls.lower) {
          elevatorControls.autoReturn = false;
          elevatorGateTarget = 0;
        }

        let elevatorDelta = 0;
        const elevatorOffset = previousElevatorOffset;
        const maxElevatorStep = elevatorSpeed * deltaTime;

        if (elevatorControls.autoReturn) {
          const toOrigin = -elevatorOffset;
          if (!Number.isFinite(toOrigin) || Math.abs(toOrigin) < 1e-4) {
            elevatorControls.autoReturn = false;
            elevatorGateTarget = 0;
          } else if (Math.abs(toOrigin) <= maxElevatorStep) {
            geometryChanged = roomSystem.setElevatorOffset(0) || geometryChanged;
            elevatorControls.autoReturn = false;
            elevatorGateTarget = 0;
          } else {
            elevatorDelta = Math.sign(toOrigin) * maxElevatorStep;
          }
        } else {
          const elevatorIdle =
            !elevatorControls.raise && !elevatorControls.lower &&
            layerResolver &&
            Number.isFinite(levelHeight);

          if (elevatorIdle) {
            const playerLayer = layerResolver(
              controller.position[1] - PLAYER_COLLISION_HALF_HEIGHT
            );

            if (Number.isFinite(playerLayer)) {
              const targetOffset = playerLayer * levelHeight;
              const toPlayerFloor = targetOffset - elevatorOffset;

              if (Math.abs(toPlayerFloor) <= maxElevatorStep && Math.abs(toPlayerFloor) > 1e-4) {
                geometryChanged = roomSystem.setElevatorOffset(targetOffset) || geometryChanged;
              } else if (Math.abs(toPlayerFloor) > maxElevatorStep) {
                elevatorDelta = Math.sign(toPlayerFloor) * maxElevatorStep;
              }
            }
          }

          if (Math.abs(elevatorDelta) < 1e-4) {
            if (elevatorControls.raise) {
              elevatorDelta += elevatorSpeed * deltaTime;
            }
            if (elevatorControls.lower) {
              elevatorDelta -= elevatorSpeed * deltaTime;
            }
          }
        }

        if (Math.abs(elevatorDelta) > 1e-4) {
          geometryChanged = roomSystem.adjustElevatorOffset(elevatorDelta) || geometryChanged;
        }
      }

      if (!isPaused) {
        const currentGateProgress =
          typeof roomSystem.getElevatorGateProgress === 'function'
            ? roomSystem.getElevatorGateProgress()
            : elevatorGateProgress;
        const gateDelta = elevatorGateTarget - currentGateProgress;
        if (Math.abs(gateDelta) > 1e-4) {
          const maxGateStep = elevatorGateSpeed * deltaTime;
          const gateStep =
            Math.abs(gateDelta) <= maxGateStep
              ? gateDelta
              : Math.sign(gateDelta) * maxGateStep;
          const nextGateProgress = currentGateProgress + gateStep;
          elevatorGateProgress = nextGateProgress;

          if (typeof roomSystem.setElevatorGateProgress === 'function') {
            geometryChanged =
              roomSystem.setElevatorGateProgress(nextGateProgress) || geometryChanged;
          }
        } else {
          elevatorGateProgress = currentGateProgress;
        }
      }

      const currentElevatorOffset =
        typeof roomSystem.getElevatorOffset === 'function'
          ? roomSystem.getElevatorOffset()
          : previousElevatorOffset;
      const elevatorMovement = currentElevatorOffset - previousElevatorOffset;
      movePlayerWithElevator(elevatorMovement);
      moveWorldItemsWithElevator(elevatorMovement, worldItems);
      lastElevatorOffset = currentElevatorOffset;

      geometryChanged = roomSystem.update(controller.position) || geometryChanged;
      if (geometryChanged) {
        roomVertexBuffer = roomSystem.getVertexBuffer();
        roomVertexCount = roomSystem.getVertexCount();
        spawnProceduralBarrels();
        spawnProceduralCameras();
      }

      playerCollisionScratch.length = 0;
      if (roomColliders) {
        for (let i = 0; i < roomColliders.length; i += 1) {
          const collider = roomColliders[i];
          if (collider) {
            playerCollisionScratch.push(collider);
          }
        }
      }

      const dynamicHitBoxes = disableEnemies ? null : enemyManager.getHitBoxes();
      if (dynamicHitBoxes) {
        for (let i = 0; i < dynamicHitBoxes.length; i += 1) {
          const bounds = dynamicHitBoxes[i]?.bounds ?? null;
          if (bounds) {
            playerCollisionScratch.push(bounds);
          }
        }
      }

      const collisionResult = resolvePlayerCollisions(controller.position, playerCollisionScratch);

      const horizontalPadding = Math.max(PLAYER_COLLISION_RADIUS, 0.25);
      const verticalPadding = Math.max(PLAYER_COLLISION_HALF_HEIGHT, 0.25);
      controller.position[0] = Math.min(
        Math.max(controller.position[0], bounds.minX + horizontalPadding),
        bounds.maxX - horizontalPadding
      );
      const unclampedY = controller.position[1];
      const clampedY = Math.min(
        Math.max(unclampedY, bounds.minY + verticalPadding),
        bounds.maxY - verticalPadding
      );
      let boundsGrounded = false;
      let boundsHitCeiling = false;
      if (clampedY !== unclampedY) {
        boundsGrounded = clampedY > unclampedY;
        boundsHitCeiling = clampedY < unclampedY;
      }
      controller.position[1] = clampedY;
      controller.position[2] = Math.min(
        Math.max(controller.position[2], bounds.minZ + horizontalPadding),
        bounds.maxZ - horizontalPadding
      );

      if (typeof controller.applyCollisionResult === 'function') {
        controller.applyCollisionResult({
          grounded: collisionResult.grounded || boundsGrounded,
          hitCeiling: collisionResult.hitCeiling || boundsHitCeiling
        });
      }

      resize();

      const aspect = canvas.width / canvas.height;
      mat4Perspective(projection, Math.PI / 3, aspect, 0.1, 100.0);
      const eye = controller.position;
      const center = controller.getViewTarget();
      viewDirection[0] = center[0] - eye[0];
      viewDirection[1] = center[1] - eye[1];
      viewDirection[2] = center[2] - eye[2];
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
        if (!disableEnemies) {
          enemyUpdateContext.playerPosition = controller.position;
          enemyUpdateContext.staticColliders = roomColliders;
          enemyUpdateContext.playerLayerIndex = layerResolver
            ? layerResolver(controller.position[1])
            : null;
          enemyManager.update(deltaTime, enemyUpdateContext);
        }
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

          const dynamicAimColliders = disableEnemies ? null : enemyManager.getHitBoxes?.();
          if (Array.isArray(dynamicAimColliders)) {
            for (let i = 0; i < dynamicAimColliders.length; i += 1) {
              const colliderBounds = dynamicAimColliders[i]?.bounds;
              if (!colliderBounds) {
                continue;
              }
              tryAimHit(traceRayAABB(eye, weaponForward, MAX_AIM_DISTANCE, colliderBounds));
            }
          }

          if (Array.isArray(roomColliders) && roomColliders.length > 0) {
            for (let i = 0; i < roomColliders.length; i += 1) {
              const colliderBounds = roomColliders[i];
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

      if (isPaused) {
        overlayController?.hideUsePrompt?.();
        hudController?.setReticleAccentOverride?.(null);
      } else {
        const elevatorPanel =
          typeof roomSystem.getElevatorPanel === 'function' ? roomSystem.getElevatorPanel() : null;
        let elevatorPromptActive = false;

        if (elevatorPanel?.bounds && elevatorPanel.center) {
          const dx = controller.position[0] - elevatorPanel.center[0];
          const dz = controller.position[2] - elevatorPanel.center[2];
          const horizontalDistanceSq = dx * dx + dz * dz;
          if (horizontalDistanceSq <= ITEM_INTERACTION_DISTANCE_SQ) {
            const verticalDistance = Math.abs(controller.position[1] - elevatorPanel.center[1]);
            if (verticalDistance <= ITEM_INTERACTION_VERTICAL_LIMIT) {
              const hit = traceRayAABB(eye, viewDirection, ITEM_AIM_MAX_DISTANCE, elevatorPanel.bounds);
              if (hit) {
                elevatorPromptActive = true;
                const reticleColor = elevatorPanel.color ?? [0.75, 0.9, 1];
                const promptColor = floatColorToCss(reticleColor, 'rgb(200, 230, 255)');
                hudController?.setReticleAccentOverride?.(reticleColor);
                overlayController?.showPersistentUsePrompt?.(
                  `Press ${PICKUP_USE_KEY} to return to the ground floor`,
                  promptColor
                );

                if (usePressedThisFrame) {
                  elevatorControls.autoReturn = true;
                  elevatorControls.raise = false;
                  elevatorControls.lower = false;
                  elevatorGateTarget = 1;
                  overlayController?.showTemporaryUsePrompt?.(
                    'Returning elevator to ground floor',
                    promptColor,
                    PICKUP_PROMPT_SUCCESS_DURATION * 0.6
                  );
                }
              }
            }
          }
        }

        if (!elevatorPromptActive) {
          let highlightedPickup = null;
          let closestPickupDistance = Infinity;

          if (Array.isArray(worldItems) && worldItems.length > 0) {
            for (const item of worldItems) {
              if (!item || !item.bounds || !item.center) {
                continue;
              }

              const dx = controller.position[0] - item.center[0];
              const dz = controller.position[2] - item.center[2];
              const horizontalDistanceSq = dx * dx + dz * dz;
              if (horizontalDistanceSq > ITEM_INTERACTION_DISTANCE_SQ) {
                continue;
              }

              const verticalDistance = Math.abs(controller.position[1] - item.center[1]);
              if (verticalDistance > ITEM_INTERACTION_VERTICAL_LIMIT) {
                continue;
              }

              const hit = traceRayAABB(eye, viewDirection, ITEM_AIM_MAX_DISTANCE, item.bounds);
              if (!hit) {
                continue;
              }

              if (hit.distance < closestPickupDistance) {
                closestPickupDistance = hit.distance;
                highlightedPickup = item;
              }
            }
          }

          if (highlightedPickup) {
            const pickupName = highlightedPickup.displayName ?? 'Pickup';
            const highlightColor =
              blendWithWhite(highlightedPickup.accentColor, 0.25) ?? highlightedPickup.accentColor;
            const promptColor = floatColorToCss(
              highlightColor ?? highlightedPickup.accentColor,
              'rgb(255, 255, 255)'
            );
            const canPickup = Boolean(findFirstEmptyInventorySlot?.());
            let shouldShowPrompt = true;

            hudController?.setReticleAccentOverride?.(highlightColor ?? highlightedPickup.accentColor);

            if (usePressedThisFrame) {
              if (canPickup) {
                if (handleWorldItemPickup(highlightedPickup)) {
                  hudController?.setReticleAccentOverride?.(null);
                  overlayController?.showPersistentUsePrompt?.('', '');
                  overlayController?.showTemporaryUsePrompt?.(
                    `${pickupName} added to pack`,
                    promptColor,
                    PICKUP_PROMPT_SUCCESS_DURATION
                  );
                  highlightedPickup = null;
                  shouldShowPrompt = false;
                }
              } else {
                overlayController?.showTemporaryUsePrompt?.(
                  'Pack inventory is full',
                  PICKUP_PROMPT_FAILURE_COLOR,
                  PICKUP_PROMPT_FAILURE_DURATION
                );
              }
            }

            if (highlightedPickup && shouldShowPrompt) {
              if (canPickup) {
                const rarityLabel = highlightedPickup.rarityLabel || '';
                overlayController?.showPersistentUsePrompt?.(
                  `Press ${PICKUP_USE_KEY} to pick up ${pickupName}${rarityLabel ? ` (${rarityLabel})` : ''}`,
                  promptColor
                );
              } else {
                overlayController?.showPersistentUsePrompt?.(
                  `Pack is full — ${pickupName}`,
                  PICKUP_PROMPT_BLOCKED_COLOR
                );
              }
            }
          } else {
            hudController?.setReticleAccentOverride?.(null);
            overlayController?.showPersistentUsePrompt?.('', '');
          }
        }
      }

      const enemies = disableEnemies ? [] : enemyManager.getEnemies();
      const viewportWidth = canvas.clientWidth ?? canvas.width;
      const viewportHeight = canvas.clientHeight ?? canvas.height;

      let minimapState = {
        snapshot: null,
        enemies: [],
        playerYaw: controller.yaw
      };
      const minimapSnapshot =
        typeof roomSystem.getMinimapSnapshot === 'function'
          ? roomSystem.getMinimapSnapshot(controller.position, { radius: 4 })
          : null;

      if (minimapSnapshot) {
        if (layerResolver && Number.isFinite(minimapSnapshot.layerIndex)) {
          const minimapEnemies = [];

          for (const enemy of enemies) {
            const position = enemy?.position;
            if (!position) {
              continue;
            }

            const enemyLayer = layerResolver(position[1]);
            if (enemyLayer !== minimapSnapshot.layerIndex) {
              continue;
            }

            minimapEnemies.push({
              x: position[0],
              y: position[1],
              z: position[2]
            });
          }

          minimapState = {
            snapshot: minimapSnapshot,
            enemies: minimapEnemies,
            playerYaw: controller.yaw
          };
        }
      }

      hudController?.updateWorldSpaceUI?.({
        enemies,
        viewProjectionMatrix: viewProj,
        viewportWidth,
        viewportHeight,
        deltaTime,
        paused: Boolean(isPaused),
        cameraPosition: eye,
        occlusionColliders: roomColliders,
        minimap: minimapState
      });

      const activeLights = gatherActiveLights(controller.position, activeLightsScratch);

      writeUniformData(worldUniformData, viewProj, IDENTITY_MATRIX, activeLights);
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
      pass.setVertexBuffer(0, roomVertexBuffer);
      pass.draw(roomVertexCount, 1, 0, 0);

      if (Array.isArray(worldItems) && worldItems.length > 0) {
        for (const item of worldItems) {
          if (!item || !item.vertexBuffer || !item.vertexCount) {
            continue;
          }
          ensureRenderableUniformResources(item);
          if (!item.uniformBuffer || !item.uniformBindGroup || !item.uniformData) {
            continue;
          }
          writeUniformData(
            item.uniformData,
            viewProj,
            item.modelMatrix ?? IDENTITY_MATRIX,
            activeLights
          );
          device.queue.writeBuffer(item.uniformBuffer, 0, item.uniformData);
          pass.setBindGroup(0, item.uniformBindGroup);
          pass.setVertexBuffer(0, item.vertexBuffer);
          pass.draw(item.vertexCount, 1, 0, 0);
        }
        pass.setBindGroup(0, worldUniformBindGroup);
        pass.setVertexBuffer(0, roomVertexBuffer);
      }

      if (enemies.length > 0) {
        for (const enemy of enemies) {
          if (!enemy || !enemy.vertexBuffer || !enemy.vertexCount) {
            continue;
          }
          ensureRenderableUniformResources(enemy);
          if (!enemy.uniformBuffer || !enemy.uniformBindGroup || !enemy.uniformData) {
            continue;
          }
          writeUniformData(
            enemy.uniformData,
            viewProj,
            enemy.modelMatrix ?? IDENTITY_MATRIX,
            activeLights
          );
          device.queue.writeBuffer(enemy.uniformBuffer, 0, enemy.uniformData);
          pass.setBindGroup(0, enemy.uniformBindGroup);
          pass.setVertexBuffer(0, enemy.vertexBuffer);
          pass.draw(enemy.vertexCount, 1, 0, 0);
        }
        pass.setBindGroup(0, worldUniformBindGroup);
        pass.setVertexBuffer(0, roomVertexBuffer);
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
        writeUniformData(weaponUniformData, viewProj, weaponModel, activeLights);
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
    overlayController?.showOverlayError?.(error.message);
  }
}
