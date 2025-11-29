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

  function getExistingVerticalOpeningStates(key) {
    return cellVerticalOpenings.get(key) ?? null;
  }

  function getVerticalOpeningStates(key) {
    let openings = cellVerticalOpenings.get(key);
    if (!openings) {
      openings = new Map();
      cellVerticalOpenings.set(key, openings);
    }
    return openings;
  }

  function updateCellVerticalOpeningForLayer(x, z, layerIndex) {
    const key = getCellKey(x, z);
    const perLayer = cellLayerEdgeStates.get(key);
    const edges = perLayer ? perLayer.get(layerIndex) : null;

    let doorwayCount = 0;
    let openEdge = false;
    let closedCount = 0;
    let doubleDoorway = false;
    let doorwayDirection = null;

    if (edges) {
      const edgeStates = [edges.north, edges.south, edges.east, edges.west];
      for (let i = 0; i < edgeStates.length; i += 1) {
        const state = edgeStates[i];
        if (state === 'doorway') {
          doorwayCount += 1;
        } else if (state === 'open') {
          openEdge = true;
        } else {
          closedCount += 1;
        }
      }

      if (doorwayCount === 1 && !openEdge) {
        const directions = ['north', 'south', 'east', 'west'];
        for (let i = 0; i < directions.length; i += 1) {
          const direction = directions[i];
          if (edges[direction] !== 'doorway') {
            continue;
          }
          doorwayDirection = direction;
          const offset = directionOffsets[direction];
          if (!offset) {
            continue;
          }
          const neighborX = x + offset[0];
          const neighborZ = z + offset[1];
          const layerSeed = getLayerSeed(layerIndex);
          doubleDoorway =
            isOriginHallwayDoorway(x, z, neighborX, neighborZ) ||
            randomFloatForEdge(x, z, neighborX, neighborZ, 29, layerSeed) < 0.5;
          break;
        }
      }
    }

    const hasBalcony = doorwayCount === 1 && closedCount >= 3 && !openEdge && !doubleDoorway;
    const shouldOpen = isElevatorCell(x, z);
    const openings = getVerticalOpeningStates(key);
    openings.set(layerIndex, shouldOpen);

    if (edges) {
      edges.balconyDirection = hasBalcony ? doorwayDirection : null;
      if (edges.roomType === 'balcony' && !hasBalcony) {
        edges.roomType = null;
      }
    }
  }

  return {
    getCellKey,
    getLayerSeed,
    getLayerProfiles,
    getCellProfileForLayer,
    getExistingCellEdgesForLayer,
    getCellEdgesForLayer,
    getExistingVerticalOpeningStates,
    getVerticalOpeningStates,
    updateCellVerticalOpeningForLayer
  };
}
