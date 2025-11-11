import { createTargetDummy } from './targetDummy.js';
import { createBarrel } from './barrel.js';

export function createEnemyManager(device) {
  if (!device) {
    throw new Error('A GPUDevice is required to create enemies.');
  }

  const enemies = [];
  const scratchHitBoxes = [];

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
    const { onDeath: userOnDeath, ...rest } = options ?? {};
    let barrel = null;

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
      }
    };

    barrel = createBarrel(device, enemyOptions);
    return addEnemy(barrel);
  }

  function update(deltaTime) {
    for (const enemy of enemies) {
      enemy.update?.(deltaTime);
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
    update,
    getEnemies,
    getHitBoxes,
    removeEnemy,
    dispose
  };
}
