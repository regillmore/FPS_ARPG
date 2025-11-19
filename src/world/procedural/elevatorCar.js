import { mixColors } from './color.js';
import { addBox, addCollider } from './geometry.js';

export function getElevatorPanelLayout({
  minX,
  maxX,
  minZ,
  maxZ,
  baseY,
  roomHeight,
  wallThickness
}) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (!(width > 0) || !(depth > 0)) {
    return null;
  }

  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const elevatorSize = Math.min(width, depth) * 0.62;
  const halfSize = elevatorSize * 0.5;
  const platformMinX = centerX - halfSize;
  const platformMaxX = centerX + halfSize;
  const platformMinZ = centerZ - halfSize;
  const platformMaxZ = centerZ + halfSize;
  const trimMargin = 0.05;
  const railThickness = Math.min(Math.max(elevatorSize * 0.08, wallThickness * 0.5), wallThickness * 1.4);
  const indicatorWidth = Math.min(wallThickness * 1.1, elevatorSize * 0.18);
  const indicatorDepth = Math.min(railThickness * 0.85, 0.14);
  const indicatorHeight = Math.min(Math.max(roomHeight * 0.25, 0.6), roomHeight - 0.4);
  const indicatorMinY = baseY + roomHeight * 0.15;
  const indicatorMaxY = indicatorMinY + Math.min(indicatorHeight, roomHeight - 0.5);
  const indicatorMinX = platformMaxX - railThickness + indicatorDepth * 0.2 - trimMargin;
  const indicatorMaxX = indicatorMinX + indicatorDepth;
  const indicatorMinZ = centerZ - indicatorWidth * 0.5;
  const indicatorMaxZ = indicatorMinZ + indicatorWidth;
  const totalIndicatorHeight = Math.max(indicatorMaxY - indicatorMinY, 0);
  const buttonGap = Math.min(totalIndicatorHeight * 0.1, 0.02);
  const buttonHeight = Math.max((totalIndicatorHeight - buttonGap) * 0.5, 0);
  const downButtonMaxY = indicatorMinY + buttonHeight;
  const upButtonMinY = indicatorMaxY - buttonHeight;

  return {
    platformMinX,
    platformMaxX,
    platformMinZ,
    platformMaxZ,
    centerX,
    centerZ,
    elevatorSize,
    trimMargin,
    railThickness,
    indicator: {
      minX: indicatorMinX,
      maxX: indicatorMaxX,
      minY: indicatorMinY,
      maxY: indicatorMaxY,
      minZ: indicatorMinZ,
      maxZ: indicatorMaxZ
    },
    buttons: {
      up: {
        minX: indicatorMinX,
        maxX: indicatorMaxX,
        minY: upButtonMinY,
        maxY: indicatorMaxY,
        minZ: indicatorMinZ,
        maxZ: indicatorMaxZ
      },
      down: {
        minX: indicatorMinX,
        maxX: indicatorMaxX,
        minY: indicatorMinY,
        maxY: downButtonMaxY,
        minZ: indicatorMinZ,
        maxZ: indicatorMaxZ
      }
    }
  };
}

