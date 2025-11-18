export function normalizeSpawnPosition(position) {
  if (!position || typeof position !== 'object') {
    return null;
  }
  const source = Array.isArray(position) || ArrayBuffer.isView(position) ? position : null;
  if (!source) {
    return null;
  }
  const px = Number(source[0]);
  const py = Number(source[1]);
  const pz = Number(source[2]);
  if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
    return null;
  }
  return [px, py, pz];
}

export function normalizeDirection(direction, fallback) {
  function tryNormalize(source) {
    if (!source || typeof source !== 'object') {
      return null;
    }
    const arrayLike = Array.isArray(source) || ArrayBuffer.isView(source) ? source : null;
    if (!arrayLike) {
      return null;
    }
    const x = Number(arrayLike[0]);
    const y = Number(arrayLike[1]);
    const z = Number(arrayLike[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return null;
    }
    const length = Math.hypot(x, y, z);
    if (!(length > 1e-5)) {
      return null;
    }
    return [x / length, y / length, z / length];
  }

  return tryNormalize(direction) ?? tryNormalize(fallback) ?? null;
}

export function normalizeRoomBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') {
    return null;
  }

  const minX = Number(bounds.minX);
  const maxX = Number(bounds.maxX);
  const minZ = Number(bounds.minZ);
  const maxZ = Number(bounds.maxZ);

  if (
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minZ) ||
    !Number.isFinite(maxZ)
  ) {
    return null;
  }

  if (minX >= maxX || minZ >= maxZ) {
    return null;
  }

  return {
    minX,
    maxX,
    minZ,
    maxZ
  };
}
