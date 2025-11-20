import { PICKUP_USE_KEY } from '../constants.js';

export function createOverlayController({ overlayElement }) {
  let overlayWeaponLine = null;
  let overlayUseLine = null;
  let persistentUsePrompt = { text: '', color: '' };
  let usePromptTimer = null;
  let usePromptTemporaryActive = false;

  const applyUsePrompt = (text, color) => {
    if (!overlayUseLine) {
      return;
    }
    if (!text) {
      overlayUseLine.textContent = '';
      overlayUseLine.style.display = 'none';
      overlayUseLine.style.removeProperty('color');
      return;
    }
    overlayUseLine.textContent = text;
    overlayUseLine.style.display = '';
    if (color) {
      overlayUseLine.style.color = color;
    } else {
      overlayUseLine.style.removeProperty('color');
    }
  };

  if (overlayElement) {
    overlayElement.innerHTML = `
      <div><strong>WebGPU FPS Prototype</strong></div>
      <div>Click to capture the mouse, then use WASD to move, Shift to sprint, and Space to jump.</div>
      <div>Press Esc to open the pause menu.</div>
      <div>Press ${PICKUP_USE_KEY} to interact with nearby pickups.</div>
      <div data-overlay-role="equipped-weapon"></div>
      <div data-overlay-role="use-prompt" style="display:none;"></div>
    `;
    overlayWeaponLine = overlayElement.querySelector('[data-overlay-role="equipped-weapon"]');
    overlayUseLine = overlayElement.querySelector('[data-overlay-role="use-prompt"]');
  }

  const setEquippedWeaponLabel = (label) => {
    if (!overlayWeaponLine) {
      return;
    }
    if (label) {
      overlayWeaponLine.textContent = `Equipped (Left Mouse): ${label}`;
      overlayWeaponLine.style.display = '';
    } else {
      overlayWeaponLine.textContent = '';
      overlayWeaponLine.style.display = 'none';
    }
  };

  const showPersistentUsePrompt = (text, color) => {
    persistentUsePrompt = { text, color };
    if (!usePromptTemporaryActive) {
      applyUsePrompt(text, color);
    }
  };

  const showTemporaryUsePrompt = (text, color, duration) => {
    if (!overlayUseLine) {
      return;
    }
    applyUsePrompt(text, color);
    usePromptTemporaryActive = true;
    if (usePromptTimer) {
      clearTimeout(usePromptTimer);
    }
    usePromptTimer = window.setTimeout(() => {
      usePromptTemporaryActive = false;
      usePromptTimer = null;
      applyUsePrompt(persistentUsePrompt.text, persistentUsePrompt.color);
    }, Math.max(duration ?? 0, 0));
  };

  const hideUsePrompt = () => {
    persistentUsePrompt = { text: '', color: '' };
    if (usePromptTimer) {
      clearTimeout(usePromptTimer);
      usePromptTimer = null;
    }
    usePromptTemporaryActive = false;
    applyUsePrompt('', '');
  };

  const showOverlayError = (message) => {
    if (!overlayElement) {
      return;
    }
    overlayElement.textContent = message;
    overlayElement.style.display = '';
  };

  return {
    get overlayElement() {
      return overlayElement;
    },
    setEquippedWeaponLabel,
    showPersistentUsePrompt,
    showTemporaryUsePrompt,
    hideUsePrompt,
    showOverlayError
  };
}
