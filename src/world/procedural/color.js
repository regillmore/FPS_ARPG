export function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

export function mixColors(a, b, factor = 0.5) {
  const t = clamp01(factor);
  return [
    clamp01(a[0] * (1 - t) + b[0] * t),
    clamp01(a[1] * (1 - t) + b[1] * t),
    clamp01(a[2] * (1 - t) + b[2] * t)
  ];
}

export function shiftColor(color, amount) {
  return [
    clamp01(color[0] + amount),
    clamp01(color[1] + amount),
    clamp01(color[2] + amount)
  ];
}
