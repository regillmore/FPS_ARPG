export function hashValue(value, salt) {
  let hash = Math.imul(value ^ (salt * 0x9e3779b9), 0x85ebca6b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function hashCoords(x, z, salt = 0, seed = 0) {
  const seedValue = seed >>> 0;
  let hash = 0x811c9dc5 ^ seedValue;
  hash = Math.imul(hash ^ hashValue(x, salt + 1), 0x01000193);
  hash = Math.imul(hash ^ hashValue(z, salt + 2), 0x01000193);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  hash ^= seedValue;
  hash = Math.imul(hash ^ 0x27d4eb2d, 0x165667b1);
  hash ^= hash >>> 15;
  return hash >>> 0;
}

export function randomFloatFromHash(hash) {
  return (hash & 0x00ffffff) / 0x01000000;
}

export function randomFloatForCell(x, z, salt = 0, seed = 0) {
  return randomFloatFromHash(hashCoords(x, z, salt, seed));
}

export function randomFloatForEdge(ax, az, bx, bz, salt = 0, seed = 0) {
  const fromX = Math.min(ax, bx);
  const toX = Math.max(ax, bx);
  const fromZ = Math.min(az, bz);
  const toZ = Math.max(az, bz);
  return randomFloatFromHash(
    hashCoords(fromX * 131 + toX * 137, fromZ * 149 + toZ * 163, salt, seed)
  );
}
