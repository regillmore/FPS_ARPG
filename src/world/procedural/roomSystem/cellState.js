import { createCellProfile } from '../profile.js';
import { hashValue } from '../random.js';

export function createCellState(worldSeed) {
  const layerSeeds = new Map();
  const layerCellProfiles = new Map();
  const cellLayerEdgeStates = new Map();

  function getCellKey(x, z) {
    return `${x},${z}`;
  }

  function getLayerSeed() {
    let seed = layerSeeds.get(0);
    if (seed === undefined) {
      seed = hashValue(0, worldSeed) >>> 0;
      layerSeeds.set(0, seed);
    }
    return seed;
  }

  function getLayerProfiles() {
    let profiles = layerCellProfiles.get(0);
    if (!profiles) {
      profiles = new Map();
      layerCellProfiles.set(0, profiles);
    }
    return profiles;
  }

  function getCellProfileForLayer(x, z) {
    const profiles = getLayerProfiles();
    const key = getCellKey(x, z);
    let profile = profiles.get(key);
    if (!profile) {
      profile = createCellProfile(x, z, getLayerSeed());
      profiles.set(key, profile);
    }
    return profile;
  }

  function getExistingCellEdgesForLayer(x, z) {
    const key = getCellKey(x, z);
    const perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      return null;
    }
    const edges = perLayer.get(0);
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

  function getCellEdgesForLayer(x, z) {
    const key = getCellKey(x, z);
    let perLayer = cellLayerEdgeStates.get(key);
    if (!perLayer) {
      perLayer = new Map();
      cellLayerEdgeStates.set(key, perLayer);
    }
    let edges = perLayer.get(0);
    if (!edges) {
      edges = {
        north: null,
        south: null,
        east: null,
        west: null,
        roomType: null,
        balconyDirection: null
      };
      perLayer.set(0, edges);
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
