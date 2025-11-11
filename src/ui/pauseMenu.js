import { computePlayerStatsFromEquipment, STAT_EPSILON } from '../game/stats.js';

const BESTIARY_ENTRY_DEFINITIONS = Object.freeze({
  barrel: {
    id: 'barrel',
    tag: 'Hazard',
    name: 'Volatile Containment Barrel',
    rosterLine: 'Improvised explosive hazard',
    subtitle: 'Pressurized storage drums rigged to detonate when breached.',
    summary:
      'Industrial waste barrels wrapped in shrapnel casing. Their ruptures emit a concussive blast and ignite exposed propellant.',
    traits: [
      {
        label: 'Threat Vector',
        description:
          'Detonates when destroyed, dealing heavy area damage and staggering anyone inside the blast radius.'
      },
      {
        label: 'Countermeasures',
        description:
          'Engage from cover or trigger at range. Maintain distance to avoid chained explosions in cluttered arenas.'
      },
      {
        label: 'Field Notes',
        description:
          'Volatile drums can set off other hazards. Sweep the environment before firing to avoid collateral damage.'
      }
    ]
  }
});

function createNoopPauseMenuControls() {
  return {
    setController() {},
    setPaused() {},
    isPaused: () => false
  };
}

export function setupPauseMenu({ canvas, overlay, pauseMenu, itemPopover }) {
  if (!pauseMenu) {
    return createNoopPauseMenuControls();
  }

  const tabButtons = Array.from(pauseMenu.querySelectorAll('[role="tab"]'));
  const tabPanels = Array.from(pauseMenu.querySelectorAll('[role="tabpanel"]'));
  const tablist = pauseMenu.querySelector('[role="tablist"]');
  const pauseContent = pauseMenu.querySelector('.pause-menu__content');
  const pauseContainer = pauseMenu.querySelector('.pause-menu__container');
  const itemSlots = Array.from(pauseMenu.querySelectorAll('.item-slot'));
  const bestiaryElements = {
    list: pauseMenu.querySelector('[data-bestiary-role="encounter-list"]'),
    emptyState: pauseMenu.querySelector('[data-bestiary-role="empty-state"]'),
    detail: pauseMenu.querySelector('[data-bestiary-role="detail"]'),
    detailName: pauseMenu.querySelector('[data-bestiary-role="detail-name"]'),
    detailSubtitle: pauseMenu.querySelector('[data-bestiary-role="detail-subtitle"]'),
    detailSummary: pauseMenu.querySelector('[data-bestiary-role="detail-summary"]'),
    detailTraits: pauseMenu.querySelector('[data-bestiary-role="detail-traits"]'),
    detailTag: pauseMenu.querySelector('[data-bestiary-role="detail-tag"]')
  };

  const bestiaryState = {
    unlocked: new Map(),
    activeId: ''
  };

  for (const slot of itemSlots) {
    if (!slot.dataset.itemAbbr) {
      continue;
    }
    const label = slot.querySelector('strong');
    if (label) {
      label.textContent = slot.dataset.itemAbbr;
    }
    if (!slot.dataset.itemTag) {
      const tag = slot.querySelector('.item-slot__tag');
      if (tag?.textContent) {
        slot.dataset.itemTag = tag.textContent.trim();
      }
    }
  }

  let activeTab = 'stats';
  let paused = false;
  let controller = null;
  let hideItemDetail;
  let activeItemSlot = null;
  let hidePopoverTimeout;

  function resolveStatElements(statId) {
    const card = pauseMenu.querySelector(`.stat-card[data-stat="${statId}"]`);
    if (!card) {
      return { value: null, detail: null };
    }
    return {
      value: card.querySelector('.stat-card__value'),
      detail: card.querySelector('.stat-card__detail')
    };
  }

  const statElements = {
    vitality: {
      health: resolveStatElements('health'),
      focus: resolveStatElements('focus'),
      shield: resolveStatElements('shield')
    },
    attributes: {
      power: resolveStatElements('power'),
      agility: resolveStatElements('agility'),
      resilience: resolveStatElements('resilience'),
      insight: resolveStatElements('insight')
    }
  };

  let statsUpdateScheduled = false;

  function formatNumber(value) {
    if (!Number.isFinite(value)) {
      return '0';
    }
    if (Math.abs(value - Math.round(value)) < STAT_EPSILON) {
      return String(Math.round(value));
    }
    return value.toFixed(2).replace(/\.?(?:0)+$/, '');
  }

  function formatSignedNumber(value) {
    const prefix = value >= 0 ? '+' : '−';
    return `${prefix}${formatNumber(Math.abs(value))}`;
  }

  function isApproximatelyZero(value) {
    return Math.abs(value) < STAT_EPSILON;
  }

  function setDetail(element, text) {
    if (!element) {
      return;
    }
    if (text) {
      element.textContent = text;
      element.hidden = false;
    } else {
      element.textContent = '';
      element.hidden = true;
    }
  }

  function updateVitalityStat(statId, stat) {
    const elements = statElements.vitality[statId];
    if (!elements || !elements.value || !stat) {
      return;
    }
    const currentText = formatNumber(stat.totalCurrent);
    const maxText = formatNumber(stat.totalMax);
    elements.value.textContent = `${currentText} / ${maxText}`;
    const parts = [];
    if (!isApproximatelyZero(stat.bonusCurrent)) {
      parts.push(`${formatSignedNumber(stat.bonusCurrent)} current`);
    }
    if (!isApproximatelyZero(stat.bonusMax)) {
      parts.push(`${formatSignedNumber(stat.bonusMax)} max`);
    }
    setDetail(elements.detail, parts.length ? `Gear ${parts.join(' · ')}` : '');
  }

  function updateAttributeStat(statId, stat) {
    const elements = statElements.attributes[statId];
    if (!elements || !elements.value || !stat) {
      return;
    }
    elements.value.textContent = formatNumber(stat.total);
    setDetail(
      elements.detail,
      !isApproximatelyZero(stat.bonus) ? `Gear ${formatSignedNumber(stat.bonus)}` : ''
    );
  }

  function updatePlayerStats() {
    const equippedSlots = Array.from(
      pauseMenu.querySelectorAll('.item-slot[data-slot-kind="gear"]')
    );
    const totals = computePlayerStatsFromEquipment(equippedSlots);
    updateVitalityStat('health', totals.vitality.health);
    updateVitalityStat('focus', totals.vitality.focus);
    updateVitalityStat('shield', totals.vitality.shield);
    updateAttributeStat('power', totals.attributes.power);
    updateAttributeStat('agility', totals.attributes.agility);
    updateAttributeStat('resilience', totals.attributes.resilience);
    updateAttributeStat('insight', totals.attributes.insight);
  }

  function requestPlayerStatsUpdate() {
    if (statsUpdateScheduled) {
      return;
    }
    statsUpdateScheduled = true;
    requestAnimationFrame(() => {
      statsUpdateScheduled = false;
      updatePlayerStats();
    });
  }

  function setActiveTab(tabId, { focus = false } = {}) {
    activeTab = tabId;
    if (hideItemDetail && tabId !== 'inventory') {
      hideItemDetail(true);
    }
    for (const button of tabButtons) {
      const isActive = button.dataset.tab === tabId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive && focus) {
        button.focus({ preventScroll: true });
      }
    }
    for (const panel of tabPanels) {
      const isActive = panel.dataset.tab === tabId;
      panel.toggleAttribute('hidden', !isActive);
    }
  }

  setActiveTab(activeTab);

  function updateBestiaryEmptyState() {
    if (!bestiaryElements.emptyState) {
      return;
    }
    bestiaryElements.emptyState.toggleAttribute('hidden', bestiaryState.unlocked.size > 0);
  }

  function renderBestiaryDetail(definition) {
    if (!bestiaryElements.detail) {
      return;
    }

    const {
      detailTag,
      detailName,
      detailSubtitle,
      detailSummary,
      detailTraits
    } = bestiaryElements;

    if (!definition) {
      if (detailTag) {
        detailTag.textContent = '';
        detailTag.hidden = true;
      }
      if (detailName) {
        detailName.textContent = 'Tactical Archive';
      }
      if (detailSubtitle) {
        detailSubtitle.textContent = 'Select an encounter from the roster to review its dossier.';
      }
      if (detailSummary) {
        detailSummary.textContent = '';
        detailSummary.hidden = true;
      }
      if (detailTraits) {
        detailTraits.innerHTML = '';
        detailTraits.hidden = true;
      }
      return;
    }

    if (detailTag) {
      if (definition.tag) {
        detailTag.textContent = definition.tag;
        detailTag.hidden = false;
      } else {
        detailTag.textContent = '';
        detailTag.hidden = true;
      }
    }

    if (detailName) {
      detailName.textContent = definition.name ?? 'Encounter Intel';
    }

    if (detailSubtitle) {
      detailSubtitle.textContent = definition.subtitle ?? '';
    }

    if (detailSummary) {
      const summaryText = definition.summary ?? '';
      detailSummary.textContent = summaryText;
      detailSummary.hidden = summaryText.length === 0;
    }

    if (detailTraits) {
      detailTraits.innerHTML = '';
      const entries = Array.isArray(definition.traits) ? definition.traits : [];
      if (entries.length === 0) {
        detailTraits.hidden = true;
      } else {
        for (const trait of entries) {
          if (!trait || (!trait.label && !trait.description)) {
            continue;
          }
          if (trait.label) {
            const term = document.createElement('dt');
            term.textContent = trait.label;
            detailTraits.appendChild(term);
          }
          if (trait.description) {
            const detail = document.createElement('dd');
            detail.textContent = trait.description;
            detailTraits.appendChild(detail);
          }
        }
        detailTraits.hidden = detailTraits.childElementCount === 0;
      }
    }
  }

  function selectBestiaryEntry(entryId) {
    if (!entryId || !bestiaryState.unlocked.has(entryId)) {
      renderBestiaryDetail(null);
      bestiaryState.activeId = '';
      return;
    }

    const record = bestiaryState.unlocked.get(entryId);
    bestiaryState.activeId = entryId;

    for (const { button } of bestiaryState.unlocked.values()) {
      button?.classList.toggle('is-active', button === record.button);
    }

    renderBestiaryDetail(record.definition);
  }

  function createBestiaryButton(definition) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bestiary-entry';
    button.dataset.enemyId = definition.id ?? '';

    const title = document.createElement('strong');
    title.textContent = definition.name ?? 'Encounter';
    button.appendChild(title);

    const subtitleText = definition.rosterLine ?? definition.subtitle ?? '';
    if (subtitleText) {
      const subtitle = document.createElement('span');
      subtitle.textContent = subtitleText;
      button.appendChild(subtitle);
    }

    button.addEventListener('click', () => {
      selectBestiaryEntry(definition.id);
    });

    return button;
  }

  function unlockBestiaryEntry(entryId) {
    if (!entryId || bestiaryState.unlocked.has(entryId)) {
      return;
    }
    if (!bestiaryElements.list) {
      return;
    }

    const definition = BESTIARY_ENTRY_DEFINITIONS[entryId];
    if (!definition) {
      return;
    }

    const button = createBestiaryButton(definition);
    bestiaryElements.list.appendChild(button);
    bestiaryState.unlocked.set(entryId, { definition, button });
    updateBestiaryEmptyState();
    if (!bestiaryState.activeId) {
      selectBestiaryEntry(entryId);
    }
  }

  function handleBestiaryUnlock(event) {
    const type = event?.detail?.enemyType ?? event?.detail?.id ?? '';
    if (!type) {
      return;
    }
    unlockBestiaryEntry(type);
  }

  if (bestiaryElements.list) {
    window.addEventListener('bestiary-unlock', handleBestiaryUnlock);
  }

  updateBestiaryEmptyState();
  renderBestiaryDetail(null);

  if (itemPopover) {
    const popoverTag = itemPopover.querySelector('.item-popover__tag');
    const popoverName = itemPopover.querySelector('.item-popover__name');
    const popoverDescription = itemPopover.querySelector('.item-popover__description');
    const popoverBonuses = itemPopover.querySelector('.item-popover__bonuses');

    const setPopoverVisibility = (visible) => {
      itemPopover.classList.toggle('is-visible', visible);
      if ('hidePopover' in itemPopover && typeof itemPopover.hidePopover === 'function') {
        if (visible) {
          itemPopover.showPopover?.();
        } else {
          itemPopover.hidePopover();
        }
      }
    };

    const positionPopover = () => {
      if (!activeItemSlot) {
        return;
      }
      const slotRect = activeItemSlot.getBoundingClientRect();
      const popRect = itemPopover.getBoundingClientRect();
      const gap = 48;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let left = (2 * (slotRect.left - (viewportWidth / 2) + (popRect.width / 2) + (slotRect.width))) - gap;
      if (left + popRect.width > viewportWidth - gap) {
        left = slotRect.left - gap - popRect.width;
      }

      let top = (2 * (slotRect.top - (viewportHeight / 2) - (popRect.height / 2))) + gap;

      itemPopover.style.left = `${Math.round(left)}px`;
      itemPopover.style.top = `${Math.round(top)}px`;
    };

    const cancelScheduledHide = () => {
      if (hidePopoverTimeout) {
        clearTimeout(hidePopoverTimeout);
        hidePopoverTimeout = undefined;
      }
    };

    hideItemDetail = (force = false) => {
      cancelScheduledHide();
      const hide = () => {
        activeItemSlot = null;
        setPopoverVisibility(false);
        delete itemPopover.dataset.rarity;
      };
      if (force) {
        hide();
        return;
      }
      hidePopoverTimeout = setTimeout(hide, 100);
    };

    const showItemDetail = (slot) => {
      if (isDragging || !paused) {
        return;
      }
      cancelScheduledHide();
      activeItemSlot = slot;
      if (!slot) {
        setPopoverVisibility(false);
        delete itemPopover.dataset.rarity;
        return;
      }

      const tagLabel = slot.querySelector('.item-slot__tag')?.textContent || '';
      const strongLabel = slot.querySelector('strong');
      const name =
        slot.dataset.itemName ||
        strongLabel?.dataset.itemName ||
        strongLabel?.textContent ||
        slot.dataset.emptyLabel ||
        '';
      const description = slot.dataset.description || '';
      const bonuses = slot.dataset.bonuses;
      const rarity = slot.dataset.rarity || '';

      if (rarity) {
        itemPopover.dataset.rarity = rarity;
      } else {
        delete itemPopover.dataset.rarity;
      }

      if (popoverTag) {
        popoverTag.textContent = tagLabel;
        popoverTag.hidden = !tagLabel;
      }
      if (popoverName) {
        popoverName.textContent = name;
        popoverName.hidden = !name;
      }
      if (popoverDescription) {
        popoverDescription.textContent = description;
        popoverDescription.hidden = !description;
      }

      if (popoverBonuses) {
        if (bonuses) {
          popoverBonuses.innerHTML = '';
          const entries = bonuses.split(/[;|]/).map((bonus) => bonus.trim()).filter(Boolean);
          for (const entry of entries) {
            const [label, value] = entry.split(':').map((part) => part.trim());
            if (!label || !value) {
              continue;
            }
            const item = document.createElement('li');
            item.className = 'item-popover__bonus';
            const labelSpan = document.createElement('span');
            labelSpan.className = 'item-popover__bonus-label';
            labelSpan.textContent = label;
            const valueSpan = document.createElement('span');
            valueSpan.className = 'item-popover__bonus-value';
            valueSpan.textContent = value;
            item.appendChild(labelSpan);
            item.appendChild(valueSpan);
            popoverBonuses.appendChild(item);
          }
          popoverBonuses.hidden = false;
        } else {
          popoverBonuses.innerHTML = '';
          popoverBonuses.hidden = true;
        }
      }

      setPopoverVisibility(true);
      requestAnimationFrame(positionPopover);
    };

    const SLOT_META_ATTRIBUTES = new Set(['data-slot-kind', 'data-slot-allowed']);

    const normalizeType = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

    const getSlotItemType = (slot) => normalizeType(slot?.dataset.itemType);

    const getAllowedTypes = (slot) => {
      if (!slot) {
        return null;
      }
      const raw = slot.dataset.slotAllowed;
      if (!raw) {
        return null;
      }
      const parsed = raw
        .split(',')
        .map((part) => normalizeType(part))
        .filter(Boolean);
      if (parsed.length === 0 || parsed.includes('any')) {
        return null;
      }
      return parsed;
    };

    function formatItemTypeLabel(value) {
      return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    function formatAllowedTypeLabel(slot) {
      const allowed = getAllowedTypes(slot);
      if (!allowed || allowed.length === 0) {
        return '';
      }
      return allowed.map((type) => formatItemTypeLabel(type)).join(' / ');
    }

    function refreshEmptySlotLabel(slot) {
      if (!slot) {
        return;
      }
      if (slot.dataset.slot !== 'empty') {
        delete slot.dataset.emptyLabel;
        return;
      }
      delete slot.dataset.bonuses;
      if (slot.dataset.slotKind !== 'gear') {
        delete slot.dataset.emptyLabel;
        return;
      }

      const allowedLabel = formatAllowedTypeLabel(slot);
      const tagLabel = allowedLabel || 'Gear';
      const placeholderLabel = `Empty ${tagLabel} Slot`;
      const description = allowedLabel
        ? `Accepts: ${allowedLabel} gear.`
        : 'Equip compatible gear in this slot.';

      slot.innerHTML = `<span class="item-slot__tag">${tagLabel}</span><span class="item-slot__placeholder">${placeholderLabel}</span>`;

      slot.dataset.emptyLabel = placeholderLabel;
      slot.dataset.description = description;
      delete slot.dataset.itemType;
      delete slot.dataset.weaponId;
      delete slot.dataset.itemName;
      delete slot.dataset.itemAbbr;
    }

    const canSlotAcceptItem = (slot, itemType) => {
      if (!slot) {
        return false;
      }
      const allowedTypes = getAllowedTypes(slot);
      if (!allowedTypes) {
        return true;
      }
      const normalizedItemType = normalizeType(itemType);
      if (!normalizedItemType) {
        return true;
      }
      return allowedTypes.includes(normalizedItemType);
    };

    for (const slot of itemSlots) {
      refreshEmptySlotLabel(slot);
      slot.setAttribute('tabindex', '0');
      slot.addEventListener('mouseenter', () => showItemDetail(slot));
      slot.addEventListener('focus', () => showItemDetail(slot));
      slot.addEventListener('mouseleave', () => hideItemDetail());
      slot.addEventListener('blur', () => hideItemDetail());
    }

    let draggingSlot = null;
    let dragPreview;
    let dragSourceState;
    let dropTarget = null;
    let draggingPointerId = null;
    let draggingItemType = '';
    let isDragging = false;
    const dragOffset = { x: 0, y: 0 };

    const getSlotState = (slot) => {
      const dataAttributes = {};
      for (const attr of Array.from(slot.attributes)) {
        if (attr.name.startsWith('data-') && !SLOT_META_ATTRIBUTES.has(attr.name)) {
          dataAttributes[attr.name] = attr.value;
        }
      }
      return {
        html: slot.innerHTML,
        dataAttributes,
        slotKind: slot?.dataset.slotKind || ''
      };
    };

    const emitSlotChange = (slot) => {
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
    };

    const applySlotState = (slot, state) => {
      for (const attr of Array.from(slot.attributes)) {
        if (attr.name.startsWith('data-') && !SLOT_META_ATTRIBUTES.has(attr.name)) {
          slot.removeAttribute(attr.name);
        }
      }
      const isEmptyState = state.dataAttributes['data-slot'] === 'empty';
      const slotKind = slot?.dataset.slotKind || '';
      const originKind = state.slotKind;
      for (const [name, value] of Object.entries(state.dataAttributes)) {
        if (
          isEmptyState &&
          originKind &&
          originKind !== slotKind &&
          name !== 'data-slot'
        ) {
          continue;
        }
        slot.setAttribute(name, value);
      }

      if (
        isEmptyState &&
        originKind &&
        originKind !== slotKind &&
        slotKind === 'inventory'
      ) {
        slot.innerHTML = '<span class="item-slot__placeholder">Empty Pack Slot</span>';
        slot.dataset.description = 'This pack slot is empty.';
        delete slot.dataset.bonuses;
        delete slot.dataset.itemName;
        delete slot.dataset.itemAbbr;
        delete slot.dataset.itemTag;
      } else {
        slot.innerHTML = state.html;
      }
      refreshEmptySlotLabel(slot);
      requestPlayerStatsUpdate();
      emitSlotChange(slot);
    };

    const createSlotDropDetails = (slot) => {
      if (!slot || slot.dataset.slot === 'empty') {
        return null;
      }
      const tagLabel = slot.dataset.itemTag || slot.querySelector('.item-slot__tag')?.textContent?.trim() || '';
      return {
        itemId: slot.dataset.itemId || '',
        itemType: slot.dataset.itemType || '',
        rarity: slot.dataset.rarity || '',
        description: slot.dataset.description || '',
        bonuses: slot.dataset.bonuses || '',
        name: slot.dataset.itemName || '',
        abbreviation: slot.dataset.itemAbbr || '',
        tag: tagLabel || 'Item',
        weaponId: slot.dataset.weaponId || ''
      };
    };

    const clearDroppedSlot = (slot) => {
      if (!slot || slot.dataset.slot === 'empty') {
        return null;
      }
      const slotKind = slot.dataset.slotKind || '';
      slot.dataset.slot = 'empty';
      delete slot.dataset.description;
      delete slot.dataset.bonuses;
      delete slot.dataset.itemType;
      delete slot.dataset.rarity;
      delete slot.dataset.itemId;
      delete slot.dataset.weaponId;
      delete slot.dataset.itemName;
      delete slot.dataset.itemAbbr;
      delete slot.dataset.itemTag;
      if (slotKind === 'inventory') {
        slot.innerHTML = '<span class="item-slot__placeholder">Empty Pack Slot</span>';
        slot.dataset.description = 'This pack slot is empty.';
      } else {
        slot.innerHTML = '';
      }
      refreshEmptySlotLabel(slot);
      requestPlayerStatsUpdate();
      emitSlotChange(slot);
      return slot;
    };

    const isPointInsidePauseContainer = (clientX, clientY) => {
      if (!pauseContainer || !Number.isFinite(clientX) || !Number.isFinite(clientY)) {
        return true;
      }
      const rect = pauseContainer.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    };

    const updatePreviewPosition = (clientX, clientY) => {
      if (!dragPreview) {
        return;
      }
      dragPreview.style.left = `${clientX - dragOffset.x}px`;
      dragPreview.style.top = `${clientY - dragOffset.y}px`;
    };

    const isValidDropTarget = (candidate) => {
      if (!candidate || candidate === draggingSlot) {
        return false;
      }
      if (!canSlotAcceptItem(candidate, draggingItemType)) {
        return false;
      }
      const candidateItemType = getSlotItemType(candidate);
      if (!canSlotAcceptItem(draggingSlot, candidateItemType)) {
        return false;
      }
      return true;
    };

    const setDropTarget = (candidate) => {
      const nextTarget = isValidDropTarget(candidate) ? candidate : null;
      if (dropTarget === nextTarget) {
        return;
      }
      if (dropTarget) {
        dropTarget.classList.remove('is-drop-target');
      }
      dropTarget = nextTarget;
      if (dropTarget) {
        dropTarget.classList.add('is-drop-target');
      }
    };

    const endDrag = () => {
      if (dropTarget) {
        dropTarget.classList.remove('is-drop-target');
      }
      if (draggingSlot) {
        if (
          draggingPointerId !== null &&
          draggingSlot.hasPointerCapture?.(draggingPointerId)
        ) {
          draggingSlot.releasePointerCapture(draggingPointerId);
        }
        draggingSlot.classList.remove('is-drag-source');
      }
      if (dragPreview) {
        dragPreview.remove();
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      draggingSlot = null;
      draggingPointerId = null;
      dragPreview = undefined;
      dragSourceState = undefined;
      dropTarget = null;
      draggingItemType = '';
      isDragging = false;
    };

    const handlePointerMove = (event) => {
      if (!draggingSlot) {
        return;
      }
      updatePreviewPosition(event.clientX, event.clientY);
      const element = document.elementFromPoint(event.clientX, event.clientY);
      setDropTarget(element ? element.closest('.item-slot') : null);
    };

    const handlePointerUp = (event) => {
      if (!draggingSlot) {
        return;
      }
      let handled = false;
      if (dropTarget) {
        const dropState = getSlotState(dropTarget);
        applySlotState(dropTarget, dragSourceState);
        applySlotState(draggingSlot, dropState);
        setDropTarget(null);
        handled = true;
      } else if (draggingSlot.dataset.slotKind === 'inventory' || draggingSlot.dataset.slotKind === 'gear') {
        const droppedOutside = event
          ? !isPointInsidePauseContainer(event.clientX, event.clientY)
          : false;
        if (droppedOutside) {
          const slotKind = draggingSlot.dataset.slotKind || 'inventory';
          const itemDetails = createSlotDropDetails(draggingSlot);
          if (itemDetails) {
            clearDroppedSlot(draggingSlot);
            window.dispatchEvent(
              new CustomEvent('player-inventory-drop', {
                detail: {
                  slot: draggingSlot,
                  slotKind,
                  itemState: itemDetails,
                  sourceState: dragSourceState
                }
              })
            );
            handled = true;
          }
        }
      }
      if (!handled) {
        applySlotState(draggingSlot, dragSourceState);
      }
      setDropTarget(null);
      endDrag();
    };

    const handlePointerCancel = () => {
      if (!draggingSlot) {
        return;
      }
      applySlotState(draggingSlot, dragSourceState);
      endDrag();
    };

    const beginDrag = (event, slot) => {
      draggingSlot = slot;
      draggingPointerId = event.pointerId ?? null;
      dragSourceState = getSlotState(slot);
      draggingItemType = getSlotItemType(slot);

      dragPreview = slot.cloneNode(true);
      dragPreview.classList.add('item-slot--drag-preview');
      const rect = slot.getBoundingClientRect();
      dragPreview.style.width = `${rect.width}px`;
      dragPreview.style.height = `${rect.height}px`;
      document.body.appendChild(dragPreview);

      dragOffset.x = event.clientX - rect.left;
      dragOffset.y = event.clientY - rect.top;
      updatePreviewPosition(event.clientX, event.clientY);

      slot.classList.add('is-drag-source');
      slot.setPointerCapture?.(draggingPointerId);

      hideItemDetail?.(true);
      isDragging = true;

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    };

    const handlePointerDown = (event) => {
      const slot = event.currentTarget;
      if (event.button !== 0 || event.pointerType === 'touch') {
        return;
      }
      if (slot.dataset.slot === 'empty') {
        return;
      }
      event.preventDefault();
      beginDrag(event, slot);
    };

    for (const slot of itemSlots) {
      slot.addEventListener('pointerdown', handlePointerDown);
    }

    itemPopover.addEventListener('mouseenter', cancelScheduledHide);
    itemPopover.addEventListener('mouseleave', () => hideItemDetail());

    window.addEventListener('resize', () => {
      if (activeItemSlot) {
        requestAnimationFrame(positionPopover);
      }
    });

    if (pauseContent) {
      pauseContent.addEventListener('scroll', () => {
        if (activeItemSlot) {
          requestAnimationFrame(positionPopover);
        }
      });
    }
  }

  updatePlayerStats();

  function setPaused(next) {
    if (paused === next) {
      return;
    }
    paused = next;
    if (!next && hideItemDetail) {
      hideItemDetail(true);
    }
    pauseMenu.classList.toggle('is-open', paused);
    pauseMenu.setAttribute('aria-hidden', String(!paused));
    if (overlay) {
      overlay.style.display = paused ? 'none' : '';
    }
    if (paused) {
      updatePlayerStats();
      setActiveTab(activeTab, { focus: true });
      controller?.resetMovement();
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    } else if (document.pointerLockElement !== canvas) {
      canvas?.requestPointerLock?.();
    }
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab, { focus: true });
    });
  }

  if (tablist) {
    tablist.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const currentIndex = tabButtons.findIndex((btn) => btn.dataset.tab === activeTab);
      if (event.key === 'Home') {
        setActiveTab(tabButtons[0].dataset.tab, { focus: true });
        return;
      }
      if (event.key === 'End') {
        setActiveTab(tabButtons[tabButtons.length - 1].dataset.tab, { focus: true });
        return;
      }

      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = (currentIndex + direction + tabButtons.length) % tabButtons.length;
      setActiveTab(tabButtons[nextIndex].dataset.tab, { focus: true });
    });
  }

  pauseMenu.addEventListener('click', (event) => {
    if (event.target === pauseMenu) {
      setPaused(false);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      setPaused(true);
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && controller && !paused) {
      setPaused(true);
    }
  });

  return {
    setController(instance) {
      controller = instance;
    },
    setPaused,
    isPaused: () => paused
  };
}
