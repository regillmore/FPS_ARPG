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
  onPanelBuilt,
  onBoundsBuilt
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
  const railMinY = baseY - trimMargin;
  const railMaxY = Math.min(baseY + roomHeight - 0.25, railMinY + Math.max(roomHeight * 0.6, 1.2));
  const postMinY = railMinY;
  const postMaxY = Math.min(baseY + roomHeight - 0.15, railMaxY + Math.max(roomHeight * 0.2, 0.6));
  const canopyInset = Math.min(elevatorSize * 0.08, wallThickness * 0.6);
  const canopyMinY = Math.max(postMaxY + 0.05, baseY + roomHeight * 0.7);
  const canopyMaxY = Math.min(canopyMinY + Math.min(roomHeight * 0.08, 0.2), baseY + roomHeight - 0.05);
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

  if (typeof onBoundsBuilt === 'function') {
    onBoundsBuilt({
      minX: platformMinX,
      maxX: platformMaxX,
      minZ: platformMinZ,
      maxZ: platformMaxZ,
      floorY: baseY,
      canopyMinX: platformMinX + canopyInset,
      canopyMaxX: platformMaxX - canopyInset,
      canopyMinZ: platformMinZ + canopyInset,
      canopyMaxZ: platformMaxZ - canopyInset,
      canopyMinY: canopyMinY,
      canopyMaxY: canopyMaxY
    });
  }

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
  const buttonHeight = Math.min(Math.max(indicatorHeight * 0.18, 0.08), indicatorHeight * 0.45);
  const buttonMinY = indicatorMinY + indicatorHeight * 0.4;
  const buttonMaxY = buttonMinY + buttonHeight;
  const buttonInsetX = Math.min(indicatorDepth * 0.35, 0.035);
  const buttonInsetZ = Math.min(indicatorWidth * 0.28, 0.09);

  const buttonBounds = {
    minX: indicatorMinX - buttonInsetX,
    maxX: indicatorMaxX + buttonInsetX,
    minY: buttonMinY,
    maxY: buttonMaxY,
    minZ: indicatorMinZ + buttonInsetZ,
    maxZ: indicatorMaxZ - buttonInsetZ
  };

  const buttonDepth = buttonBounds.maxX - buttonBounds.minX;
  const buttonBaseColor = mixColors(profile.accentColor, profile.wallColor, 0.15);
  const buttonGlowColor = mixColors(profile.accentColor, [1, 0.93, 0.55], 0.7);
  const buttonFaceMinX = buttonBounds.maxX - Math.min(buttonDepth * 0.45, 0.02);

  addBox(
    vertices,
    buttonBounds.minX,
    buttonBounds.minY,
    buttonBounds.minZ,
    buttonBounds.maxX,
    buttonBounds.maxY,
    buttonBounds.maxZ,
    buttonBaseColor,
    bounds
  );

  addBox(
    vertices,
    buttonFaceMinX,
    buttonBounds.minY + buttonHeight * 0.08,
    buttonBounds.minZ + buttonInsetZ * 0.08,
    buttonBounds.maxX + Math.min(buttonDepth * 0.12, 0.01),
    buttonBounds.maxY - buttonHeight * 0.08,
    buttonBounds.maxZ - buttonInsetZ * 0.08,
    buttonGlowColor,
    bounds
  );

  const letterExtrude = Math.min(buttonDepth * 0.35, 0.012);
  const letterMinY = buttonBounds.minY + buttonHeight * 0.14;
  const letterMaxY = buttonBounds.maxY - buttonHeight * 0.14;
  const letterMinZ = buttonBounds.minZ + (buttonBounds.maxZ - buttonBounds.minZ) * 0.18;
  const letterMaxZ = buttonBounds.maxZ - (buttonBounds.maxZ - buttonBounds.minZ) * 0.18;
  const stroke = Math.min((letterMaxY - letterMinY) * 0.18, (letterMaxZ - letterMinZ) * 0.22);
  const letterMinX = buttonBounds.maxX - letterExtrude;
  const letterMaxX = buttonBounds.maxX + Math.min(letterExtrude * 0.6, 0.005);

  const gSegments = [
    // Top bar
    [letterMinX, letterMaxX, letterMaxY - stroke, letterMaxY, letterMinZ, letterMaxZ],
    // Bottom bar
    [letterMinX, letterMaxX, letterMinY, letterMinY + stroke, letterMinZ, letterMaxZ],
    // Left bar
    [letterMinX, letterMaxX, letterMinY, letterMaxY, letterMinZ, letterMinZ + stroke],
    // Upper right bar
    [letterMinX, letterMaxX, letterMinY + (letterMaxY - letterMinY) * 0.48, letterMaxY - stroke * 0.4, letterMaxZ - stroke, letterMaxZ],
    // Middle bar
    [
      letterMinX,
      letterMaxX,
      letterMinY + (letterMaxY - letterMinY) * 0.46,
      letterMinY + (letterMaxY - letterMinY) * 0.46 + stroke,
      letterMinZ + stroke,
      letterMaxZ - stroke * 0.7
    ]
  ];

  for (const [minX, maxX, minY, maxY, minZ, maxZ] of gSegments) {
    addBox(vertices, minX, minY, minZ, maxX, maxY, maxZ, buttonGlowColor, bounds);
  }

  if (typeof onPanelBuilt === 'function') {
    const center = [
      (buttonBounds.minX + buttonBounds.maxX) * 0.5,
      (buttonBounds.minY + buttonBounds.maxY) * 0.5,
      (buttonBounds.minZ + buttonBounds.maxZ) * 0.5
    ];

    onPanelBuilt({ bounds: buttonBounds, center, color: buttonGlowColor });
  }
}
