export const DEFAULT_WEAPON_OFFSET = {
  forward: 0.6,
  right: -0.22,
  up: -0.22
};

export const DEFAULT_WEAPON_ROLL = 0.0;
export const WORLD_UP = [0, 1, 0];
export const PRIMARY_WEAPON_SLOT_SELECTOR =
  '.item-slot[data-slot-kind="gear"][data-slot-allowed="primary"]';

export const DEFAULT_PROJECTILE_SETTINGS = Object.freeze({
  size: 0.075,
  lifetime: 2.0,
  muzzleOffset: 0.9,
  color: [0.9, 0.95, 0.4],
  damage: 6
});

export const MAX_AIM_DISTANCE = 100;
export const DEFAULT_RETICLE_PRIMARY_COLOR = [1, 1, 1];
export const RETICLE_WHITE_BLEND = 0.45;
export const MAX_LIGHTS = 2;
export const AMBIENT_LIGHT = new Float32Array([0.05, 0.055, 0.06]);
export const ITEM_INTERACTION_DISTANCE = 2.25;
export const ITEM_INTERACTION_DISTANCE_SQ = ITEM_INTERACTION_DISTANCE * ITEM_INTERACTION_DISTANCE;
export const ITEM_AIM_MAX_DISTANCE = 4.0;
export const ITEM_INTERACTION_VERTICAL_LIMIT = 1.75;
export const INVENTORY_EMPTY_SLOT_SELECTOR =
  '.item-slot[data-slot-kind="inventory"][data-slot="empty"]';
export const PICKUP_USE_KEY = 'E';
export const PICKUP_PROMPT_SUCCESS_DURATION = 2600;
export const PICKUP_PROMPT_FAILURE_DURATION = 2000;
export const PICKUP_PROMPT_BLOCKED_COLOR = 'rgb(255, 188, 140)';
export const PICKUP_PROMPT_FAILURE_COLOR = 'rgb(255, 128, 128)';

export const ACTIVE_LIGHTS = [
  {
    position: new Float32Array([-2.25, 3.25, -1.75, 1.0]),
    color: new Float32Array([1.0, 0.82, 0.65, 3.2])
  },
  {
    position: new Float32Array([2.5, 2.2, 2.8, 1.0]),
    color: new Float32Array([0.6, 0.8, 1.0, 2.6])
  }
];

export const UNIFORM_FLOAT_COUNT = 52;
export const UNIFORM_BYTE_LENGTH = UNIFORM_FLOAT_COUNT * 4;
export const IDENTITY_MATRIX = new Float32Array([
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1
]);
