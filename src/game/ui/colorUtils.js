import { RETICLE_WHITE_BLEND } from '../constants.js';

export function blendWithWhite(color, factor = RETICLE_WHITE_BLEND) {
  if (!Array.isArray(color) || color.length < 3) {
    return null;
  }

  const blend = Math.min(Math.max(factor, 0), 1);
  const keep = 1 - blend;
  const r = Number.isFinite(color[0]) ? color[0] : 0;
  const g = Number.isFinite(color[1]) ? color[1] : 0;
  const b = Number.isFinite(color[2]) ? color[2] : 0;
  return [
    Math.min(Math.max(r * keep + blend, 0), 1),
    Math.min(Math.max(g * keep + blend, 0), 1),
    Math.min(Math.max(b * keep + blend, 0), 1)
  ];
}

export function floatColorToCss(color, fallback = '') {
  if (!Array.isArray(color) || color.length < 3) {
    return fallback;
  }

  const clampByte = (value) => Math.round(Math.min(Math.max(Number(value) || 0, 0), 1) * 255);
  const r = clampByte(color[0]);
  const g = clampByte(color[1]);
  const b = clampByte(color[2]);
  return `rgb(${r}, ${g}, ${b})`;
}
