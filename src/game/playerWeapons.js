/**
 * Player weapon definitions and associated reusable geometry data.
 *
 * The module keeps a lightweight registry of weapon definitions that can be
 * queried when spawning the player's loadout.  Each weapon definition may
 * provide a geometry factory that uploads immutable vertex buffers tailored
 * for the shared prototype WebGPU pipeline.
 */

class WeaponDefinition {
  constructor({ id, displayName, description, stats, createGeometry }) {
    if (!id) {
      throw new Error('WeaponDefinition requires a stable `id`.');
    }

    this.id = id;
    this.displayName = displayName ?? id;
    this.description = description ?? '';
    this.stats = Object.freeze({ ...(stats ?? {}) });
    this._createGeometry = createGeometry ?? null;
  }

  /**
    * Uploads a GPU vertex buffer for the weapon if a geometry factory is
    * available.
    *
    * @param {GPUDevice} device - Active WebGPU device.
    * @param {object} [options]
    * @returns {{ vertexBuffer: GPUBuffer, vertexCount: number, bounds: object }|null}
    */
  createGeometry(device, options = {}) {
    if (!this._createGeometry) {
      return null;
    }
    return this._createGeometry(device, options);
  }
}

const weaponRegistry = new Map();

export function registerWeapon(definition) {
  if (!(definition instanceof WeaponDefinition)) {
    throw new TypeError('registerWeapon expects a WeaponDefinition instance.');
  }

  if (weaponRegistry.has(definition.id)) {
    throw new Error(`Weapon with id "${definition.id}" is already registered.`);
  }

  weaponRegistry.set(definition.id, definition);
  return definition;
}

export function getWeapon(id) {
  return weaponRegistry.get(id) ?? null;
}

export function listWeapons() {
  return Array.from(weaponRegistry.values());
}

function pushVertex(target, vertex, color, bounds) {
  const [x, y, z] = vertex;

  target.push(x, y, z, color[0], color[1], color[2]);

  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.minZ = Math.min(bounds.minZ, z);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
  bounds.maxZ = Math.max(bounds.maxZ, z);
}

function pushQuad(target, corners, color, bounds) {
  const [a, b, c, d] = corners;
  pushVertex(target, a, color, bounds);
  pushVertex(target, b, color, bounds);
  pushVertex(target, c, color, bounds);
  pushVertex(target, a, color, bounds);
  pushVertex(target, c, color, bounds);
  pushVertex(target, d, color, bounds);
}

function pushPrism(target, bounds, color, geometryBounds) {
  const { minX, maxX, minY, maxY, minZ, maxZ } = bounds;

  const corners = {
    nbl: [minX, minY, minZ], // near bottom left
    nbr: [maxX, minY, minZ],
    ntl: [minX, maxY, minZ],
    ntr: [maxX, maxY, minZ],
    fbl: [minX, minY, maxZ],
    fbr: [maxX, minY, maxZ],
    ftl: [minX, maxY, maxZ],
    ftr: [maxX, maxY, maxZ]
  };

  // Front (+Z)
  pushQuad(target, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], color, geometryBounds);
  // Back (-Z)
  pushQuad(target, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], color, geometryBounds);
  // Left (-X)
  pushQuad(target, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], color, geometryBounds);
  // Right (+X)
  pushQuad(target, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], color, geometryBounds);
  // Top (+Y)
  pushQuad(target, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], color, geometryBounds);
  // Bottom (-Y)
  pushQuad(target, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], color, geometryBounds);
}

const DEFAULT_PEA_SHOOTER_PALETTE = Object.freeze({
  body: [0.32, 0.82, 0.36],
  barrel: [0.14, 0.45, 0.18],
  grip: [0.18, 0.18, 0.2],
  accent: [0.9, 0.95, 0.4]
});

function normalizeColor(color, fallback) {
  if (!color || !Array.isArray(color)) {
    return [...fallback];
  }
  const [r = fallback[0], g = fallback[1], b = fallback[2]] = color;
  const rValue = Number(r);
  const gValue = Number(g);
  const bValue = Number(b);
  return [
    Number.isFinite(rValue) ? rValue : fallback[0],
    Number.isFinite(gValue) ? gValue : fallback[1],
    Number.isFinite(bValue) ? bValue : fallback[2]
  ];
}

