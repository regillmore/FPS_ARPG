import { createTargetDummy } from './targetDummy.js';

export function createEnemyManager(device) {
  if (!device) {
    throw new Error('A GPUDevice is required to create enemies.');
  }

  const enemies = [];

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
    dispose
  };
}
