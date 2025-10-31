"""Equipment slot definitions and management helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Iterator

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

    # Slot operations -------------------------------------------------
    def equip(self, slot_id: str, item: ItemTemplate) -> bool:
        """Equip ``item`` into the slot identified by ``slot_id``."""

        slot = self._slot_lookup.get(slot_id)
        if slot is None:
            return False
        if not slot.definition.accepts(item):
            return False
        slot.item = item
        return True

    def unequip(self, slot_id: str) -> ItemTemplate | None:
        """Remove and return any item equipped in ``slot_id``."""

        slot = self._slot_lookup.get(slot_id)
        if slot is None:
            return None
        previous = slot.item
        slot.item = None
        return previous

    def clear(self) -> None:
        """Unequip everything currently stored in the loadout."""

        for slot in self._slots:
            slot.item = None

    # Queries ---------------------------------------------------------
    def iter_slots(self) -> Iterator[EquipmentSlotState]:
        """Yield the current slot states."""

        return iter(self._slots)

    def get_slot(self, slot_id: str) -> EquipmentSlotState | None:
        return self._slot_lookup.get(slot_id)

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


__all__ = [
    "EquipmentLoadout",
    "EquipmentSlotDefinition",
    "EquipmentSlotState",
]
