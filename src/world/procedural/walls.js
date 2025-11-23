import { addBox, addCollider } from './geometry.js';

export function resolveDoorOpening(min, max, doorWidth, openingCenterBias = 0) {
  const span = max - min;
  const halfOpening = Math.min(doorWidth * 0.5, span * 0.45);
  const halfSpan = span * 0.5;
  const maxBias = Math.max(0, halfSpan - halfOpening);
  const clampedBias = Math.max(-maxBias, Math.min(openingCenterBias, maxBias));
  const openingCenter = (min + max) * 0.5 + clampedBias;
  const openingMin = openingCenter - halfOpening;
  const openingMax = openingCenter + halfOpening;

  return { openingCenter, openingMin, openingMax };
}

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
  baseY = 0,
  openingCenterBias = 0,
  openingOverride = null
  ) {
  const { openingMin, openingMax, openingCenter } =
    openingOverride ?? resolveDoorOpening(minZ, maxZ, doorWidth, openingCenterBias);
  const halfOpening = (openingMax - openingMin) * 0.5;
  const halfThickness = thickness * 0.5;
  const minX = wallX - halfThickness;
  const maxX = wallX + halfThickness;
  const wallTopY = baseY + height;
  const doorwayTopY = Math.min(baseY + doorHeight, wallTopY);
  const availableAboveDoor = Math.max(0, wallTopY - doorwayTopY);
  const frameDepth = Math.min(Math.max(doorWidth * 0.05, 0.05), halfOpening * 0.5);
  const headerThickness = Math.min(Math.max(doorHeight * 0.06, 0.05), availableAboveDoor);
  const headerTopY = doorwayTopY + headerThickness;
  const hasHeader = headerThickness > 1e-5 && headerTopY > doorwayTopY + 1e-5;
  const upperSectionMinY = hasHeader ? headerTopY : doorwayTopY;

  if (openingMin > minZ) {
    addBox(vertices, minX, baseY, minZ, maxX, baseY + height, openingMin, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, maxX, baseY + height, openingMin);
  }

  if (openingMax < maxZ) {
    addBox(vertices, minX, baseY, openingMax, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, openingMax, maxX, baseY + height, maxZ);
  }

  if (frameDepth > 1e-5) {
    addBox(
      vertices,
      minX,
      baseY,
      openingMin,
      maxX,
      doorwayTopY,
      openingMin + frameDepth,
      accentColor,
      bounds
    );
    addBox(
      vertices,
      minX,
      baseY,
      openingMax - frameDepth,
      maxX,
      doorwayTopY,
      openingMax,
      accentColor,
      bounds
    );
  }

  if (doorHeight < height - 1e-5) {
    if (hasHeader) {
      const cappedHeaderTopY = Math.min(headerTopY, wallTopY);
      addBox(
        vertices,
        minX,
        doorwayTopY,
        openingMin,
        maxX,
        cappedHeaderTopY,
        openingMax,
        accentColor,
        bounds
      );
    }

    if (upperSectionMinY < wallTopY - 1e-5) {
      addBox(
        vertices,
        minX,
        upperSectionMinY,
        openingMin,
        maxX,
        wallTopY,
        openingMax,
        accentColor,
        bounds
      );
    }

    addCollider(colliders, minX, doorwayTopY, openingMin, maxX, wallTopY, openingMax);
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
  baseY = 0,
  openingCenterBias = 0,
  openingOverride = null
  ) {
  const { openingMin, openingMax, openingCenter } =
    openingOverride ?? resolveDoorOpening(minX, maxX, doorWidth, openingCenterBias);
  const halfOpening = (openingMax - openingMin) * 0.5;
  const halfThickness = thickness * 0.5;
  const minZ = wallZ - halfThickness;
  const maxZ = wallZ + halfThickness;
  const wallTopY = baseY + height;
  const doorwayTopY = Math.min(baseY + doorHeight, wallTopY);
  const availableAboveDoor = Math.max(0, wallTopY - doorwayTopY);
  const frameDepth = Math.min(Math.max(doorWidth * 0.05, 0.05), halfOpening * 0.5);
  const headerThickness = Math.min(Math.max(doorHeight * 0.06, 0.05), availableAboveDoor);
  const headerTopY = doorwayTopY + headerThickness;
  const hasHeader = headerThickness > 1e-5 && headerTopY > doorwayTopY + 1e-5;
  const upperSectionMinY = hasHeader ? headerTopY : doorwayTopY;

  if (openingMin > minX) {
    addBox(vertices, minX, baseY, minZ, openingMin, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, minX, baseY, minZ, openingMin, baseY + height, maxZ);
  }

  if (openingMax < maxX) {
    addBox(vertices, openingMax, baseY, minZ, maxX, baseY + height, maxZ, wallColor, bounds);
    addCollider(colliders, openingMax, baseY, minZ, maxX, baseY + height, maxZ);
  }

  if (frameDepth > 1e-5) {
    addBox(
      vertices,
      openingMin,
      baseY,
      minZ,
      openingMin + frameDepth,
      doorwayTopY,
      maxZ,
      accentColor,
      bounds
    );
    addBox(
      vertices,
      openingMax - frameDepth,
      baseY,
      minZ,
      openingMax,
      doorwayTopY,
      maxZ,
      accentColor,
      bounds
    );
  }

  if (doorHeight < height - 1e-5) {
    if (hasHeader) {
      const cappedHeaderTopY = Math.min(headerTopY, wallTopY);
      addBox(
        vertices,
        openingMin,
        doorwayTopY,
        minZ,
        openingMax,
        cappedHeaderTopY,
        maxZ,
        accentColor,
        bounds
      );
    }

    if (upperSectionMinY < wallTopY - 1e-5) {
      addBox(
        vertices,
        openingMin,
        upperSectionMinY,
        minZ,
        openingMax,
        wallTopY,
        maxZ,
        accentColor,
        bounds
      );
    }

    addCollider(colliders, openingMin, doorwayTopY, minZ, openingMax, wallTopY, maxZ);
  }
}
