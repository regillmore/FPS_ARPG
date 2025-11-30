import { createBarrel } from './barrel.js';
import { createFighter } from './fighter.js';

export function createEnemyManager(device, managerOptions = {}) {
  if (!device) {
    throw new Error('A GPUDevice is required to create enemies.');
  }

  const enemies = [];
  const scratchHitBoxes = [];
  const onEnemyDamaged =
    typeof managerOptions.onEnemyDamaged === 'function' ? managerOptions.onEnemyDamaged : null;
  const onEnemyDeath =
    typeof managerOptions.onEnemyDeath === 'function' ? managerOptions.onEnemyDeath : null;
  const shouldRetainEnemy =
    typeof managerOptions.shouldRetainEnemy === 'function' ? managerOptions.shouldRetainEnemy : null;

  const oppositeDirections = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east'
  };

  function parseRoomKey(roomKey) {
    if (typeof roomKey !== 'string' || roomKey.length === 0) {
      return null;
    }

    const [layerPart, cellPart] = roomKey.split(':');
    if (!cellPart) {
      return null;
    }

    const [cellXPart, cellZPart] = cellPart.split(',');
    const layerIndex = Number(layerPart);
    const cellX = Number(cellXPart);
    const cellZ = Number(cellZPart);

    if (!Number.isInteger(layerIndex) || !Number.isInteger(cellX) || !Number.isInteger(cellZ)) {
      return null;
    }

    return { layerIndex, cellX, cellZ };
  }

  function roomsShareOpenWall(roomAKey, roomBKey, nav, activeDoors = null) {
    if (!nav || typeof nav.getCellEdges !== 'function') {
      return false;
    }

    const roomA = parseRoomKey(roomAKey);
    const roomB = parseRoomKey(roomBKey);
    if (!roomA || !roomB || roomA.layerIndex !== roomB.layerIndex) {
      return false;
    }

    const deltaX = roomB.cellX - roomA.cellX;
    const deltaZ = roomB.cellZ - roomA.cellZ;
    let direction = '';

    if (deltaX === 1 && deltaZ === 0) {
      direction = 'east';
    } else if (deltaX === -1 && deltaZ === 0) {
      direction = 'west';
    } else if (deltaX === 0 && deltaZ === 1) {
      direction = 'south';
    } else if (deltaX === 0 && deltaZ === -1) {
      direction = 'north';
    } else {
      return false;
    }

    const edgesA = nav.getCellEdges(roomA.layerIndex, roomA.cellX, roomA.cellZ);
    const edgesB = nav.getCellEdges(roomB.layerIndex, roomB.cellX, roomB.cellZ);
    if (!edgesA || !edgesB) {
      return false;
    }

    const opposite = oppositeDirections[direction];

    if (edgesA[direction] === 'open' && edgesB[opposite] === 'open') {
      return true;
    }

    const isDoorEdge = edgesA[direction] === 'doorway' && edgesB[opposite] === 'doorway';
    if (!isDoorEdge || !Array.isArray(activeDoors)) {
      return false;
    }

    const doorAnchor = typeof nav.getDoorBetween === 'function'
      ? nav.getDoorBetween(roomA.layerIndex, roomA.cellX, roomA.cellZ, roomB.cellX, roomB.cellZ)
      : null;

    if (!doorAnchor?.id) {
      return false;
    }

    const baseDoorAnchorId = String(doorAnchor.id);
    const matchingDoors = activeDoors.filter((door) => {
      if (!door) {
        return false;
      }

      const doorId = door.id;
      const anchorId = door.anchor?.id;
      const anchorRootId = typeof anchorId === 'string' ? anchorId.split(':')[0] : null;
      const doorRootId = typeof doorId === 'string' ? doorId.split(':')[0] : null;

      return (
        anchorId === doorAnchor.id ||
        doorId === doorAnchor.id ||
        anchorRootId === baseDoorAnchorId ||
        doorRootId === baseDoorAnchorId ||
        (typeof doorId === 'string' && doorId.startsWith(`${baseDoorAnchorId}:`))
      );
    });

    if (matchingDoors.length === 0) {
      return false;
    }

    return matchingDoors.some((door) => {
      if (!door) {
        return false;
      }

      if (door.state === 'open') {
        return true;
      }

      const openAmount = Number(door.openAmount);
      return Number.isFinite(openAmount) && openAmount >= 0.9;
    });
  }

  function alertNearbyIdleFighters(source, context) {
    if (!source?.spawnContext?.roomKey) {
      return;
    }

    const navigation = context?.navigation;

    for (const enemy of enemies) {
      if (!enemy || enemy === source || enemy.type !== 'fighter') {
        continue;
      }

      if (enemy.isAggressive) {
        continue;
      }

      const enemyRoomKey = enemy.spawnContext?.roomKey;
      if (!enemyRoomKey) {
        continue;
      }

      if (enemyRoomKey === source.spawnContext.roomKey) {
        enemy.startAggro?.(context);
        continue;
      }

      if (
        navigation &&
        roomsShareOpenWall(source.spawnContext.roomKey, enemyRoomKey, navigation, context?.activeDoors)
      ) {
        enemy.startAggro?.(context);
      }
    }
  }

  function addEnemy(enemy) {
    if (!enemy) {
      return null;
    }
    enemies.push(enemy);
    return enemy;
  }

  function removeEnemy(enemy) {
    if (!enemy) {
      return false;
    }

    const index = enemies.indexOf(enemy);
    if (index === -1) {
      return false;
    }

    const [removed] = enemies.splice(index, 1);
    removed?.destroy?.();
    return true;
  }

  function spawnTargetDummy(options) {
    return addEnemy(createTargetDummy(device, options));
  }

  function spawnBarrel(options) {
    const { onDeath: userOnDeath, onDamaged: userOnDamaged, experienceReward, ...rest } = options ?? {};
    let barrel = null;
    const rewardXp = Number.isFinite(experienceReward) ? Number(experienceReward) : 35;

    const enemyOptions = {
      ...rest,
      onDeath(details) {
        if (typeof userOnDeath === 'function') {
          try {
            userOnDeath(details);
          } catch (error) {
            console.error('Error while handling barrel death callback:', error);
          }
        }
        removeEnemy(barrel);
        if (onEnemyDeath) {
          try {
            onEnemyDeath({
              enemy: barrel,
              experienceReward: rewardXp,
              context: details?.context ?? null
            });
          } catch (error) {
            console.error('Error while handling global enemy death callback:', error);
          }
        }
      },
      onDamaged(details) {
        if (typeof userOnDamaged === 'function') {
          try {
            userOnDamaged(details);
          } catch (error) {
            console.error('Error while handling barrel damage callback:', error);
          }
        }
        if (onEnemyDamaged) {
          try {
            onEnemyDamaged(details);
          } catch (error) {
            console.error('Error while handling global enemy damage callback:', error);
          }
        }
      }
    };

    barrel = createBarrel(device, enemyOptions);
    if (barrel) {
      barrel.experienceReward = rewardXp;
    }
    return addEnemy(barrel);
  }

  function spawnFighter(options) {
    const { onDeath: userOnDeath, onDamaged: userOnDamaged, experienceReward, ...rest } = options ?? {};
    let fighter = null;
    const rewardXp = Number.isFinite(experienceReward) ? Number(experienceReward) : 50;

    const enemyOptions = {
      ...rest,
      onDeath(details) {
        if (typeof userOnDeath === 'function') {
          try {
            userOnDeath(details);
          } catch (error) {
            console.error('Error while handling fighter death callback:', error);
          }
        }
        removeEnemy(fighter);
        if (onEnemyDeath) {
          try {
            onEnemyDeath({
              enemy: fighter,
              experienceReward: rewardXp,
              context: details?.context ?? null
            });
          } catch (error) {
            console.error('Error while handling global enemy death callback:', error);
          }
        }
      },
      onDamaged(details) {
        if (typeof userOnDamaged === 'function') {
          try {
            userOnDamaged(details);
          } catch (error) {
            console.error('Error while handling fighter damage callback:', error);
          }
        }
        if (details?.wasAggressive === false) {
          alertNearbyIdleFighters(details.enemy, details.context);
        }
        if (onEnemyDamaged) {
          try {
            onEnemyDamaged(details);
          } catch (error) {
            console.error('Error while handling global enemy damage callback:', error);
          }
        }
      }
    };

    fighter = createFighter(device, enemyOptions);
    if (fighter) {
      fighter.experienceReward = rewardXp;
    }
    return addEnemy(fighter);
  }

  function update(deltaTime, context = null) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      if (!enemy) {
        enemies.splice(i, 1);
        continue;
      }

      const wasAggro = enemy.isAggressive;
      enemy.update?.(deltaTime, context);

      if (!wasAggro && enemy.type === 'fighter' && enemy.isAggressive) {
        alertNearbyIdleFighters(enemy, context);
      }

      if (!shouldRetainEnemy) {
        continue;
      }

      let retainEnemy = true;
      try {
        retainEnemy = shouldRetainEnemy(enemy) !== false;
      } catch (error) {
        console.error('Error while evaluating enemy retention callback:', error);
        retainEnemy = true;
      }

      if (!retainEnemy) {
        const [removed] = enemies.splice(i, 1);
        removed?.destroy?.();
      }
    }
  }

  function getEnemies() {
    return enemies;
  }

  function getHitBoxes() {
    scratchHitBoxes.length = 0;

    for (const enemy of enemies) {
      if (!enemy) {
        continue;
      }

      let hitBoxes = null;
      if (typeof enemy.getHitBoxes === 'function') {
        try {
          hitBoxes = enemy.getHitBoxes();
        } catch (error) {
          console.error('Error while retrieving enemy hit boxes:', error);
          hitBoxes = null;
        }
      } else if (enemy.bounds) {
        hitBoxes = [{
          bounds: enemy.bounds,
          onHit: typeof enemy.onHit === 'function' ? enemy.onHit.bind(enemy) : undefined
        }];
      }

      if (!hitBoxes) {
        continue;
      }

      if (!Array.isArray(hitBoxes)) {
        hitBoxes = [hitBoxes];
      }

      for (const hitBox of hitBoxes) {
        if (!hitBox || !hitBox.bounds) {
          continue;
        }
        scratchHitBoxes.push(hitBox);
      }
    }

    return scratchHitBoxes;
  }

  function dispose() {
    while (enemies.length > 0) {
      const enemy = enemies.pop();
      enemy.destroy?.();
    }
  }

  return {
    spawnTargetDummy,
    spawnBarrel,
    spawnFighter,
    update,
    getEnemies,
    getHitBoxes,
    removeEnemy,
    dispose
  };
}
