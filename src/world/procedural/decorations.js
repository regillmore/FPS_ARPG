import { mixColors } from './color.js';
import { addBox } from './geometry.js';

function addLocalBox(
  vertices,
  bounds,
  orientation,
  mountX,
  mountY,
  mountZ,
  localMinX,
  localMaxX,
  localMinY,
  localMaxY,
  localMinZ,
  localMaxZ,
  color
) {
  const minY = mountY + localMinY;
  const maxY = mountY + localMaxY;

  let minX;
  let maxX;
  let minZ;
  let maxZ;

  switch (orientation) {
    case 'north':
      minX = mountX + localMinX;
      maxX = mountX + localMaxX;
      minZ = mountZ + localMinZ;
      maxZ = mountZ + localMaxZ;
      break;
    case 'south':
      minX = mountX + localMinX;
      maxX = mountX + localMaxX;
      minZ = mountZ - localMaxZ;
      maxZ = mountZ - localMinZ;
      break;
    case 'west':
      minX = mountX + localMinZ;
      maxX = mountX + localMaxZ;
      minZ = mountZ + localMinX;
      maxZ = mountZ + localMaxX;
      break;
    case 'east':
      minX = mountX - localMaxZ;
      maxX = mountX - localMinZ;
      minZ = mountZ + localMinX;
      maxZ = mountZ + localMaxX;
      break;
    default:
      return;
  }

  addBox(vertices, minX, minY, minZ, maxX, maxY, maxZ, color, bounds);
}

export function addCagedElectricWallLight(
  vertices,
  bounds,
  direction,
  centerX,
  centerZ,
  baseY,
  roomSize,
  roomHeight,
  wallThickness,
  wallColor,
  accentColor
) {
  if (!vertices || !bounds) {
    return;
  }

  const halfRoom = roomSize * 0.5;
  const epsilon = Math.min(0.01, wallThickness * 0.1);

  let mountX = centerX;
  let mountZ = centerZ;

  switch (direction) {
    case 'north':
      mountZ = centerZ - halfRoom + wallThickness * 0.5 + epsilon;
      break;
    case 'south':
      mountZ = centerZ + halfRoom - wallThickness * 0.5 - epsilon;
      break;
    case 'west':
      mountX = centerX - halfRoom + wallThickness * 0.5 + epsilon;
      break;
    case 'east':
      mountX = centerX + halfRoom - wallThickness * 0.5 - epsilon;
      break;
    default:
      return;
  }

  const minHeight = baseY + Math.max(roomHeight * 0.45, 1.1);
  const maxHeight = baseY + roomHeight - 0.35;
  const mountY = Math.min(maxHeight, Math.max(minHeight, baseY + roomHeight * 0.62));

  const fixtureWidth = Math.min(roomSize * 0.38, 1.0);
  const fixtureHeight = Math.min(roomHeight * 0.5, 0.34);
  const basePlateDepth = Math.min(0.05, Math.max(0.025, wallThickness * 0.5));
  const fixtureDepth = Math.max(basePlateDepth + 0.06, Math.min(0.12, wallThickness * 1.8 + 0.08));

  const halfWidth = fixtureWidth * 0.5;
  const halfHeight = fixtureHeight * 0.5;

  const baseColor = mixColors(wallColor, accentColor, 0.35);
  const steelColor = mixColors(accentColor, [0.18, 0.2, 0.22], 0.4);
  const warmLight = mixColors(accentColor, [1, 0.95, 0.82], 0.75);
  const highlight = mixColors(warmLight, [1, 1, 1], 0.35);

  // Base plate mounted to the wall.
  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -halfWidth,
    halfWidth,
    -halfHeight,
    halfHeight,
    0,
    basePlateDepth,
    baseColor
  );

  // Light core.
  const coreWidth = fixtureWidth * 0.75;
  const coreHeight = fixtureHeight * 0.38;
  const coreHalfWidth = coreWidth * 0.5;
  const coreHalfHeight = coreHeight * 0.5;
  const coreMinZ = basePlateDepth + 0.005;
  const coreMaxZ = coreMinZ + Math.min(fixtureDepth * 0.55, 0.005);

  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -coreHalfWidth,
    coreHalfWidth,
    -coreHalfHeight,
    coreHalfHeight,
    coreMinZ,
    coreMaxZ,
    warmLight
  );

  // Bright highlight towards the front.
  const highlightInset = coreMaxZ + 0.01;
  const highlightDepth = Math.min(fixtureDepth - highlightInset, 0.04);
  if (highlightDepth > 1e-3) {
    addLocalBox(
      vertices,
      bounds,
      direction,
      mountX,
      mountY,
      mountZ,
      -coreHalfWidth * 0.9,
      coreHalfWidth * 0.9,
      -coreHalfHeight * 0.9,
      coreHalfHeight * 0.9,
      highlightInset,
      highlightInset + highlightDepth,
      highlight
    );
  }

  // Cage frame: top and bottom bars.
  const frameDepth = fixtureDepth;
  const frameThickness = Math.min(fixtureWidth * 0.12, 0.045);
  const barThickness = Math.min(fixtureWidth * 0.08, 0.03);

  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -halfWidth,
    halfWidth,
    halfHeight - frameThickness,
    halfHeight,
    basePlateDepth,
    frameDepth,
    steelColor
  );

  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -halfWidth,
    halfWidth,
    -halfHeight,
    -halfHeight + frameThickness,
    basePlateDepth,
    frameDepth,
    steelColor
  );

  // Vertical frame bars.
  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -halfWidth,
    -halfWidth + frameThickness,
    -halfHeight,
    halfHeight,
    basePlateDepth,
    frameDepth,
    steelColor
  );

  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    halfWidth - frameThickness,
    halfWidth,
    -halfHeight,
    halfHeight,
    basePlateDepth,
    frameDepth,
    steelColor
  );

  // Central cage bars.
  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -barThickness * 0.5,
    barThickness * 0.5,
    -halfHeight,
    halfHeight,
    basePlateDepth + 0.01,
    frameDepth,
    steelColor
  );

  addLocalBox(
    vertices,
    bounds,
    direction,
    mountX,
    mountY,
    mountZ,
    -halfWidth + frameThickness,
    halfWidth - frameThickness,
    -barThickness * 0.5,
    barThickness * 0.5,
    basePlateDepth + 0.01,
    frameDepth,
    steelColor
  );
}

