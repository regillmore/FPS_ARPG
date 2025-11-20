import { mixColors } from './color.js';
import { addBox, addCollider } from './geometry.js';

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
  profile,
  decorativeLights
}) {
  const width = maxX - minX;
  const depth = maxZ - minZ;
  if (!(width > 0) || !(depth > 0)) {
    return;
  }

  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const elevatorSize = Math.min(width, depth) * 0.62;
  const halfSize = elevatorSize * 0.5;
  const platformMinX = centerX - halfSize;
  const platformMaxX = centerX + halfSize;
  const platformMinZ = centerZ - halfSize;
  const platformMaxZ = centerZ + halfSize;
  const platformHeight = Math.min(Math.max(roomHeight * 0.05, 0.05), 0.1);
  const platformColor = mixColors(profile.floorColor, profile.accentColor, 0.45);
  const trimMargin = 0.05;
  addBox(
    vertices,
    platformMinX + trimMargin / 2,
    baseY - platformHeight - trimMargin,
    platformMinZ + trimMargin / 2,
    platformMaxX + trimMargin / 2,
    baseY,
    platformMaxZ + trimMargin / 2,
    platformColor,
    bounds
  );
  addCollider(colliders, platformMinX, baseY - platformHeight - trimMargin, platformMinZ, platformMaxX, baseY, platformMaxZ);

  const trimHeight = Math.min(platformHeight * 0.5, 0.07);
  if (trimHeight > 1e-3) {
    const trimColor = mixColors(profile.floorColor, profile.ceilingColor, 0.4);
    addBox(
      vertices,
      platformMinX - trimMargin,
      baseY - trimHeight - trimMargin,
      platformMinZ - trimMargin,
      platformMaxX + trimMargin,
      baseY - trimMargin,
      platformMaxZ + trimMargin,
      trimColor,
      bounds
    );
  }

  const railThickness = Math.min(Math.max(elevatorSize * 0.08, wallThickness * 0.5), wallThickness * 1.4);
  const railMinY = baseY - trimMargin;
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
    addCollider(colliders, px - trimMargin, postMinY, pz - trimMargin, px + postThickness + trimMargin, postMaxY, pz + postThickness + trimMargin);
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
  addCollider(colliders, platformMinX + canopyInset, canopyMinY, platformMinZ + canopyInset, platformMaxX - canopyInset, canopyMaxY, platformMaxZ - canopyInset);

  const indicatorWidth = Math.min(wallThickness * 1.1, elevatorSize * 0.18);
  const indicatorDepth = Math.min(railThickness * 0.85, 0.14);
  const indicatorHeight = Math.min(Math.max(roomHeight * 0.25, 0.6), roomHeight - 0.4);
  const indicatorMinY = baseY + roomHeight * 0.15;
  const indicatorMaxY = indicatorMinY + Math.min(indicatorHeight, roomHeight - 0.5);
  const indicatorMinX = platformMaxX - railThickness + indicatorDepth * 0.2 - trimMargin;
  const indicatorMaxX = indicatorMinX + indicatorDepth;
  const indicatorMinZ = centerZ - indicatorWidth * 0.5;
  const indicatorMaxZ = indicatorMinZ + indicatorWidth;
  const indicatorColor = mixColors(profile.accentColor, profile.ceilingColor, 0.5);
  addBox(
    vertices,
    indicatorMinX,
    indicatorMinY,
    indicatorMinZ,
    indicatorMaxX,
    indicatorMaxY,
    indicatorMaxZ,
    indicatorColor,
    bounds
  );

  const indicatorHeight = indicatorMaxY - indicatorMinY;
  const buttonHeight = Math.min(Math.max(indicatorHeight * 0.32, 0.16), indicatorHeight * 0.6);
  const buttonMinY = indicatorMinY + indicatorHeight * 0.32;
  const buttonMaxY = Math.min(indicatorMaxY - indicatorHeight * 0.12, buttonMinY + buttonHeight);
  const buttonInsetZ = Math.min(indicatorWidth * 0.1, 0.06);
  const buttonMinZ = indicatorMinZ + buttonInsetZ;
  const buttonMaxZ = indicatorMaxZ - buttonInsetZ;
  const buttonDepth = Math.min(indicatorDepth * 0.75, 0.1);
  const buttonMaxX = indicatorMaxX + Math.min(indicatorDepth * 0.65, 0.05);
  const buttonMinX = buttonMaxX - buttonDepth;

  const buttonPlateColor = mixColors(profile.wallColor, profile.accentColor, 0.45);
  addBox(
    vertices,
    buttonMinX - buttonDepth * 0.35,
    buttonMinY,
    buttonMinZ,
    buttonMaxX,
    buttonMaxY,
    buttonMaxZ,
    buttonPlateColor,
    bounds
  );

  const buttonColor = mixColors(profile.accentColor, [1, 0.85, 0.58], 0.6);
  const buttonGlowColor = [buttonColor[0], buttonColor[1], buttonColor[2], 2.8];
  addBox(
    vertices,
    buttonMinX,
    buttonMinY + buttonHeight * 0.12,
    buttonMinZ + buttonInsetZ * 0.25,
    buttonMaxX,
    buttonMaxY - buttonHeight * 0.12,
    buttonMaxZ - buttonInsetZ * 0.25,
    buttonGlowColor,
    bounds
  );

  const buttonCenter = [
    (buttonMinX + buttonMaxX) * 0.5,
    (buttonMinY + buttonMaxY) * 0.5,
    (buttonMinZ + buttonMaxZ) * 0.5
  ];

  if (Array.isArray(decorativeLights)) {
    decorativeLights.push({
      position: new Float32Array([buttonCenter[0], buttonCenter[1], buttonCenter[2], 1.0]),
      color: new Float32Array([buttonColor[0], buttonColor[1], buttonColor[2], 2.4]),
      direction: new Float32Array([-1, 0, 0, 0])
    });
  }

  return {
    buttonBounds: {
      minX: buttonMinX,
      maxX: buttonMaxX,
      minY: buttonMinY,
      maxY: buttonMaxY,
      minZ: buttonMinZ,
      maxZ: buttonMaxZ
    },
    buttonCenter,
    buttonColor
  };
}
