const BACKGROUND_FILL = 'rgba(10, 13, 20, 0.92)';
const BASE_RING_STROKE = 'rgba(80, 110, 150, 0.4)';
const HIGHLIGHT_RING_STROKE = 'rgba(130, 170, 220, 0.38)';
const FLOOR_FILL = 'rgba(110, 150, 200, 0.08)';
const PLAYER_CELL_FILL = 'rgba(160, 210, 255, 0.16)';
const HALLWAY_BRIDGE_FILL = 'rgba(255, 190, 120, 0.25)';
const GRID_STROKE = 'rgba(140, 175, 225, 0.18)';
const WALL_COLOR = 'rgba(220, 230, 255, 0.9)';
const DOOR_COLOR = 'rgba(135, 205, 255, 0.92)';
const VERTICAL_OPENING_FILL = 'rgba(240, 210, 120, 0.58)';
const VERTICAL_OPENING_STROKE = 'rgba(255, 245, 205, 0.9)';
const ENEMY_FILL = 'rgba(255, 92, 92, 0.95)';
const ENEMY_STROKE = 'rgba(12, 18, 28, 0.9)';
const PLAYER_FILL = 'rgba(200, 235, 255, 0.95)';
const PLAYER_STROKE = 'rgba(12, 18, 28, 0.85)';
const DOOR_GAP_RATIO = 0.34;
const MIN_CLIP_MARGIN = 10;
const DEFAULT_FLOOR_LABEL = 'G';

function formatFloorLabel(layerIndex) {
  if (!Number.isFinite(layerIndex)) {
    return DEFAULT_FLOOR_LABEL;
  }
  const normalized = Math.trunc(layerIndex);
  if (normalized === 0) {
    return 'G';
  }
  if (normalized < 0) {
    return `B${Math.abs(normalized)}`;
  }
  return String(normalized);
}

function ensureCanvasSize(canvas, root) {
  if (!canvas || !root) {
    return null;
  }
  const width = root.clientWidth;
  const height = root.clientHeight;
  if (!(width > 0 && height > 0)) {
    return null;
  }
  const dpr = window.devicePixelRatio ?? 1;
  const pixelWidth = Math.max(1, Math.round(width * dpr));
  const pixelHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  return { dpr, width: pixelWidth, height: pixelHeight };
}

function createTransform(snapshot, space) {
  if (!snapshot || !space) {
    return null;
  }
  const cellSize = Number.isFinite(snapshot.cellSize) ? snapshot.cellSize : 1;
  const halfCell = Number.isFinite(snapshot.halfCellSize)
    ? snapshot.halfCellSize
    : cellSize * 0.5;
  const radiusCells = Math.max(Number(snapshot.radius) || 0, 0);
  const coverage = Math.max(radiusCells + 0.5, 1) * cellSize;
  const effectiveRadius = Math.max(space.radius - space.margin, space.radius * 0.3);
  if (!(coverage > 0) || !(effectiveRadius > 0)) {
    return null;
  }
  const scale = effectiveRadius / coverage;
  const position = Array.isArray(snapshot.playerPosition) ? snapshot.playerPosition : [0, 0, 0];
  const px = Number.isFinite(position[0]) ? position[0] : 0;
  const pz = Number.isFinite(position[2]) ? position[2] : 0;

  return {
    scale,
    halfCell,
    cellSize,
    playerX: px,
    playerZ: pz,
    toCanvas(worldX, worldZ) {
      const x = Number.isFinite(worldX) ? worldX : 0;
      const z = Number.isFinite(worldZ) ? worldZ : 0;
      return {
        x: space.centerX - (x - px) * scale,
        y: space.centerY - (z - pz) * scale
      };
    }
  };
}

