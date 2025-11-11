const BASE_PLAYER_STATS = {
  vitality: {
    health: { label: 'Health', current: 22, max: 50 },
    focus: { label: 'Focus', current: 0, max: 20 },
    shield: { label: 'Shield', current: 0, max: 0 }
  },
  attributes: {
    power: { label: 'Power', base: 0 },
    agility: { label: 'Agility', base: 0 },
    resilience: { label: 'Resilience', base: 0 },
    insight: { label: 'Insight', base: 0 }
  }
};

const GEAR_BONUS_RULES = {
  power: { target: 'attribute', key: 'power' },
  agility: { target: 'attribute', key: 'agility' },
  resilience: { target: 'attribute', key: 'resilience' },
  insight: { target: 'attribute', key: 'insight' },
  'shield capacity': { target: 'vitality', key: 'shield', field: 'max' },
  'shield max': { target: 'vitality', key: 'shield', field: 'max' },
  'max shield': { target: 'vitality', key: 'shield', field: 'max' },
  shield: { target: 'vitality', key: 'shield', field: 'max' },
  health: { target: 'vitality', key: 'health', field: 'max' },
  'max health': { target: 'vitality', key: 'health', field: 'max' },
  'health capacity': { target: 'vitality', key: 'health', field: 'max' },
  focus: { target: 'vitality', key: 'focus', field: 'max' },
  'max focus': { target: 'vitality', key: 'focus', field: 'max' },
  'focus capacity': { target: 'vitality', key: 'focus', field: 'max' }
};

export const STAT_EPSILON = 1e-4;

function parseBonuses(element) {
  const raw = element?.dataset?.bonuses;
  if (!raw) {
    return [];
  }
  return raw
    .split(/[;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [labelPart, valuePart] = entry.split(':');
      const label = labelPart?.trim();
      const value = valuePart?.trim();
      if (!label || !value) {
        return null;
      }
      return { label, value };
    })
    .filter(Boolean);
}

function parseStatAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return NaN;
  }
  const match = value.trim().match(/^([+-]?\d+(?:\.\d+)?)/);
  if (!match) {
    return NaN;
  }
  return Number.parseFloat(match[1]);
}

function applyGearBonus(totals, entry) {
  if (!entry) {
    return;
  }
  const normalized = entry.label.trim().toLowerCase();
  const rule = GEAR_BONUS_RULES[normalized];
  if (!rule) {
    return;
  }
  const amount = parseStatAmount(entry.value);
  if (!Number.isFinite(amount)) {
    return;
  }
  if (rule.target === 'attribute') {
    const stat = totals.attributes[rule.key];
    if (stat) {
      stat.bonus += amount;
    }
    return;
  }
  if (rule.target === 'vitality') {
    const stat = totals.vitality[rule.key];
    if (!stat) {
      return;
    }
    if (rule.field === 'current') {
      stat.bonusCurrent += amount;
    } else if (rule.field === 'both') {
      stat.bonusCurrent += amount;
      stat.bonusMax += amount;
    } else {
      stat.bonusMax += amount;
    }
  }
}

export function computePlayerStatsFromEquipment(equippedSlots) {
  const totals = {
    vitality: {},
    attributes: {}
  };

  for (const [key, stat] of Object.entries(BASE_PLAYER_STATS.vitality)) {
    totals.vitality[key] = {
      label: stat.label,
      current: stat.current,
      max: stat.max,
      bonusCurrent: 0,
      bonusMax: 0,
      totalCurrent: stat.current,
      totalMax: stat.max
    };
  }

  for (const [key, stat] of Object.entries(BASE_PLAYER_STATS.attributes)) {
    totals.attributes[key] = {
      label: stat.label,
      base: stat.base,
      bonus: 0,
      total: stat.base
    };
  }

  for (const slot of equippedSlots || []) {
    if (!slot || slot.dataset.slot === 'empty') {
      continue;
    }
    const bonuses = parseBonuses(slot);
    for (const bonus of bonuses) {
      applyGearBonus(totals, bonus);
    }
  }

  for (const stat of Object.values(totals.vitality)) {
    stat.totalMax = stat.max + stat.bonusMax;
    const baseCurrent = stat.current + stat.bonusCurrent;
    stat.totalCurrent = Math.min(baseCurrent, stat.totalMax);
  }

  for (const stat of Object.values(totals.attributes)) {
    stat.total = stat.base + stat.bonus;
  }

  return totals;
}
