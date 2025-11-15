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
  vertices.push(
    point[0],
    point[1],
    point[2],
    normal[0],
    normal[1],
    normal[2],
    color[0],
    color[1],
    color[2]
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
  bounds,
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ
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

  if (!hasHole || holeMinX >= holeMaxX || holeMinZ >= holeMaxZ) {
    addQuad(vertices, createCorners(minX, maxX, minZ, maxZ), normal, color, bounds);
    return;
  }

  if (holeMinX > minX) {
    addQuad(vertices, createCorners(minX, holeMinX, minZ, maxZ), normal, color, bounds);
  }

  if (holeMaxX < maxX) {
    addQuad(vertices, createCorners(holeMaxX, maxX, minZ, maxZ), normal, color, bounds);
  }

  if (holeMinZ > minZ) {
    addQuad(vertices, createCorners(holeMinX, holeMaxX, minZ, holeMinZ), normal, color, bounds);
  }

  if (holeMaxZ < maxZ) {
    addQuad(vertices, createCorners(holeMinX, holeMaxX, holeMaxZ, maxZ), normal, color, bounds);
  }
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
  maxY,
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ
) {
  if (!colliders) {
    return;
  }

  if (maxX <= minX || maxZ <= minZ || maxY <= minY) {
    return;
  }

  const holeValid = hasHole && holeMinX < holeMaxX && holeMinZ < holeMaxZ;
  if (!holeValid) {
    addCollider(colliders, minX, minY, minZ, maxX, maxY, maxZ);
    return;
  }

  if (holeMinX > minX) {
    addCollider(colliders, minX, minY, minZ, holeMinX, maxY, maxZ);
  }

  if (holeMaxX < maxX) {
    addCollider(colliders, holeMaxX, minY, minZ, maxX, maxY, maxZ);
  }

  if (holeMinZ > minZ) {
    addCollider(colliders, holeMinX, minY, minZ, holeMaxX, maxY, holeMinZ);
  }

  if (holeMaxZ < maxZ) {
    addCollider(colliders, holeMinX, minY, holeMaxZ, holeMaxX, maxY, maxZ);
  }
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
  hasHole,
  holeMinX,
  holeMaxX,
  holeMinZ,
  holeMaxZ,
  colliders
) {
  const effectiveThickness = Math.max(thickness, 0);
  const holeValid = hasHole && holeMinX < holeMaxX && holeMinZ < holeMaxZ;

  if (effectiveThickness <= 1e-4) {
    const colliderMinY = topY - Math.max(0.05, effectiveThickness);
    addSlabColliders(
      colliders,
      minX,
      maxX,
      minZ,
      maxZ,
      colliderMinY,
      topY,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
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
      bounds,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
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
      bounds,
      holeValid,
      holeMinX,
      holeMaxX,
      holeMinZ,
      holeMaxZ
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
    bounds,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
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
    bounds,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
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
    topY,
    holeValid,
    holeMinX,
    holeMaxX,
    holeMinZ,
    holeMaxZ
  );

  if (!holeValid) {
    return;
  }

  const inner = {
    nbl: [holeMinX, bottomY, holeMinZ],
    nbr: [holeMaxX, bottomY, holeMinZ],
    ntl: [holeMinX, topY, holeMinZ],
    ntr: [holeMaxX, topY, holeMinZ],
    fbl: [holeMinX, bottomY, holeMaxZ],
    fbr: [holeMaxX, bottomY, holeMaxZ],
    ftl: [holeMinX, topY, holeMaxZ],
    ftr: [holeMaxX, topY, holeMaxZ]
  };

  addQuad(vertices, [inner.fbl, inner.nbl, inner.ntl, inner.ftl], [1, 0, 0], sideColor, bounds);
  addQuad(vertices, [inner.nbr, inner.fbr, inner.ftr, inner.ntr], [-1, 0, 0], sideColor, bounds);
  addQuad(vertices, [inner.nbl, inner.nbr, inner.ntr, inner.ntl], [0, 0, 1], sideColor, bounds);
  addQuad(vertices, [inner.fbr, inner.fbl, inner.ftl, inner.ftr], [0, 0, -1], sideColor, bounds);
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