function drawCells(ctx, snapshot, transform, dpr) {
  if (!ctx || !snapshot || !transform) {
    return;
  }
  const cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
  if (cells.length === 0) {
    return;
  }
  const playerCellX = Number.isFinite(snapshot.cell?.x) ? snapshot.cell.x : null;
  const playerCellZ = Number.isFinite(snapshot.cell?.z) ? snapshot.cell.z : null;

  for (const cell of cells) {
    const cx = Number.isFinite(cell?.x) ? cell.x : null;
    const cz = Number.isFinite(cell?.z) ? cell.z : null;
    if (cx === null || cz === null) {
      continue;
    }
    const hasVerticalOpening = Boolean(cell?.verticalOpening);
    const isHallwayBridge = cell?.roomType === 'hallwayBridge';
    const minX = cx * transform.cellSize - transform.halfCell;
    const maxX = cx * transform.cellSize + transform.halfCell;
    const minZ = cz * transform.cellSize - transform.halfCell;
    const maxZ = cz * transform.cellSize + transform.halfCell;
    const topLeft = transform.toCanvas(minX, minZ);
    const topRight = transform.toCanvas(maxX, minZ);
    const bottomRight = transform.toCanvas(maxX, maxZ);
    const bottomLeft = transform.toCanvas(minX, maxZ);

    ctx.beginPath();
    ctx.moveTo(topLeft.x, topLeft.y);
    ctx.lineTo(topRight.x, topRight.y);
    ctx.lineTo(bottomRight.x, bottomRight.y);
    ctx.lineTo(bottomLeft.x, bottomLeft.y);
    ctx.closePath();
    const isPlayerCell = cx === playerCellX && cz === playerCellZ;
    let fillStyle = FLOOR_FILL;
    if (isHallwayBridge) {
      fillStyle = HALLWAY_BRIDGE_FILL;
    }
    if (isPlayerCell) {
      fillStyle = PLAYER_CELL_FILL;
    }
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = Math.max(1 * dpr, 0.8);
    ctx.strokeStyle = GRID_STROKE;
    ctx.stroke();

    if (hasVerticalOpening) {
      const center = transform.toCanvas((minX + maxX) * 0.5, (minZ + maxZ) * 0.5);
      const cellWidth = Math.abs(topRight.x - topLeft.x);
      const cellHeight = Math.abs(bottomLeft.y - topLeft.y);
      const markerHalfWidth = Math.max(cellWidth * 0.22, 2.2 * dpr);
      const markerHalfHeight = Math.max(cellHeight * 0.22, 2.2 * dpr);

      ctx.beginPath();
      ctx.moveTo(center.x, center.y - markerHalfHeight);
      ctx.lineTo(center.x + markerHalfWidth, center.y);
      ctx.lineTo(center.x, center.y + markerHalfHeight);
      ctx.lineTo(center.x - markerHalfWidth, center.y);
      ctx.closePath();
      ctx.fillStyle = VERTICAL_OPENING_FILL;
      ctx.fill();
      ctx.lineWidth = Math.max(1 * dpr, 0.9);
      ctx.strokeStyle = VERTICAL_OPENING_STROKE;
      ctx.stroke();
    }
  }
}

