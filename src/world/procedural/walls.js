import { addBox, addCollider } from './geometry.js';

export function buildSolidWallAlongX(
  vertices,
  wallX,
  minZ,
  maxZ,
  height,
  color,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const halfThickness = thickness * 0.5;
  const minX = wallX - halfThickness;
  const maxX = wallX + halfThickness;
  addBox(vertices, minX, baseY, minZ, maxX, baseY + height, maxZ, color, bounds);
  addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, maxZ);
}

export function buildSolidWallAlongZ(
  vertices,
  wallZ,
  minX,
  maxX,
  height,
  color,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const halfThickness = thickness * 0.5;
  const minZ = wallZ - halfThickness;
  const maxZ = wallZ + halfThickness;
  addBox(vertices, minX, baseY, minZ, maxX, baseY + height, maxZ, color, bounds);
  addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, maxZ);
}

export function buildDoorwayAlongX(
  vertices,
  wallX,
  minZ,
  maxZ,
  height,
  doorHeight,
  doorWidth,
  wallColor,
  accentColor,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const openingCenter = (minZ + maxZ) * 0.5;
  const halfOpening = Math.min(doorWidth * 0.5, (maxZ - minZ) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;
  const halfThickness = thickness * 0.5;
  const minX = wallX - halfThickness;
  const maxX = wallX + halfThickness;

  if (openingMin > minZ) {
    addBox(vertices, minX, baseY, minZ, maxX, baseY + height, openingMin, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, openingMin);
  }

  if (openingMax < maxZ) {
    addBox(vertices, minX, baseY, openingMax, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, openingMax, maxX, baseY + height, maxZ);
  }

  if (doorHeight < height - 1e-5) {
    const doorwayMinY = baseY + doorHeight;
    addBox(
      vertices,
      minX,
      doorwayMinY,
      openingMin,
      maxX,
      baseY + height,
      openingMax,
      accentColor,
      bounds
    );
    addCollider(colliders, minX, doorwayMinY, openingMin, maxX, baseY + height, openingMax);
  }
}

export function buildDoorwayAlongZ(
  vertices,
  wallZ,
  minX,
  maxX,
  height,
  doorHeight,
  doorWidth,
  wallColor,
  accentColor,
  bounds,
  thickness,
  colliders,
  baseY = 0
) {
  const openingCenter = (minX + maxX) * 0.5;
  const halfOpening = Math.min(doorWidth * 0.5, (maxX - minX) * 0.45);
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;
  const halfThickness = thickness * 0.5;
  const minZ = wallZ - halfThickness;
  const maxZ = wallZ + halfThickness;

  if (openingMin > minX) {
    addBox(vertices, minX, baseY, minZ, openingMin, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, openingMin, baseY + height, maxZ);
  }

  if (openingMax < maxX) {
    addBox(vertices, openingMax, baseY, minZ, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, openingMax, baseY, minZ, maxX, baseY + height, maxZ);
  }

  if (doorHeight < height - 1e-5) {
    const doorwayMinY = baseY + doorHeight;
    addBox(
      vertices,
      openingMin,
      doorwayMinY,
      minZ,
      openingMax,
      baseY + height,
      maxZ,
      accentColor,
      bounds
    );
    addCollider(colliders, openingMin, doorwayMinY, minZ, openingMax, baseY + height, maxZ);
  }
}
