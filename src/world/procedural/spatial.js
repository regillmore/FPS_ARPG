export function positionToCell(value, roomSize, halfRoom) {
  return Math.floor((value + halfRoom) / roomSize);
}

export function positionToLayer(value, levelHeight, floorThickness) {
  return Math.floor((value + floorThickness) / levelHeight);
}