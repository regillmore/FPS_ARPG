const BACKGROUND_FILL = 'rgba(10, 13, 20, 0.92)';
const BASE_RING_STROKE = 'rgba(80, 110, 150, 0.4)';
const HIGHLIGHT_RING_STROKE = 'rgba(130, 170, 220, 0.38)';
const FLOOR_FILL = 'rgba(110, 150, 200, 0.08)';
const PLAYER_CELL_FILL = 'rgba(160, 210, 255, 0.16)';
const HALLWAY_BRIDGE_FILL = 'rgba(255, 190, 120, 0.25)';
const ELEVATOR_FILL = 'rgba(255, 235, 170, 0.32)';
const BALCONY_ICON_FILL = 'rgba(180, 230, 255, 0.95)';
const BALCONY_ICON_STROKE = 'rgba(15, 25, 40, 0.9)';
const GRID_STROKE = 'rgba(140, 175, 225, 0.18)';
const WALL_COLOR = 'rgba(220, 230, 255, 0.9)';
const DOOR_COLOR = 'rgba(135, 205, 255, 0.92)';
const ENEMY_FILL = 'rgba(255, 92, 92, 0.95)';
const ENEMY_STROKE = 'rgba(12, 18, 28, 0.9)';
const PLAYER_FILL = 'rgba(200, 235, 255, 0.95)';
const PLAYER_STROKE = 'rgba(12, 18, 28, 0.85)';
const ORIGIN_WAYPOINT_FILL = 'rgba(255, 238, 190, 0.96)';
const ORIGIN_WAYPOINT_STROKE = 'rgba(16, 24, 34, 0.9)';
const ORIGIN_WAYPOINT_TEXT = 'rgba(18, 26, 36, 0.96)';
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
  const radiusCells = Math.max(Number(snapshot.radius) - 1 || 0, 0);
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
    const isHallwayBridge = cell?.roomType === 'hallwayBridge';
    const isElevator = cell?.roomType === 'elevator';
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
    } else if (isElevator) {
      fillStyle = ELEVATOR_FILL;
    }
    if (isPlayerCell) {
      fillStyle = PLAYER_CELL_FILL;
    }
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = Math.max(1 * dpr, 0.8);
    ctx.strokeStyle = GRID_STROKE;
    ctx.stroke();
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

function drawOriginElevatorWaypoint(ctx, transform, waypoint, dpr, centerX, centerY, clipRadius) {
  if (!ctx || !transform || !waypoint) {
    return;
  }

  const projected = transform.toCanvas(waypoint.x, waypoint.z);
  if (!projected) {
    return;
  }

  const dx = projected.x - centerX;
  const dy = projected.y - centerY;
  const distance = Math.hypot(dx, dy);
  const unitX = distance > 1e-4 ? dx / distance : 0;
  const unitY = distance > 1e-4 ? dy / distance : -1;
  const perpX = -unitY;
  const perpY = unitX;
  const maxDistance = Math.max(clipRadius - 6 * dpr, clipRadius * 0.9);
  const clampedDistance = Math.min(distance, maxDistance);
  const markerX = centerX + unitX * clampedDistance;
  const markerY = centerY + unitY * clampedDistance;

  const markerRadius = Math.max(6.8 * dpr, 4.5);
  const innerRadius = markerRadius * 0.55;

  ctx.fillStyle = ORIGIN_WAYPOINT_FILL;
  ctx.strokeStyle = ORIGIN_WAYPOINT_STROKE;
  ctx.lineWidth = Math.max(1.3 * dpr, 1);

  ctx.beginPath();
  ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(markerX, markerY, innerRadius, 0, Math.PI * 2);
  ctx.stroke();

  if (distance - clampedDistance > 1e-3) {
    const tipLength = markerRadius * 1.6;
    const baseOffset = markerRadius * 0.7;
    const wing = markerRadius * 0.85;

    const tipX = markerX + unitX * tipLength;
    const tipY = markerY + unitY * tipLength;
    const baseX = markerX - unitX * baseOffset;
    const baseY = markerY - unitY * baseOffset;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + perpX * wing, baseY + perpY * wing);
    ctx.lineTo(baseX - perpX * wing, baseY - perpY * wing);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = ORIGIN_WAYPOINT_TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = Math.max(9 * dpr, 8);
  ctx.font = `bold ${fontSize}px "Inter", "Arial", sans-serif`;
  ctx.fillText('E', markerX, markerY);
}

function drawBalconyIcons(ctx, snapshot, transform, dpr) {
  if (!ctx || !snapshot || !transform) {
    return;
  }
  const cells = Array.isArray(snapshot.cells) ? snapshot.cells : [];
  if (cells.length === 0) {
    return;
  }

  const directionVectors = {
    north: [0, -1],
    south: [0, 1],
    east: [1, 0],
    west: [-1, 0]
  };

  for (const cell of cells) {
    if (cell?.roomType !== 'balcony') {
      continue;
    }
    const direction = cell?.edges?.balconyDirection ?? null;
    const vector = directionVectors[direction] ?? directionVectors.south;
    const canvasCenter = transform.toCanvas(cell.x * transform.cellSize, cell.z * transform.cellSize);

    const pixelScale = transform.scale;
    const dirX = -vector[0] * pixelScale;
    const dirY = -vector[1] * pixelScale;
    const magnitude = Math.hypot(dirX, dirY);
    const unitX = magnitude > 1e-4 ? dirX / magnitude : 0;
    const unitY = magnitude > 1e-4 ? dirY / magnitude : -1;
    const perpX = -unitY;
    const perpY = unitX;

    const baseSize = Math.max(transform.cellSize * pixelScale * 0.22, 4.8 * dpr);
    const tipLength = baseSize * 1.5;
    const tailLength = baseSize * 0.55;
    const wingOffset = baseSize * 0.85;

    const tipX = canvasCenter.x + unitX * tipLength;
    const tipY = canvasCenter.y + unitY * tipLength;
    const leftX = canvasCenter.x - unitX * tailLength + perpX * wingOffset;
    const leftY = canvasCenter.y - unitY * tailLength + perpY * wingOffset;
    const rightX = canvasCenter.x - unitX * tailLength - perpX * wingOffset;
    const rightY = canvasCenter.y - unitY * tailLength - perpY * wingOffset;
    const tailX = canvasCenter.x - unitX * tailLength * 0.6;
    const tailY = canvasCenter.y - unitY * tailLength * 0.6;

    ctx.fillStyle = BALCONY_ICON_FILL;
    ctx.strokeStyle = BALCONY_ICON_STROKE;
    ctx.lineWidth = Math.max(1.2 * dpr, 1);

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(tailX, tailY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const innerRadius = Math.max(baseSize * 0.35, 2.8 * dpr);
    ctx.beginPath();
    ctx.arc(canvasCenter.x, canvasCenter.y, innerRadius, 0, Math.PI * 2);
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
  const originElevator = data?.originElevator ?? snapshot?.originElevator ?? null;
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
  drawBalconyIcons(ctx, snapshot, transform, dpr);
  drawOriginElevatorWaypoint(ctx, transform, originElevator, dpr, centerX, centerY, clipRadius);
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
