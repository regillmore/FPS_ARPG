const DEFAULT_EVENT_TARGET = typeof window !== 'undefined' ? window : null;

const clonePositionArray = (source) => {
  if (!source) {
    return null;
  }
  const arrayLike = Array.isArray(source) || ArrayBuffer.isView(source) ? source : null;
  if (!arrayLike) {
    return null;
  }
  const x = Number(arrayLike[0]);
  const y = Number(arrayLike[1]);
  const z = Number(arrayLike[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return [x, y, z];
};

const cloneRoomBounds = (source) => {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const minX = Number(source.minX);
  const maxX = Number(source.maxX);
  const minZ = Number(source.minZ);
  const maxZ = Number(source.maxZ);
  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ) ||
    minX >= maxX ||
    minZ >= maxZ
  ) {
    return null;
  }
  return { minX, maxX, minZ, maxZ };
};

const dispatchBestiaryUnlock = (eventTarget, enemyType) => {
  if (!eventTarget || typeof eventTarget.dispatchEvent !== 'function' || !enemyType) {
    return;
  }
  eventTarget.dispatchEvent(
    new CustomEvent('bestiary-unlock', {
      detail: { enemyType }
    })
  );
};

export function createProceduralSpawner({ roomSystem, enemyManager, layerResolver, eventTarget = DEFAULT_EVENT_TARGET } = {}) {
  let barrelBestiaryUnlocked = false;
  let securityCameraBestiaryUnlocked = false;

  const requeueProceduralEnemy = (enemy) => {
    if (!enemy) {
      return;
    }
    const spawnContext = enemy.spawnContext ?? null;
    if (!spawnContext) {
      return;
    }

    let position = clonePositionArray(spawnContext.position);
    if (!position) {
      position = clonePositionArray(enemy.position);
    }
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
      return;
    }

    if (
      spawnContext.type === 'procedural-barrel' &&
      typeof roomSystem?.scheduleBarrelSpawnPoint === 'function'
    ) {
      roomSystem.scheduleBarrelSpawnPoint({
        key: spawnContext.roomKey ?? '',
        position
      });
    } else if (
      spawnContext.type === 'procedural-camera' &&
      typeof roomSystem?.scheduleCameraSpawnPoint === 'function'
    ) {
      let roomBounds = cloneRoomBounds(spawnContext.roomBounds);
      if (!roomBounds && enemy.roomBounds) {
        roomBounds = cloneRoomBounds(enemy.roomBounds);
      }
      roomSystem.scheduleCameraSpawnPoint({
        key: spawnContext.roomKey ?? '',
        position,
        forward: spawnContext.forward ?? enemy.forward ?? [0, 0, -1],
        up: spawnContext.up ?? enemy.up ?? [0, 1, 0],
        roomBounds
      });
    }
  };

  const spawnProceduralBarrels = () => {
    const spawns = roomSystem?.consumeBarrelSpawnPoints?.();
    if (!spawns || spawns.length === 0) {
      return;
    }

    for (const spawn of spawns) {
      const position = clonePositionArray(spawn?.position);
      if (!position) {
        continue;
      }

      const shouldSpawnHere =
        typeof roomSystem?.isPositionWithinGenerationRadius === 'function'
          ? roomSystem.isPositionWithinGenerationRadius(position)
          : true;

      if (!shouldSpawnHere) {
        roomSystem?.scheduleBarrelSpawnPoint?.(spawn);
        continue;
      }

      const barrel = enemyManager?.spawnBarrel?.({
        position,
        onDeath() {
          if (!barrelBestiaryUnlocked) {
            barrelBestiaryUnlocked = true;
            dispatchBestiaryUnlock(eventTarget, 'barrel');
          }
        }
      });

      if (barrel) {
        barrel.spawnContext = {
          type: 'procedural-barrel',
          roomKey: spawn?.key ?? '',
          position
        };
      }
    }
  };

  const spawnProceduralCameras = () => {
    const consumeCameraSpawnPoints = roomSystem?.consumeCameraSpawnPoints;
    if (typeof consumeCameraSpawnPoints !== 'function') {
      return;
    }

    const spawns = consumeCameraSpawnPoints();
    if (!spawns || spawns.length === 0) {
      return;
    }

    for (const spawn of spawns) {
      const position = clonePositionArray(spawn?.position);
      if (!position) {
        continue;
      }

      const shouldSpawnHere =
        typeof roomSystem?.isPositionWithinGenerationRadius === 'function'
          ? roomSystem.isPositionWithinGenerationRadius(position)
          : true;

      if (!shouldSpawnHere) {
        roomSystem?.scheduleCameraSpawnPoint?.(spawn);
        continue;
      }

      const forward = clonePositionArray(spawn?.forward) ?? [0, 0, -1];
      const up = clonePositionArray(spawn?.up) ?? [0, 1, 0];
      const roomBounds = cloneRoomBounds(spawn?.roomBounds);

      const cameraLayerIndex = layerResolver ? layerResolver(position[1]) : null;
      const camera = enemyManager?.spawnSecurityCamera?.({
        position,
        forward,
        up,
        layerResolver,
        layerIndex: cameraLayerIndex,
        roomBounds,
        onDeath() {
          if (!securityCameraBestiaryUnlocked) {
            securityCameraBestiaryUnlocked = true;
            dispatchBestiaryUnlock(eventTarget, 'security-camera');
          }
        }
      });

      if (camera) {
        camera.spawnContext = {
          type: 'procedural-camera',
          roomKey: spawn?.key ?? '',
          position,
          forward,
          up,
          roomBounds
        };
      }
    }
  };

  return {
    requeueProceduralEnemy,
    spawnProceduralBarrels,
    spawnProceduralCameras
  };
}
