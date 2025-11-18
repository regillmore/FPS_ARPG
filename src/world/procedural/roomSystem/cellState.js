import { createCellProfile } from '../profile.js';
import { hashValue } from '../random.js';

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
      roomType: edges.roomType ?? null
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
      edges = { north: null, south: null, east: null, west: null, roomType: null };
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
    }

    const shouldOpen =
      (doorwayCount === 1 && closedCount >= 3 && !openEdge) || closedCount === 4;
    const openings = getVerticalOpeningStates(key);
    openings.set(layerIndex, shouldOpen);
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