function drawEdges(ctx, snapshot, transform, dpr) {
  if (!ctx || !snapshot || !transform) {
    return;
  }
  const cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
  if (cells.length === 0) {
    return;
  }
  const wallWidth = Math.max(2.6 * dpr, 1.6);
  const doorWidth = Math.max(2.4 * dpr, 1.4);

  for (const cell of cells) {
    const cx = Number.isFinite(cell?.x) ? cell.x : null;
    const cz = Number.isFinite(cell?.z) ? cell.z : null;
    const edges = cell?.edges ?? null;
    if (cx === null || cz === null || !edges) {
      continue;
    }
    const minX = cx * transform.cellSize - transform.halfCell;
    const maxX = cx * transform.cellSize + transform.halfCell;
    const minZ = cz * transform.cellSize - transform.halfCell;
    const maxZ = cz * transform.cellSize + transform.halfCell;

    const segments = [
      { type: edges.north, ax: minX, az: minZ, bx: maxX, bz: minZ },
      { type: edges.south, ax: minX, az: maxZ, bx: maxX, bz: maxZ },
      { type: edges.east, ax: maxX, az: minZ, bx: maxX, bz: maxZ },
      { type: edges.west, ax: minX, az: minZ, bx: minX, bz: maxZ }
    ];

    for (const segment of segments) {
      if (segment.type !== 'solid' && segment.type !== 'doorway') {
        continue;
      }
      const start = transform.toCanvas(segment.ax, segment.az);
      const end = transform.toCanvas(segment.bx, segment.bz);
      if (!start || !end) {
        continue;
      }
      if (segment.type === 'doorway') {
        ctx.strokeStyle = DOOR_COLOR;
        ctx.lineWidth = doorWidth;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const gapHalfX = dx * DOOR_GAP_RATIO * 0.5;
        const gapHalfY = dy * DOOR_GAP_RATIO * 0.5;
        const midX = (start.x + end.x) * 0.5;
        const midY = (start.y + end.y) * 0.5;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(midX - gapHalfX, midY - gapHalfY);
        ctx.moveTo(midX + gapHalfX, midY + gapHalfY);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else {
        ctx.strokeStyle = WALL_COLOR;
        ctx.lineWidth = wallWidth;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    }
  }
}

function drawEnemies(ctx, snapshot, transform, enemies, dpr) {
  if (!ctx || !snapshot || !transform) {
    return;
  }
  if (!Array.isArray(enemies) || enemies.length === 0) {
    return;
  }
  const radius = Math.max(3.2 * dpr, 2.2);
  ctx.fillStyle = ENEMY_FILL;
  ctx.strokeStyle = ENEMY_STROKE;
  ctx.lineWidth = Math.max(1.2 * dpr, 1);

  for (const enemy of enemies) {
    const ex = Number.isFinite(enemy?.x) ? enemy.x : null;
    const ez = Number.isFinite(enemy?.z) ? enemy.z : null;
    if (ex === null || ez === null) {
      continue;
    }
    const point = transform.toCanvas(ex, ez);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPlayer(ctx, playerYaw, dpr, centerX, centerY) {
  if (!ctx) {
    return;
  }
  const headingX = Math.sin(playerYaw);
  const headingY = -Math.cos(playerYaw);
  const perpX = -headingY;
  const perpY = headingX;
  const arrowLength = Math.max(14 * dpr, 9);
  const baseWidth = Math.max(9 * dpr, 6);
  const tailOffset = arrowLength * 0.55;

  ctx.fillStyle = PLAYER_FILL;
  ctx.strokeStyle = PLAYER_STROKE;
  ctx.lineWidth = Math.max(1.4 * dpr, 1);

  ctx.beginPath();
  ctx.moveTo(centerX - headingX * arrowLength, centerY + headingY * arrowLength);
  ctx.lineTo(
    centerX + headingX * tailOffset - perpX * baseWidth * 0.5,
    centerY - headingY * tailOffset + perpY * baseWidth * 0.5
  );
  ctx.lineTo(
    centerX + headingX * tailOffset + perpX * baseWidth * 0.5,
    centerY - headingY * tailOffset - perpY * baseWidth * 0.5
  );
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const coreRadius = Math.max(3.4 * dpr, 2.4);
  ctx.beginPath();
  ctx.arc(centerX, centerY, coreRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawMinimap(ctx, canvasSize, data) {
  if (!ctx) {
    return;
  }
  const { width, height, dpr } = canvasSize;
  ctx.clearRect(0, 0, width, height);

  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const baseRadius = Math.max(Math.min(centerX, centerY) - 2 * dpr, 6 * dpr);
  const clipRadius = Math.max(baseRadius - 4 * dpr, baseRadius * 0.75);
  const clipMargin = Math.max(clipRadius * 0.08, MIN_CLIP_MARGIN * dpr);

  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
  ctx.fillStyle = BACKGROUND_FILL;
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = BASE_RING_STROKE;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, clipRadius, 0, Math.PI * 2);
  ctx.clip();

  const snapshot = data?.snapshot ?? null;
  const playerYaw = Number.isFinite(data?.playerYaw) ? data.playerYaw : 0;
  const enemies = Array.isArray(data?.enemies) ? data.enemies : [];
  const transform = snapshot
    ? createTransform(snapshot, {
        centerX,
        centerY,
        radius: clipRadius,
        margin: clipMargin,
        dpr
      })
    : null;

  drawCells(ctx, snapshot, transform, dpr);
  drawEdges(ctx, snapshot, transform, dpr);
  drawEnemies(ctx, snapshot, transform, enemies, dpr);
  drawPlayer(ctx, playerYaw, dpr, centerX, centerY);

  ctx.restore();

  ctx.beginPath();
  ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = HIGHLIGHT_RING_STROKE;
  ctx.stroke();
}

export function createMinimap(options = {}) {
  const mount = options.mount ?? document.getElementById('hud') ?? document.body;
  const root = document.createElement('div');
  root.className = 'hud-minimap';
  root.setAttribute('aria-hidden', 'true');

  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'hud-minimap__canvas-wrapper';

  const canvas = document.createElement('canvas');
  canvas.className = 'hud-minimap__canvas';
  canvas.width = 1;
  canvas.height = 1;
  canvasWrapper.appendChild(canvas);
  root.appendChild(canvasWrapper);

  const floorLabel = document.createElement('div');
  floorLabel.className = 'hud-minimap__floor';
  floorLabel.textContent = DEFAULT_FLOOR_LABEL;
  root.appendChild(floorLabel);

  if (mount) {
    mount.appendChild(root);
  }

  const ctx = canvas.getContext('2d');

  return {
    element: root,
    update(data) {
      if (!ctx || !root.isConnected) {
        return;
      }
      const canvasSize = ensureCanvasSize(canvas, canvasWrapper);
      if (!canvasSize) {
        return;
      }
      drawMinimap(ctx, canvasSize, data ?? {});
      const label = formatFloorLabel(data?.snapshot?.layerIndex);
      if (floorLabel.textContent !== label) {
        floorLabel.textContent = label;
      }
    },
    destroy() {
      root.remove();
    }
  };
}
