import { mat4FromRotationTranslation } from '../math.js';

const RIGHT_AXIS = new Float32Array([1, 0, 0]);
const UP_AXIS = new Float32Array([0, 1, 0]);
const FORWARD_AXIS = new Float32Array([0, 0, 1]);
const FLOATS_PER_VERTEX = 10;

const DEFAULT_RARITY_DEFINITIONS = Object.freeze({
  common: { label: 'Common', color: [0.78, 0.78, 0.82] },
  uncommon: { label: 'Uncommon', color: [0.42, 0.86, 0.58] },
  rare: { label: 'Rare', color: [0.42, 0.62, 0.95] },
  epic: { label: 'Epic', color: [0.72, 0.44, 0.92] },
  legendary: { label: 'Legendary', color: [0.95, 0.78, 0.38] }
});

function clamp01(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function mixColors(a, b, t) {
  const weight = clamp01(t);
  const keep = 1 - weight;
  const ax = Array.isArray(a) ? a : [0, 0, 0];
  const bx = Array.isArray(b) ? b : [0, 0, 0];
  return [
    clamp01(ax[0] * keep + bx[0] * weight),
    clamp01(ax[1] * keep + bx[1] * weight),
    clamp01(ax[2] * keep + bx[2] * weight)
  ];
}

function createBoxVertices(bounds, faceColors) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;
  const faces = [
    {
      normal: [0, 1, 0],
      color: faceColors.top,
      corners: [
        [minX, maxY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, -1, 0],
      color: faceColors.bottom,
      corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [minX, minY, minZ]
      ]
    },
    {
      normal: [1, 0, 0],
      color: faceColors.side,
      corners: [
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ]
      ]
    },
    {
      normal: [-1, 0, 0],
      color: faceColors.side,
      corners: [
        [minX, minY, maxZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [minX, maxY, maxZ]
      ]
    },
    {
      normal: [0, 0, 1],
      color: faceColors.side,
      corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    },
    {
      normal: [0, 0, -1],
      color: faceColors.side,
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

function pushFace(target, corners, normal, color) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, normal, color);
  pushVertex(target, c, normal, color);
  pushVertex(target, b, normal, color);
  pushVertex(target, a, normal, color);
  pushVertex(target, d, normal, color);
  pushVertex(target, c, normal, color);
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

function createPickupGeometry(device, accentColor) {
  const mainColor = [0.88, 0.9, 0.94];
  const bottomColor = [0.28, 0.3, 0.34];
  const accent = Array.isArray(accentColor) && accentColor.length >= 3 ? accentColor : mainColor;
  const accentSide = mixColors(mainColor, accent, 0.5);
  const accentBottom = mixColors(bottomColor, accent, 0.4);

  const baseBounds = {
    minX: -0.26,
    maxX: 0.26,
    minY: 0.0,
    maxY: 0.12,
    minZ: -0.26,
    maxZ: 0.26
  };

  const accentBounds = {
    minX: -0.22,
    maxX: 0.22,
    minY: 0.12,
    maxY: 0.18,
    minZ: -0.22,
    maxZ: 0.22
  };

  const vertices = [];
  vertices.push(
    ...createBoxVertices(baseBounds, {
      top: mixColors(mainColor, accent, 0.2),
      bottom: bottomColor,
      side: mixColors(mainColor, accent, 0.15)
    })
  );
  vertices.push(
    ...createBoxVertices(accentBounds, {
      top: accent,
      bottom: accentBottom,
      side: accentSide
    })
  );

  const vertexData = new Float32Array(vertices);
  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  const combinedBounds = {
    minX: Math.min(baseBounds.minX, accentBounds.minX),
    maxX: Math.max(baseBounds.maxX, accentBounds.maxX),
    minY: Math.min(baseBounds.minY, accentBounds.minY),
    maxY: Math.max(baseBounds.maxY, accentBounds.maxY),
    minZ: Math.min(baseBounds.minZ, accentBounds.minZ),
    maxZ: Math.max(baseBounds.maxZ, accentBounds.maxZ)
  };

  return {
    vertexBuffer,
    vertexCount: vertexData.length / FLOATS_PER_VERTEX,
    bounds: combinedBounds
  };
}

function normalizeRarityId(rarity) {
  if (typeof rarity !== 'string') {
    return 'common';
  }
  const normalized = rarity.trim().toLowerCase();
  return normalized.length > 0 ? normalized : 'common';
}

export function getRarityDefinition(rarity) {
  const key = normalizeRarityId(rarity);
  return DEFAULT_RARITY_DEFINITIONS[key] || DEFAULT_RARITY_DEFINITIONS.common;
}

export function getRarityColor(rarity) {
  const definition = getRarityDefinition(rarity);
  return [...definition.color];
}

export function getRarityLabel(rarity) {
  const definition = getRarityDefinition(rarity);
  return definition.label;
}

export function createWorldItemManager(device) {
  if (!device) {
    throw new Error('GPUDevice is required to create world items.');
  }

  const items = [];
  const geometryCache = new Map();

  const getGeometryForColor = (color) => {
    const key = color.map((component) => component.toFixed(4)).join(',');
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = createPickupGeometry(device, color);
      geometryCache.set(key, geometry);
    }
    return geometry;
  };

  const toWorldBounds = (localBounds, translation) => ({
    minX: localBounds.minX + translation[0],
    maxX: localBounds.maxX + translation[0],
    minY: localBounds.minY + translation[1],
    maxY: localBounds.maxY + translation[1],
    minZ: localBounds.minZ + translation[2],
    maxZ: localBounds.maxZ + translation[2]
  });

  const computeCenter = (bounds) =>
    new Float32Array([
      (bounds.minX + bounds.maxX) * 0.5,
      (bounds.minY + bounds.maxY) * 0.5,
      (bounds.minZ + bounds.maxZ) * 0.5
    ]);

  function spawnPickup(options = {}) {
    const rarity = normalizeRarityId(options.rarity);
    const rarityColor = getRarityColor(rarity);
    const geometry = getGeometryForColor(rarityColor);
    const translation = new Float32Array([
      Number(options.position?.[0]) || 0,
      Number(options.position?.[1]) || 0,
      Number(options.position?.[2]) || 0
    ]);
    const modelMatrix = new Float32Array(16);
    mat4FromRotationTranslation(modelMatrix, RIGHT_AXIS, UP_AXIS, FORWARD_AXIS, translation);
    const worldBounds = toWorldBounds(geometry.bounds, translation);

    const item = {
      id: options.id || `pickup-${Date.now()}-${items.length}`,
      itemId: options.itemId || '',
      displayName: options.displayName || 'Pickup',
      rarity,
      rarityLabel: getRarityLabel(rarity),
      accentColor: rarityColor,
      vertexBuffer: geometry.vertexBuffer,
      vertexCount: geometry.vertexCount,
      modelMatrix,
      bounds: worldBounds,
      center: computeCenter(worldBounds),
      payload: options.payload ?? null,
      inventory: options.inventory ?? null
    };

    items.push(item);
    return item;
  }

  function removeItem(item) {
    if (!item) {
      return false;
    }
    const index = items.indexOf(item);
    if (index === -1) {
      return false;
    }
    const [removed] = items.splice(index, 1);
    removed?.destroy?.();
    return true;
  }

  function getItems() {
    return items;
  }

  function dispose() {
    while (items.length > 0) {
      const entry = items.pop();
      entry?.destroy?.();
    }
    for (const geometry of geometryCache.values()) {
      geometry.vertexBuffer.destroy?.();
    }
    geometryCache.clear();
  }

  return {
    spawnPickup,
    removeItem,
    getItems,
    dispose
  };
}
