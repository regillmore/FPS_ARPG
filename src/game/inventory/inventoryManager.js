import { INVENTORY_EMPTY_SLOT_SELECTOR, PRIMARY_WEAPON_SLOT_SELECTOR } from '../constants.js';

function emitSlotChangeEvent(slot) {
  if (!slot) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent('player-slot-change', {
      detail: {
        slot,
        slotKind: slot.dataset.slotKind || '',
        slotAllowed: slot.dataset.slotAllowed || '',
        slotState: slot.dataset.slot || '',
        itemType: slot.dataset.itemType || '',
        weaponId: slot.dataset.weaponId || ''
      }
    })
  );
}

function populateInventorySlot(slot, itemDetails = {}) {
  if (!slot) {
    return null;
  }

  const rawName = itemDetails.name ?? itemDetails.displayName ?? itemDetails.itemName ?? 'Item';
  const itemName = String(rawName);
  const rawAbbreviation = itemDetails.abbreviation ?? itemDetails.itemAbbr ?? itemName.slice(0, 2).toUpperCase();
  const abbreviation = String(rawAbbreviation);
  const tagLabel = itemDetails.tag ?? 'Item';

  slot.innerHTML = `<span class="item-slot__tag">${tagLabel}</span><strong>${abbreviation}</strong>`;
  slot.dataset.itemType = itemDetails.itemType ?? '';
  slot.dataset.rarity = itemDetails.rarity ?? '';
  if (tagLabel) {
    slot.dataset.itemTag = tagLabel;
  } else {
    delete slot.dataset.itemTag;
  }
  if (typeof itemDetails.description === 'string' && itemDetails.description.length > 0) {
    slot.dataset.description = itemDetails.description;
  } else {
    delete slot.dataset.description;
  }
  if (typeof itemDetails.bonuses === 'string' && itemDetails.bonuses.length > 0) {
    slot.dataset.bonuses = itemDetails.bonuses;
  } else {
    delete slot.dataset.bonuses;
  }
  slot.dataset.itemName = itemName;
  slot.dataset.itemAbbr = abbreviation;
  if (itemDetails.itemId) {
    slot.dataset.itemId = itemDetails.itemId;
  } else {
    delete slot.dataset.itemId;
  }
  if (itemDetails.weaponId) {
    slot.dataset.weaponId = itemDetails.weaponId;
  } else {
    delete slot.dataset.weaponId;
  }
  slot.removeAttribute('data-slot');
  return slot;
}

export function createInventoryManager() {
  const primaryWeaponSlot = document.querySelector(PRIMARY_WEAPON_SLOT_SELECTOR);

  const findFirstEmptyInventorySlot = () =>
    document.querySelector(INVENTORY_EMPTY_SLOT_SELECTOR);

  const grantInventoryItem = (itemDetails) => {
    const slot = findFirstEmptyInventorySlot();
    if (!slot) {
      return null;
    }
    const populated = populateInventorySlot(slot, itemDetails);
    emitSlotChangeEvent(populated);
    return populated;
  };

  return {
    primaryWeaponSlot,
    findFirstEmptyInventorySlot,
    populateInventorySlot,
    grantInventoryItem,
    emitSlotChangeEvent
  };
}
