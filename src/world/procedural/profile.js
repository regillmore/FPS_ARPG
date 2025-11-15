import {
  BASE_ACCENT_COLOR,
  BASE_CEILING_COLOR,
  BASE_FLOOR_COLOR,
  BASE_WALL_COLOR
} from './constants.js';
import { clamp01, shiftColor } from './color.js';
import { randomFloatForCell, randomFloatForEdge } from './random.js';

export function createCellProfile(x, z, seed = 0) {
  const openness = randomFloatForCell(x, z, 11, seed);
  const toneOffset = (randomFloatForCell(x, z, 23, seed) - 0.5) * 0.18;
  const wallShift = (randomFloatForCell(x, z, 31, seed) - 0.5) * 0.14;
  const accentShift = (randomFloatForCell(x, z, 47, seed) - 0.5) * 0.2;

  return {
    openness,
    floorColor: shiftColor(BASE_FLOOR_COLOR, toneOffset),
    ceilingColor: shiftColor(BASE_CEILING_COLOR, toneOffset * 0.6),
    wallColor: shiftColor(BASE_WALL_COLOR, wallShift),
    accentColor: shiftColor(BASE_ACCENT_COLOR, accentShift * 0.5)
  };
}

export function createEdgeKey(ax, az, bx, bz) {
  if (ax < bx || (ax === bx && az <= bz)) {
    return `${ax},${az}:${bx},${bz}`;
  }
  return `${bx},${bz}:${ax},${az}`;
}

export function determineEdgeType(ax, az, bx, bz, profiles, seed = 0) {
  const keyA = `${ax},${az}`;
  const keyB = `${bx},${bz}`;
  const profileA = profiles.get(keyA) ?? createCellProfile(ax, az, seed);
  const profileB = profiles.get(keyB) ?? createCellProfile(bx, bz, seed);
  profiles.set(keyA, profileA);
  profiles.set(keyB, profileB);

  const baseRandom = randomFloatForEdge(ax, az, bx, bz, 3, seed);
  const openness = (profileA.openness + profileB.openness) * 0.5;
  const variance = Math.abs(profileA.openness - profileB.openness);
  const openThreshold = clamp01(0.12 + openness * 0.5);
  const doorwayThreshold = clamp01(openThreshold + 0.18 + (1 - variance) * 0.12);

  if (baseRandom < openThreshold) {
    return 'open';
  }
  if (baseRandom < doorwayThreshold) {
    return 'doorway';
  }
  return 'solid';
}
