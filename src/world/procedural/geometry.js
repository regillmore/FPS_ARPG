import { mixColors } from './color.js';

export function extendBounds(bounds, point) {
  const [x, y, z] = point;
  if (x < bounds.minX) bounds.minX = x;
  if (x > bounds.maxX) bounds.maxX = x;
  if (y < bounds.minY) bounds.minY = y;
  if (y > bounds.maxY) bounds.maxY = y;
  if (z < bounds.minZ) bounds.minZ = z;
  if (z > bounds.maxZ) bounds.maxZ = z;
}

export function pushVertex(vertices, point, normal, color, bounds) {
  extendBounds(bounds, point);
  const glow = Array.isArray(color) && color.length > 3 ? color[3] : 0;
  vertices.push(
    point[0],
    point[1],
    point[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2],
    glow
  );
}

export function addQuad(vertices, corners, normal, color, bounds) {
  const [a, b, c, d] = corners;
  pushVertex(vertices, a, normal, color, bounds);
  pushVertex(vertices, b, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
  pushVertex(vertices, a, normal, color, bounds);
  pushVertex(vertices, c, normal, color, bounds);
  pushVertex(vertices, d, normal, color, bounds);
}

export function addHorizontalSection(
  vertices,
  y,
  minX,
  maxX,
  minZ,
  maxZ,
  normal,
  color,
  bounds
) {
  const isUpward = normal[1] >= 0;

  function createCorners(x0, x1, z0, z1) {
    if (isUpward) {
      return [
        [x0, y, z1],
        [x1, y, z1],
        [x1, y, z0],
        [x0, y, z0]
      ];
    }
    return [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1]
    ];
  }

  addQuad(vertices, createCorners(minX, maxX, minZ, maxZ), normal, color, bounds);
  return;
}

export function addCollider(colliders, minX, minY, minZ, maxX, maxY, maxZ) {
  if (!colliders) {
    return;
  }
  colliders.push({ minX, minY, minZ, maxX, maxY, maxZ });
}

export function addSlabColliders(
  colliders,
  minX,
  maxX,
  minZ,
  maxZ,
  minY,
  maxY
) {
  if (!colliders) {
    return;
  }

  if (maxX <= minX || maxZ <= minZ || maxY <= minY) {
    return;
  }

  addCollider(colliders, minX, minY, minZ, maxX, maxY, maxZ);
  return;
}

export function addFloorSlab(
  vertices,
  topY,
  thickness,
  minX,
  maxX,
  minZ,
  maxZ,
  topColor,
  bottomColor,
  bounds,
  colliders
) {
  const effectiveThickness = Math.max(thickness, 0);

  if (effectiveThickness <= 1e-4) {
    const colliderMinY = topY - Math.max(0.05, effectiveThickness);
    addSlabColliders(
      colliders,
      minX,
      maxX,
      minZ,
      maxZ,
      colliderMinY,
      topY
    );

    addHorizontalSection(
      vertices,
      topY,
      minX,
      maxX,
      minZ,
      maxZ,
      [0, 1, 0],
      topColor,
      bounds
    );
    addHorizontalSection(
      vertices,
      topY,
      minX,
      maxX,
      minZ,
      maxZ,
      [0, -1, 0],
      bottomColor,
      bounds
    );
    return;
  }

  const bottomY = topY - effectiveThickness;
  const sideColor = mixColors(topColor, bottomColor, 0.5);

  addHorizontalSection(
    vertices,
    topY,
    minX,
    maxX,
    minZ,
    maxZ,
    [0, 1, 0],
    topColor,
    bounds
  );

  addHorizontalSection(
    vertices,
    bottomY,
    minX,
    maxX,
    minZ,
    maxZ,
    [0, -1, 0],
    bottomColor,
    bounds
  );

  const outer = {
    nbl: [minX, bottomY, minZ],
    nbr: [maxX, bottomY, minZ],
    ntl: [minX, topY, minZ],
    ntr: [maxX, topY, minZ],
    fbl: [minX, bottomY, maxZ],
    fbr: [maxX, bottomY, maxZ],
    ftl: [minX, topY, maxZ],
    ftr: [maxX, topY, maxZ]
  };

  addQuad(vertices, [outer.fbl, outer.fbr, outer.ftr, outer.ftl], [0, 0, 1], sideColor, bounds);
  addQuad(vertices, [outer.nbr, outer.nbl, outer.ntl, outer.ntr], [0, 0, -1], sideColor, bounds);
  addQuad(vertices, [outer.nbl, outer.fbl, outer.ftl, outer.ntl], [-1, 0, 0], sideColor, bounds);
  addQuad(vertices, [outer.fbr, outer.nbr, outer.ntr, outer.ftr], [1, 0, 0], sideColor, bounds);

  addSlabColliders(
    colliders,
    minX,
    maxX,
    minZ,
    maxZ,
    bottomY,
    topY
  );
}

export function addBox(vertices, minX, minY, minZ, maxX, maxY, maxZ, color, bounds) {
  const corners = {
    nbl: [minX, minY, minZ],
    nbr: [maxX, minY, minZ],
    ntl: [minX, maxY, minZ],
    ntr: [maxX, maxY, minZ],
    fbl: [minX, minY, maxZ],
    fbr: [maxX, minY, maxZ],
    ftl: [minX, maxY, maxZ],
    ftr: [maxX, maxY, maxZ]
  };

  addQuad(vertices, [corners.fbl, corners.fbr, corners.ftr, corners.ftl], [0, 0, 1], color, bounds);
  addQuad(vertices, [corners.nbr, corners.nbl, corners.ntl, corners.ntr], [0, 0, -1], color, bounds);
  addQuad(vertices, [corners.nbl, corners.fbl, corners.ftl, corners.ntl], [-1, 0, 0], color, bounds);
  addQuad(vertices, [corners.fbr, corners.nbr, corners.ntr, corners.ftr], [1, 0, 0], color, bounds);
  addQuad(vertices, [corners.ntl, corners.ftl, corners.ftr, corners.ntr], [0, 1, 0], color, bounds);
  addQuad(vertices, [corners.nbl, corners.nbr, corners.fbr, corners.fbl], [0, -1, 0], color, bounds);
}