export function buildElevatorCar({
  vertices,
  colliders,
  bounds,
  minX,
  maxX,
  minZ,
  maxZ,
  baseY,
  roomHeight,
  wallThickness,
  profile
}) {
  const layout = getElevatorPanelLayout({
    minX,
    maxX,
    minZ,
    maxZ,
    baseY,
    roomHeight,
    wallThickness
  });

  if (!layout) {
    return;
  }

  const {
    platformMinX,
    platformMaxX,
    platformMinZ,
    platformMaxZ,
    elevatorSize,
    trimMargin,
    railThickness,
    indicator
  } = layout;

  const platformHeight = Math.min(Math.max(roomHeight * 0.05, 0.05), 0.1);
  const platformColor = mixColors(profile.floorColor, profile.accentColor, 0.45);
  addBox(
    vertices,
    platformMinX + trimMargin / 2,
    baseY - platformHeight,
    platformMinZ + trimMargin / 2,
    platformMaxX + trimMargin / 2,
    baseY + 0.01,
    platformMaxZ + trimMargin / 2,
    platformColor,
    bounds
  );
  addCollider(colliders, platformMinX, baseY - platformHeight, platformMinZ, platformMaxX, baseY, platformMaxZ);

  const trimHeight = Math.min(platformHeight * 0.5, 0.07);
  if (trimHeight > 1e-3) {
    const trimColor = mixColors(profile.floorColor, profile.ceilingColor, 0.4);
    addBox(
      vertices,
      platformMinX - trimMargin,
      baseY - trimHeight,
      platformMinZ - trimMargin,
      platformMaxX + trimMargin,
      baseY,
      platformMaxZ + trimMargin,
      trimColor,
      bounds
    );
  }

  const railMinY = baseY;
  const railMaxY = Math.min(baseY + roomHeight - 0.25, railMinY + Math.max(roomHeight * 0.6, 1.2));
  const railColor = mixColors(profile.wallColor, profile.accentColor, 0.55);

  // East and west rails leave openings toward the doorways on the north/south axis.
  addBox(
    vertices,
    platformMaxX - railThickness,
    railMinY,
    platformMinZ,
    platformMaxX,
    railMaxY,
    platformMaxZ,
    railColor,
    bounds
  );
  addCollider(colliders, platformMaxX - railThickness, railMinY, platformMinZ, platformMaxX, railMaxY, platformMaxZ);
  addBox(
    vertices,
    platformMinX,
    railMinY,
    platformMinZ,
    platformMinX + railThickness,
    railMaxY,
    platformMaxZ,
    railColor,
    bounds
  );
  addCollider(colliders, platformMinX, railMinY, platformMinZ, platformMinX + railThickness, railMaxY, platformMaxZ);

  const postThickness = Math.min(Math.max(elevatorSize * 0.06, 0.08), railThickness);
  const postColor = mixColors(profile.wallColor, profile.ceilingColor, 0.55);
  const postMinY = railMinY;
  const postMaxY = Math.min(baseY + roomHeight - 0.15, railMaxY + Math.max(roomHeight * 0.2, 0.6));
  const postPositions = [
    [platformMinX, platformMinZ],
    [platformMinX, platformMaxZ - postThickness],
    [platformMaxX - postThickness, platformMinZ],
    [platformMaxX - postThickness, platformMaxZ - postThickness]
  ];
  for (const [px, pz] of postPositions) {
    addBox(
      vertices,
      px - trimMargin,
      postMinY,
      pz - trimMargin,
      px + postThickness + trimMargin,
      postMaxY,
      pz + postThickness + trimMargin,
      postColor,
      bounds
    );
    addCollider(colliders, px, postMinY, pz, px + postThickness, postMaxY, pz + postThickness);
  }

  const canopyMinY = Math.max(postMaxY + 0.05, baseY + roomHeight * 0.7);
  const canopyMaxY = Math.min(canopyMinY + Math.min(roomHeight * 0.08, 0.2), baseY + roomHeight - 0.05);
  const canopyInset = Math.min(elevatorSize * 0.08, wallThickness * 0.6);
  const canopyColor = mixColors(profile.ceilingColor, profile.accentColor, 0.55);
  addBox(
    vertices,
    platformMinX + canopyInset,
    canopyMinY,
    platformMinZ + canopyInset,
    platformMaxX - canopyInset,
    canopyMaxY,
    platformMaxZ - canopyInset,
    canopyColor,
    bounds
  );

  const indicatorColor = mixColors(profile.accentColor, profile.ceilingColor, 0.5);
  if (indicator) {
    addBox(
      vertices,
      indicator.minX,
      indicator.minY,
      indicator.minZ,
      indicator.maxX,
      indicator.maxY,
      indicator.maxZ,
      indicatorColor,
      bounds
    );
  }
}
