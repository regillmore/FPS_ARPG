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

  return {
    requeueProceduralEnemy,
    spawnProceduralBarrels
  };
}
