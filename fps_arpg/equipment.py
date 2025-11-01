"""Equipment slot definitions and management helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Iterable, Iterator

from .inventory import ItemTemplate


@dataclass(frozen=True)
class EquipmentSlotDefinition:
    """Static description of a slot in the player's loadout."""

    id: str
    name: str
    allowed_categories: tuple[str, ...] = ()

    def accepts(self, template: ItemTemplate) -> bool:
        """Return ``True`` if ``template`` can be equipped in this slot."""

        if not self.allowed_categories:
            return True
        return template.category in self.allowed_categories


@dataclass
class EquipmentSlotState:
    """Mutable runtime information for a single equipment slot."""

    definition: EquipmentSlotDefinition
    item: ItemTemplate | None = None


class EquipmentLoadout:
    """Container tracking items equipped across named slots."""

    DEFAULT_SLOTS: tuple[EquipmentSlotDefinition, ...] = (
        EquipmentSlotDefinition(
            id="head",
            name="Headgear",
            allowed_categories=("Armor - Head", "Armor"),
        ),
        EquipmentSlotDefinition(
            id="chest",
            name="Chest Plate",
            allowed_categories=("Armor - Chest", "Armor"),
        ),
        EquipmentSlotDefinition(
            id="arms",
            name="Arm Guards",
            allowed_categories=("Armor - Arms", "Armor"),
        ),
        EquipmentSlotDefinition(
            id="legs",
            name="Leg Armor",
            allowed_categories=("Armor - Legs", "Armor"),
        ),
        EquipmentSlotDefinition(
            id="artifact",
            name="Tactical Relic",
            allowed_categories=("Artifact",),
        ),
    )

    def __init__(self, slots: Iterable[EquipmentSlotDefinition] | None = None) -> None:
        slot_definitions = tuple(slots or self.DEFAULT_SLOTS)
        self._slots: list[EquipmentSlotState] = [
            EquipmentSlotState(definition=definition) for definition in slot_definitions
        ]
        self._slot_lookup: dict[str, EquipmentSlotState] = {
            slot.definition.id: slot for slot in self._slots
        }
        self._listeners: list[Callable[["EquipmentLoadout"], None]] = []

    # Slot operations -------------------------------------------------
    def equip(self, slot_id: str, item: ItemTemplate) -> bool:
        """Equip ``item`` into the slot identified by ``slot_id``."""

        slot = self._slot_lookup.get(slot_id)
        if slot is None:
            return False
        if not slot.definition.accepts(item):
            return False
        if slot.item is item:
            return True
        slot.item = item
        self._notify_changed()
        return True

    def unequip(self, slot_id: str) -> ItemTemplate | None:
        """Remove and return any item equipped in ``slot_id``."""

        slot = self._slot_lookup.get(slot_id)
        if slot is None:
            return None
        previous = slot.item
        slot.item = None
        if previous is not None:
            self._notify_changed()
        return previous

    def clear(self) -> None:
        """Unequip everything currently stored in the loadout."""

        changed = False
        for slot in self._slots:
            if slot.item is not None:
                slot.item = None
                changed = True
        if changed:
            self._notify_changed()

    # Queries ---------------------------------------------------------
    def iter_slots(self) -> Iterator[EquipmentSlotState]:
        """Yield the current slot states."""

        return iter(self._slots)

    def get_slot(self, slot_id: str) -> EquipmentSlotState | None:
        return self._slot_lookup.get(slot_id)

    def build_stat_bonuses(self) -> dict[str, float]:
        """Aggregate stat bonuses from all equipped items."""

        totals: dict[str, float] = {}
        for slot in self._slots:
            item = slot.item
            if item is None:
                continue
            for stat, value in item.stat_bonuses.items():
                totals[stat] = totals.get(stat, 0.0) + value
        return totals

    def build_summary_lines(self) -> list[str]:
        """Generate a textual summary of equipped items for UI panels."""

        lines: list[str] = []
        for slot in self._slots:
            item = slot.item
            if item is None:
                lines.append(f"{slot.definition.name}: Empty")
            else:
                lines.append(f"{slot.definition.name}: {item.name}")
        return lines

    # Change listeners ------------------------------------------------
    def add_listener(self, callback: Callable[["EquipmentLoadout"], None]) -> None:
        if callback not in self._listeners:
            self._listeners.append(callback)

    def remove_listener(self, callback: Callable[["EquipmentLoadout"], None]) -> None:
        if callback in self._listeners:
            self._listeners.remove(callback)

    def _notify_changed(self) -> None:
        for callback in list(self._listeners):
            callback(self)


__all__ = [
    "EquipmentLoadout",
    "EquipmentSlotDefinition",
    "EquipmentSlotState",
]
