const DEFAULT_LEVEL = 1;
const DEFAULT_EXPERIENCE_CURVE = (level) => {
  const normalizedLevel = Math.max(1, Math.floor(Number(level) || 1));
  const tier = normalizedLevel - 1;
  const base = 120;
  const linear = 45 * tier;
  const quadratic = 18 * tier * tier;
  return Math.max(1, Math.round(base + linear + quadratic));
};

function clampLevel(value) {
  if (!Number.isFinite(value)) {
    return DEFAULT_LEVEL;
  }
  return Math.max(1, Math.floor(value));
}

function toInteger(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.floor(numeric);
}

export function createExperienceTracker(options = {}) {
  const experienceCurve =
    typeof options.experienceCurve === 'function' ? options.experienceCurve : DEFAULT_EXPERIENCE_CURVE;
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;
  const onLevelUp = typeof options.onLevelUp === 'function' ? options.onLevelUp : null;

  let level = clampLevel(options.level ?? DEFAULT_LEVEL);
  let currentXp = Math.max(0, toInteger(options.currentXp));
  let totalXp = options.totalXp != null ? Math.max(0, toInteger(options.totalXp)) : null;

  const getRequirement = (lvl) => {
    const value = experienceCurve(lvl);
    if (!Number.isFinite(value) || value <= 0) {
      return 1;
    }
    return Math.max(1, Math.round(value));
  };

  const getCumulativeXpForLevel = (lvl) => {
    let total = 0;
    for (let i = 1; i < lvl; i += 1) {
      total += getRequirement(i);
    }
    return total;
  };

  const emitChange = (detail) => {
    if (onChange) {
      try {
        onChange(detail);
      } catch (error) {
        console.error('Error in experience change callback:', error);
      }
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('player-experience-change', { detail }));
      if (detail.leveledUpCount > 0) {
        window.dispatchEvent(new CustomEvent('player-level-up', { detail }));
      }
    }

    if (detail.leveledUpCount > 0 && onLevelUp) {
      try {
        onLevelUp(detail);
      } catch (error) {
        console.error('Error in experience level-up callback:', error);
      }
    }
  };

  let xpForNextLevel = getRequirement(level);

  const syncTotals = () => {
    if (totalXp === null) {
      totalXp = getCumulativeXpForLevel(level) + currentXp;
    } else {
      const baseline = getCumulativeXpForLevel(level);
      if (totalXp < baseline) {
        totalXp = baseline;
      }
      if (totalXp < baseline + currentXp) {
        totalXp = baseline + currentXp;
      }
    }
  };

  const normalizeState = () => {
    xpForNextLevel = getRequirement(level);
    let leveledUp = 0;
    while (currentXp >= xpForNextLevel) {
      currentXp -= xpForNextLevel;
      level += 1;
      leveledUp += 1;
      xpForNextLevel = getRequirement(level);
    }
    syncTotals();
    return leveledUp;
  };

  normalizeState();

  const getState = () => ({
    level,
    currentXp,
    requiredXp: xpForNextLevel,
    progress: xpForNextLevel > 0 ? currentXp / xpForNextLevel : 1,
    totalXp
  });

  const addExperience = (amount, context = {}) => {
    const delta = toInteger(amount);
    if (!Number.isFinite(delta) || delta <= 0) {
      return getState();
    }

    currentXp += delta;
    totalXp = (totalXp ?? getCumulativeXpForLevel(level)) + delta;
    const leveledUpCount = normalizeState();

    const detail = {
      state: getState(),
      delta,
      context,
      leveledUpCount
    };
    emitChange(detail);
    return detail.state;
  };

  const setState = (nextState = {}, { silent = false } = {}) => {
    level = clampLevel(nextState.level ?? level);
    currentXp = Math.max(0, toInteger(nextState.currentXp ?? currentXp));
    totalXp =
      nextState.totalXp != null ? Math.max(0, toInteger(nextState.totalXp)) : getCumulativeXpForLevel(level) + currentXp;
    const leveledUpCount = normalizeState();
    const detail = {
      state: getState(),
      delta: 0,
      context: { reason: 'set-state' },
      leveledUpCount
    };
    if (!silent) {
      emitChange(detail);
    }
    return detail.state;
  };

  return {
    addExperience,
    getState,
    setState
  };
}
