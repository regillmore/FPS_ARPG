import { createCellProfile } from '../profile.js';
import { hashValue, randomFloatForEdge } from '../random.js';

function isElevatorCell(x, z) {
  return x === 0 && z === 0;
}

const directionOffsets = Object.freeze({
  north: Object.freeze([0, -1]),
  south: Object.freeze([0, 1]),
  east: Object.freeze([1, 0]),
  west: Object.freeze([-1, 0])
});

function isOriginHallwayDoorway(ax, az, bx, bz) {
  const originInvolved = isElevatorCell(ax, az) || isElevatorCell(bx, bz);
  if (!originInvolved || (ax === bx && az === bz)) {
    return false;
  }

  if (ax === bx && Math.abs(az - bz) === 1) {
    return true;
  }

  return false;
}

export function createCellState(worldSeed) {
  const layerSeeds = new Map();
  const layerCellProfiles = new Map();
  const cellLayerEdgeStates = new Map();
  const cellVerticalOpenings = new Map();

  function getCellKey(x, z) {
    return `${x},${z}`;
  }

  function getLayerSeed(layerIndex) {
    let seed = layerSeeds.get(layerIndex);
    if (seed === undefined) {
      seed = hashValue(layerIndex, worldSeed) >>> 0;
      layerSeeds.set(layerIndex, seed);
    }
    return seed;
  }

  function getLayerProfiles(layerIndex) {
    let profiles = layerCellProfiles.get(layerIndex);
    if (!profiles) {
      profiles = new Map();
      layerCellProfiles.set(layerIndex, profiles);
    }
    return profiles;
  }

  function getCellProfileForLayer(layerIndex, x, z) {
    const profiles = getLayerProfiles(layerIndex);
    const key = getCellKey(x, z);
    let profile = profiles.get(key);
    if (!profile) {
      profile = createCellProfile(x, z, getLayerSeed(layerIndex));
      profiles.set(key, profile);
    }
    return profile;
  }

  function getExistingCellEdgesForLayer(layerIndex, x, z) {
    const key = getCellKey(x, z);
    const perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      return null;
    }
    const edges = perLayer.get(layerIndex);
    if (!edges) {
      return null;
    }
    return {
      north: edges.north ?? null,
      south: edges.south ?? null,
      east: edges.east ?? null,
      west: edges.west ?? null,
      roomType: edges.roomType ?? null,
      balconyDirection: edges.balconyDirection ?? null
    };
  }

  function getCellEdgesForLayer(layerIndex, x, z) {
    const key = getCellKey(x, z);
    let perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      perLayer = new Map();
      cellLayerEdgeStates.set(key, perLayer);
    }
    let edges = perLayer.get(layerIndex);
    if (!edges) {
      edges = {
        north: null,
        south: null,
        east: null,
        west: null,
        roomType: null,
        balconyDirection: null
      };
      perLayer.set(layerIndex, edges);
    }
    return edges;
  }

  return {
    getCellKey,
    getLayerSeed,
    getLayerProfiles,
    getCellProfileForLayer,
    getExistingCellEdgesForLayer,
    getCellEdgesForLayer
  };
}
