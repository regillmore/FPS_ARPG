import { createBarrel } from './barrel.js';

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

  function update(deltaTime, context = null) {
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      if (!enemy) {
        enemies.splice(i, 1);
        continue;
      }

      enemy.update?.(deltaTime, context);

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
    spawnBarrel,
    update,
    getEnemies,
    getHitBoxes,
    removeEnemy,
    dispose
  };
}