function normalizePeaShooterPalette(overrides = {}) {
  return {
    body: normalizeColor(overrides.body, DEFAULT_PEA_SHOOTER_PALETTE.body),
    barrel: normalizeColor(overrides.barrel, DEFAULT_PEA_SHOOTER_PALETTE.barrel),
    grip: normalizeColor(overrides.grip, DEFAULT_PEA_SHOOTER_PALETTE.grip),
    accent: normalizeColor(overrides.accent, DEFAULT_PEA_SHOOTER_PALETTE.accent)
  };
}

function paletteKey(palette) {
  return Object.values(palette)
    .map((color) => color.map((component) => component.toFixed(6)).join(','))
    .join('|');
}

function buildPeaShooterVertices(palette) {
  const data = [];
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity
  };

  // Grip / magazine well underneath.
  pushPrism(
    data,
    {
      minX: -0.05,
      maxX: 0.05,
      minY: -0.16,
      maxY: -0.04,
      minZ: -0.05,
      maxZ: 0.10
    },
    palette.grip,
    bounds
  );

  // Barrel shroud.
  pushPrism(
    data,
    {
      minX: -0.04,
      maxX: 0.04,
      minY: -0.02,
      maxY: 0.05,
      minZ: 0.25,
      maxZ: 0.45
    },
    palette.barrel,
    bounds
  );

  // Energy cell accent on the left side.
  pushPrism(
    data,
    {
      minX: 0.04,
      maxX: 0.10,
      minY: -0.02,
      maxY: 0.05,
      minZ: -0.10,
      maxZ: 0.10
    },
    palette.accent,
    bounds
  );

  // Receiver/main body.
  pushPrism(
    data,
    {
      minX: -0.08,
      maxX: 0.08,
      minY: -0.04,
      maxY: 0.08,
      minZ: -0.25,
      maxZ: 0.25
    },
    palette.body,
    bounds
  );

  return {
    vertexData: new Float32Array(data),
    bounds
  };
}

const peaShooterVertexCache = new Map();

function getPeaShooterVertexResources(paletteOverrides) {
  const palette = normalizePeaShooterPalette(paletteOverrides);
  const key = paletteKey(palette);
  if (!peaShooterVertexCache.has(key)) {
    const { vertexData, bounds } = buildPeaShooterVertices(palette);
    peaShooterVertexCache.set(key, {
      vertexData,
      bounds: Object.freeze({ ...bounds })
    });
  }
  return peaShooterVertexCache.get(key);
}

export function createWeaponGeometry(device, vertexData, bounds, options = {}) {
  const usage = options.usage ?? (GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage,
    mappedAtCreation: true
  });

  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  return {
    vertexBuffer,
    vertexCount: vertexData.length / 6,
    bounds: { ...bounds }
  };
}

export function createPeaShooterGeometry(device, options = {}) {
  const { palette: paletteOverrides, ...rest } = options;
  const { vertexData, bounds } = getPeaShooterVertexResources(paletteOverrides);
  return createWeaponGeometry(device, vertexData, bounds, rest);
}

export const PeaShooter = registerWeapon(
  new WeaponDefinition({
    id: 'pea-shooter',
    displayName: 'Pea Shooter',
    description: 'Reliable starter rifle that fires condensed plasma “peas.”',
    stats: {
      baseDamage: 6,
      rateOfFire: 4.5,
      muzzleVelocity: 38,
      magazineSize: 18,
      reloadTime: 1.6,
      projectileColor: [0.9, 0.95, 0.4],
      projectileSize: 0.08,
      projectileLifetime: 2.25,
      projectileMuzzleOffset: 0.9
    },
    createGeometry: (device, options) => createPeaShooterGeometry(device, options)
  })
);

const PEA_SHOOTER_II_PALETTE = Object.freeze({
  body: [0.25, 0.78, 0.92],
  barrel: [0.12, 0.36, 0.72],
  grip: [0.16, 0.18, 0.36],
  accent: [0.98, 0.62, 0.24]
});

export const PeaShooterII = registerWeapon(
  new WeaponDefinition({
    id: 'pea-shooter-ii',
    displayName: 'Pea Shooter II',
    description: 'Upgraded plasma repeater with stabilized recoil and tuned coils.',
    stats: {
      baseDamage: 8,
      rateOfFire: 5.2,
      muzzleVelocity: 42,
      magazineSize: 20,
      reloadTime: 1.45,
      projectileColor: [0.98, 0.62, 0.24],
      projectileSize: 0.085,
      projectileLifetime: 2.4,
      projectileMuzzleOffset: 0.92
    },
    createGeometry: (device, options) =>
      createPeaShooterGeometry(device, {
        ...(options ?? {}),
        palette: PEA_SHOOTER_II_PALETTE
      })
  })
);

export { WeaponDefinition };
