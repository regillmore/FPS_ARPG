import { addBox } from './geometry.js';
import { mixColors } from './color.js';

export function addStorageChest({
  vertices,
  colliders,
  bounds,
  centerX,
  centerZ,
  baseY,
  facing = 'south',
  wallColor,
  accentColor
}) {
  if (!vertices || !bounds) {
    return;
  }

  const bodyHalfWidth = 0.3;
  const bodyHalfDepth = 0.25;
  const bodyHeight = 0.4;
  const lidHeight = 0.1;
  const lidGap = 0.02;

  const bodyColor = mixColors(wallColor, accentColor, 0.25);
  const trimColor = mixColors(wallColor, accentColor, 0.65);
  const lidColor = mixColors(bodyColor, accentColor, 0.35);

  const bodyMinX = centerX - bodyHalfWidth;
  const bodyMaxX = centerX + bodyHalfWidth;
  const bodyMinZ = centerZ - bodyHalfDepth;
  const bodyMaxZ = centerZ + bodyHalfDepth;
  const bodyMinY = baseY + 0.02;
  const bodyMaxY = bodyMinY + bodyHeight;

  addBox(vertices, bodyMinX, bodyMinY, bodyMinZ, bodyMaxX, bodyMaxY, bodyMaxZ, bodyColor, bounds);

  const bandHeight = Math.min(bodyHeight * 0.22, 0.2);
  const bandMinY = bodyMinY + bodyHeight * 0.45;
  const bandMaxY = bandMinY + bandHeight;
  const bandInset = Math.min(bodyHalfWidth, bodyHalfDepth) * 0.2;
  addBox(
    vertices,
    bodyMinX + bandInset,
    bandMinY,
    bodyMinZ + bandInset,
    bodyMaxX - bandInset,
    bandMaxY,
    bodyMaxZ - bandInset,
    trimColor,
    bounds
  );

  const lidMinY = bodyMaxY + lidGap;
  const lidMaxY = lidMinY + lidHeight;
  addBox(vertices, bodyMinX, lidMinY, bodyMinZ, bodyMaxX, lidMaxY, bodyMaxZ, lidColor, bounds);

  const handleWidth = Math.min(bodyHalfWidth * 0.35, 0.28);
  const handleHeight = Math.min(bodyHeight * 0.2, 0.14);
  const handleDepth = Math.min(bodyHalfDepth * 0.45, 0.2);
  const handleMinX = centerX - handleWidth * 0.5;
  const handleMaxX = centerX + handleWidth * 0.5;
  const facingSouth = facing !== 'north';
  const handleMaxZ = facingSouth
    ? bodyMaxZ + handleDepth * 0.4
    : bodyMinZ + handleDepth * 0.6;
  const handleMinZ = handleMaxZ - handleDepth;
  const handleMinY = bodyMinY + bodyHeight * 0.35;
  const handleMaxY = handleMinY + handleHeight;
  addBox(vertices, handleMinX, handleMinY, handleMinZ, handleMaxX, handleMaxY, handleMaxZ, trimColor, bounds);

  const chestBounds = {
    minX: bodyMinX,
    maxX: bodyMaxX,
    minY: bodyMinY,
    maxY: lidMaxY,
    minZ: bodyMinZ,
    maxZ: bodyMaxZ
  };

  const chestCenter = [centerX, (bodyMinY + lidMaxY) * 0.5, centerZ];

  if (colliders) {
    colliders.push({
      minX: chestBounds.minX,
      maxX: chestBounds.maxX,
      minY: chestBounds.minY,
      maxY: chestBounds.maxY,
      minZ: chestBounds.minZ,
      maxZ: chestBounds.maxZ
    });
  }

  return { bounds: chestBounds, center: chestCenter };
}
