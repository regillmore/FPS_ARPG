"""Inventory data models and helper routines."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ItemTemplate:
    """Static definition describing an inventory item."""

    id: str
    name: str
    description: str
    category: str
    stack_limit: int = 1

    def __post_init__(self) -> None:
        if self.stack_limit < 1:
            raise ValueError("stack_limit must be at least 1")


@dataclass
class InventoryStack:
    """Represents a stack of identical items stored together."""

    template: ItemTemplate
    quantity: int = 0

    def space_remaining(self) -> int:
        return max(0, self.template.stack_limit - self.quantity)


class Inventory:
    """Simple inventory container supporting stackable items."""

    def __init__(self, capacity: int = 24) -> None:
        self.capacity = capacity
        self.stacks: list[InventoryStack | None] = [None] * capacity

    # Core management -------------------------------------------------
    def add_item(self, template: ItemTemplate, quantity: int = 1) -> int:
        """Add ``quantity`` items and return any remainder not stored."""

        if quantity <= 0:
            return 0

        remaining = quantity

        # Fill existing stacks first.
        for stack in self.stacks:
            if stack is None or stack.template.id != template.id:
                continue
            space = stack.space_remaining()
            if space <= 0:
                continue
            to_add = min(space, remaining)
            stack.quantity += to_add
            remaining -= to_add
            if remaining == 0:
                return 0

        # Create new stacks if there is capacity remaining.
        while remaining > 0:
            empty_index = self._find_empty_index()
            if empty_index is None:
                break
            to_add = min(template.stack_limit, remaining)
            self.stacks[empty_index] = InventoryStack(
                template=template, quantity=to_add
            )
            remaining -= to_add

        return remaining

    def remove_item(self, item_id: str, quantity: int = 1) -> int:
        """Remove items matching ``item_id`` and return the amount removed."""

        if quantity <= 0:
            return 0

        removed = 0
        for index, stack in enumerate(self.stacks):
            if stack is None or stack.template.id != item_id:
                continue
            take = min(stack.quantity, quantity - removed)
            stack.quantity -= take
            removed += take
            if stack.quantity == 0:
                self.stacks[index] = None
            if removed >= quantity:
                break
        return removed

    # Query helpers ---------------------------------------------------
    def count_unique(self) -> int:
        return sum(1 for stack in self.stacks if stack is not None)

    def is_full(self) -> bool:
        return self.count_unique() >= self.capacity

    def build_summary_lines(self) -> list[str]:
        """Return formatted lines suitable for the inventory UI."""

        lines: list[str] = [
            f"Capacity: {self.count_unique()} / {self.capacity}",
            "",
        ]

        if not self.stacks:
            lines.append("Inventory is empty.")
            return lines

        for slot_index, stack in enumerate(self.stacks, start=1):
            if stack is None:
                continue
            lines.append(f"{slot_index:02}. {stack.template.name}")
            lines.append(
                f"    {stack.template.category}  x{stack.quantity}" +
                (" (Full)" if stack.space_remaining() == 0 else "")
            )
            if stack.template.description:
                lines.append(f"    {stack.template.description}")
            lines.append("")

        if lines[-1] == "":
            lines.pop()

        return lines

    # Slot management -------------------------------------------------
    def move_stack(self, source_index: int, target_index: int) -> bool:
        """Swap or move a stack between slots.

        Returns ``True`` if a move occurred.
        """

        if not (0 <= source_index < self.capacity):
            return False
        if not (0 <= target_index < self.capacity):
            return False
        if source_index == target_index:
            return False

        source_stack = self.stacks[source_index]
        if source_stack is None:
            return False

        target_stack = self.stacks[target_index]
        self.stacks[target_index] = source_stack
        self.stacks[source_index] = target_stack
        return True

    def _find_empty_index(self) -> int | None:
        for index, stack in enumerate(self.stacks):
            if stack is None:
                return index
        return None


__all__ = ["Inventory", "InventoryStack", "ItemTemplate"]
