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
        self.stacks: list[InventoryStack] = []

    # Core management -------------------------------------------------
    def add_item(self, template: ItemTemplate, quantity: int = 1) -> int:
        """Add ``quantity`` items and return any remainder not stored."""

        if quantity <= 0:
            return 0

        remaining = quantity

        # Fill existing stacks first.
        for stack in self.stacks:
            if stack.template.id != template.id:
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
        while remaining > 0 and len(self.stacks) < self.capacity:
            to_add = min(template.stack_limit, remaining)
            self.stacks.append(InventoryStack(template=template, quantity=to_add))
            remaining -= to_add

        return remaining

    def remove_item(self, item_id: str, quantity: int = 1) -> int:
        """Remove items matching ``item_id`` and return the amount removed."""

        if quantity <= 0:
            return 0

        removed = 0
        for stack in list(self.stacks):
            if stack.template.id != item_id:
                continue
            take = min(stack.quantity, quantity - removed)
            stack.quantity -= take
            removed += take
            if stack.quantity == 0:
                self.stacks.remove(stack)
            if removed >= quantity:
                break
        return removed

    # Query helpers ---------------------------------------------------
    def count_unique(self) -> int:
        return len(self.stacks)

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

        for index, stack in enumerate(self.stacks, start=1):
            lines.append(f"{index:02}. {stack.template.name}")
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


__all__ = ["Inventory", "InventoryStack", "ItemTemplate"]
