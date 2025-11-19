const FLOATS_PER_VERTEX = 10;

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function normalizeColor(color, fallback) {
  if (!Array.isArray(color) || color.length < 3) {
    return fallback;
  }
  return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2])];
}

function pushVertex(target, position, normal, color) {
  target.push(
    position[0],
    position[1],
    position[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2],
    0
  );
}

function pushFace(target, corners, normal, color) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, d, normal, color);
  pushVertex(target, c, normal, color);
}

function createBoxVertices(bounds, faceColors) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const topColor = faceColors.top ?? faceColors.side ?? faceColors.bottom ?? [1, 1, 1];
  const bottomColor = faceColors.bottom ?? faceColors.side ?? faceColors.top ?? [1, 1, 1];
  const sideColor = faceColors.side ?? topColor;
  const faces = [
    {
      normal: [0, 1, 0],
      color: topColor,
      corners: [
        [minX, maxY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, -1, 0],
      color: bottomColor,
      corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [minX, minY, minZ]
      ]
    },
    {
      normal: [1, 0, 0],
      color: sideColor,
      corners: [
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ]
      ]
    },
    {
      normal: [-1, 0, 0],
      color: sideColor,
      corners: [
        [minX, minY, maxZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 0, 1],
      color: sideColor,
      corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    },
    {
      normal: [0, 0, -1],
      color: sideColor,
      corners: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ]
    }
  ];

  const vertices = [];
  for (const face of faces) {
    pushFace(vertices, face.corners, face.normal, face.color);
  }
  return vertices;
}

function extendBounds(target, bounds) {
  if (!bounds) {
    return;
  }
  target.minX = Math.min(target.minX, bounds.minX);
  target.maxX = Math.max(target.maxX, bounds.maxX);
  target.minY = Math.min(target.minY, bounds.minY);
  target.maxY = Math.max(target.maxY, bounds.maxY);
  target.minZ = Math.min(target.minZ, bounds.minZ);
  target.maxZ = Math.max(target.maxZ, bounds.maxZ);
}

