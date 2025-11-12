import { createHudReticle } from '../../ui/hudReticle.js';
import { createEnemyHealthBars } from '../../ui/enemyHealthBars.js';
import { createFloatingDamageNumbers } from '../../ui/floatingDamageNumbers.js';
import { createExperienceBar } from '../../ui/experienceBar.js';
import { DEFAULT_RETICLE_PRIMARY_COLOR } from '../constants.js';
import { blendWithWhite } from './colorUtils.js';

export function createHudController({ hudLayer, pauseControls, experienceTracker }) {
  const hudReticle = createHudReticle({ mount: hudLayer });
  const enemyHealthBars = createEnemyHealthBars({ mount: hudLayer });
  const floatingDamageNumbers = createFloatingDamageNumbers({ mount: hudLayer });
  const experienceBar = createExperienceBar({ mount: hudLayer });

  let baseReticlePrimaryColor = DEFAULT_RETICLE_PRIMARY_COLOR;
  let baseReticleAccentColor = blendWithWhite(DEFAULT_RETICLE_PRIMARY_COLOR) ?? DEFAULT_RETICLE_PRIMARY_COLOR;
  let reticleAccentOverride = null;
  let reticleAccentOverrideKey = '';

  const refreshHudReticleTheme = () => {
    if (!hudReticle) {
      return;
    }
    const accent = reticleAccentOverride ?? baseReticleAccentColor;
    hudReticle.setTheme({
      primaryColor: baseReticlePrimaryColor,
      accentColor: accent
    });
  };

  const setBaseReticleTheme = (primaryColor, accentCandidate) => {
    baseReticlePrimaryColor = primaryColor;
    let resolvedAccent = accentCandidate;
    if (!resolvedAccent && Array.isArray(primaryColor)) {
      resolvedAccent = blendWithWhite(primaryColor);
    }
    if (!resolvedAccent) {
      resolvedAccent = blendWithWhite(DEFAULT_RETICLE_PRIMARY_COLOR) ?? DEFAULT_RETICLE_PRIMARY_COLOR;
    }
    baseReticleAccentColor = resolvedAccent;
    refreshHudReticleTheme();
  };

  const setReticleAccentOverride = (color) => {
    const key = color
      ? Array.isArray(color)
        ? color.map((component) => component.toFixed(3)).join(',')
        : String(color)
      : '';
    if (key === reticleAccentOverrideKey) {
      return;
    }
    reticleAccentOverrideKey = key;
    reticleAccentOverride = color
      ? Array.isArray(color)
        ? [...color]
        : color
      : null;
    refreshHudReticleTheme();
  };

  const applyWeaponHudTheme = (weaponDefinition) => {
    if (!hudReticle) {
      return;
    }

    if (!weaponDefinition) {
      hudReticle.setVisible(false);
      setBaseReticleTheme(
        DEFAULT_RETICLE_PRIMARY_COLOR,
        blendWithWhite(DEFAULT_RETICLE_PRIMARY_COLOR)
      );
      return;
    }

    const theme = weaponDefinition.getHudTheme?.() ?? null;
    const primaryColor = theme?.reticlePrimaryColor ?? DEFAULT_RETICLE_PRIMARY_COLOR;
    let accentColor = null;
    if (theme?.reticleAccentColor) {
      accentColor = blendWithWhite(theme.reticleAccentColor);
    }
    setBaseReticleTheme(primaryColor, accentColor);
  };

  const applyExperienceState = (state) => {
    if (!state) {
      return;
    }
    experienceBar?.setState?.(state);
    pauseControls?.setExperience?.(state);
  };

  applyExperienceState(experienceTracker?.getState?.());

  window.addEventListener('player-experience-change', (event) => {
    const state = event?.detail?.state ?? experienceTracker?.getState?.();
    applyExperienceState(state);
  });

  return {
    setWeaponTheme: applyWeaponHudTheme,
    setReticleVisible: (visible) => hudReticle?.setVisible?.(visible),
    setReticleAccentOverride,
    applyExperienceState,
    spawnFloatingDamageNumber: (details) => {
      floatingDamageNumbers?.spawn?.(details);
    },
    updateWorldSpaceUI({ enemies = [], viewProjectionMatrix, viewportWidth, viewportHeight, deltaTime = 0, paused = false }) {
      enemyHealthBars?.update?.({
        enemies,
        viewProjectionMatrix,
        viewportWidth,
        viewportHeight
      });

      floatingDamageNumbers?.update?.({
        deltaTime: paused ? 0 : deltaTime,
        viewProjectionMatrix,
        viewportWidth,
        viewportHeight
      });
    }
  };
}
