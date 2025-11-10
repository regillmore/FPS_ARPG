import { createTargetDummy } from './targetDummy.js';

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

  function spawnTargetDummy(options) {
    return addEnemy(createTargetDummy(device, options));
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
    update,
    getEnemies,
    getHitBoxes,
    dispose
  };
}