export function createElevatorCar(device, descriptor) {
  if (!device || !descriptor) {
    return null;
  }

  const halfSize = Math.max(0.1, descriptor.halfSize ?? 0.5);
  const platformHeight = Math.max(0.02, descriptor.platformHeight ?? 0.05);
  const trimMargin = Math.max(0, descriptor.trimMargin ?? 0);
  const trimHeight = Math.max(0, descriptor.trimHeight ?? platformHeight * 0.5);
  const railThickness = Math.max(0, descriptor.railThickness ?? 0.05);
  const railMinY = descriptor.railBaseOffset ?? 0;
  const railMaxY = railMinY + Math.max(0, descriptor.railHeight ?? 0);
  const postThickness = Math.max(0, descriptor.postThickness ?? 0.05);
  const postMinY = descriptor.postBaseOffset ?? railMinY;
  const postMaxY = postMinY + Math.max(0, descriptor.postHeight ?? 0);
  const canopyMinY = descriptor.canopyBaseOffset ?? postMaxY;
  const canopyMaxY = canopyMinY + Math.max(0, descriptor.canopyHeight ?? 0);
  const canopyInset = Math.max(0, descriptor.canopyInset ?? 0);
  const indicator = descriptor.indicator || {};
  const indicatorDepth = Math.max(0, indicator.depth ?? 0);
  const indicatorWidth = Math.max(0, indicator.width ?? 0);
  const indicatorHeight = Math.max(0, indicator.height ?? 0);
  const indicatorOffsetX = indicator.offsetX ?? 0;
  const indicatorOffsetZ = indicator.offsetZ ?? 0;
  const indicatorMinX = indicatorOffsetX - indicatorDepth * 0.5;
  const indicatorMaxX = indicatorMinX + indicatorDepth;
  const indicatorMinZ = indicatorOffsetZ - indicatorWidth * 0.5;
  const indicatorMaxZ = indicatorMinZ + indicatorWidth;
  const indicatorMinY = indicator.baseOffset ?? railMinY;
  const indicatorMaxY = indicatorMinY + indicatorHeight;

  const platformMinX = -halfSize;
  const platformMaxX = halfSize;
  const platformMinZ = -halfSize;
  const platformMaxZ = halfSize;

  const vertices = [];
  const localBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  const colors = descriptor.colors ?? {};
  const platformColor = normalizeColor(colors.platform, [0.7, 0.72, 0.75]);
  const trimColor = normalizeColor(colors.trim, [0.55, 0.58, 0.62]);
  const railColor = normalizeColor(colors.rail, [0.45, 0.5, 0.55]);
  const postColor = normalizeColor(colors.post, railColor);
  const canopyColor = normalizeColor(colors.canopy, trimColor);
  const indicatorColor = normalizeColor(colors.indicator, platformColor);

  const pushBox = (bounds, faceColors) => {
    vertices.push(...createBoxVertices(bounds, faceColors));
    extendBounds(localBounds, bounds);
  };

  pushBox(
    {
      minX: platformMinX,
      maxX: platformMaxX,
      minY: -platformHeight,
      maxY: 0,
      minZ: platformMinZ,
      maxZ: platformMaxZ
    },
    { top: platformColor, bottom: platformColor, side: platformColor }
  );

  if (trimMargin > 1e-4 && trimHeight > 1e-4) {
    pushBox(
      {
        minX: platformMinX - trimMargin,
        maxX: platformMaxX + trimMargin,
        minY: -trimHeight,
        maxY: 0,
        minZ: platformMinZ - trimMargin,
        maxZ: platformMaxZ + trimMargin
      },
      { top: trimColor, bottom: trimColor, side: trimColor }
    );
  }

  if (railThickness > 1e-4 && railMaxY > railMinY) {
    pushBox(
      {
        minX: platformMaxX - railThickness,
        maxX: platformMaxX,
        minY: railMinY,
        maxY: railMaxY,
        minZ: platformMinZ,
        maxZ: platformMaxZ
      },
      { side: railColor, top: railColor, bottom: railColor }
    );
    pushBox(
      {
        minX: platformMinX,
        maxX: platformMinX + railThickness,
        minY: railMinY,
        maxY: railMaxY,
        minZ: platformMinZ,
        maxZ: platformMaxZ
      },
      { side: railColor, top: railColor, bottom: railColor }
    );
  }

  if (postThickness > 1e-4 && postMaxY > postMinY) {
    const postPositions = [
      [platformMinX, platformMinZ],
      [platformMinX, platformMaxZ - postThickness],
      [platformMaxX - postThickness, platformMinZ],
      [platformMaxX - postThickness, platformMaxZ - postThickness]
    ];
    for (const [px, pz] of postPositions) {
      pushBox(
        {
          minX: px,
          maxX: px + postThickness,
          minY: postMinY,
          maxY: postMaxY,
          minZ: pz,
          maxZ: pz + postThickness
        },
        { side: postColor, top: postColor, bottom: postColor }
      );
    }
  }

  if (canopyMaxY > canopyMinY) {
    pushBox(
      {
        minX: platformMinX + canopyInset,
        maxX: platformMaxX - canopyInset,
        minY: canopyMinY,
        maxY: canopyMaxY,
        minZ: platformMinZ + canopyInset,
        maxZ: platformMaxZ - canopyInset
      },
      { side: canopyColor, top: canopyColor, bottom: canopyColor }
    );
  }

  if (indicatorDepth > 1e-4 && indicatorWidth > 1e-4 && indicatorHeight > 1e-4) {
    pushBox(
      {
        minX: indicatorMinX,
        maxX: indicatorMaxX,
        minY: indicatorMinY,
        maxY: indicatorMaxY,
        minZ: indicatorMinZ,
        maxZ: indicatorMaxZ
      },
      { side: indicatorColor, top: indicatorColor, bottom: indicatorColor }
    );
  }

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  return {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX,
    floatsPerVertex: FLOATS_PER_VERTEX,
    localBounds
  };
}
