import { setupPauseMenu } from './ui/pauseMenu.js';
import { createExperienceTracker } from './game/experience.js';
import { createHudController } from './game/ui/hudController.js';
import { createOverlayController } from './game/ui/overlayController.js';
import { createInventoryManager } from './game/inventory/inventoryManager.js';
import { initializeGame } from './game/initGame.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const overlayElement = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  const itemPopover = document.getElementById('item-detail-popover');
  const hudLayer = document.getElementById('hud');

  if (!canvas) {
    throw new Error('Failed to find the rendering canvas.');
  }

  const pauseControls = setupPauseMenu({ canvas, overlay: overlayElement, pauseMenu, itemPopover });
  pauseControls.setPaused(true);

  const experienceTracker = createExperienceTracker();
  const hudController = createHudController({
    hudLayer,
    pauseControls,
    experienceTracker
  });
  const overlayController = createOverlayController({ overlayElement });
  const inventoryManager = createInventoryManager();

  await initializeGame({
    canvas,
    pauseControls,
    hudController,
    overlayController,
    experienceTracker,
    inventoryManager
  });
}

main();
