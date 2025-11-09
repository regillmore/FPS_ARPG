import { computePlayerStatsFromEquipment, STAT_EPSILON } from '../game/stats.js';

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
  const itemSlots = Array.from(pauseMenu.querySelectorAll('.item-slot'));

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

      let top = (2 * (slotRect.top - (viewportHeight / 2) + (popRect.height / 2) + (slotRect.height))) - gap;

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
      if (isDragging) {
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
      const name = slot.querySelector('strong')?.textContent || slot.dataset.emptyLabel || '';
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
      } else {
        slot.innerHTML = state.html;
      }
      refreshEmptySlotLabel(slot);
      requestPlayerStatsUpdate();
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

    const handlePointerUp = () => {
      if (!draggingSlot) {
        return;
      }
      if (dropTarget) {
        const dropState = getSlotState(dropTarget);
        applySlotState(dropTarget, dragSourceState);
        applySlotState(draggingSlot, dropState);
        setDropTarget(null);
      }
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
      canvas?.requestPointerLock?.().catch(() => {
        // Ignore failures
      });
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
