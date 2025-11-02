"""World item pickups that can be collected by the player."""

from __future__ import annotations

import math
import random

from typing import TYPE_CHECKING

from panda3d.core import NodePath, TransparencyAttrib, Vec3, Vec4

from .inventory import ItemTemplate

if TYPE_CHECKING:  # pragma: no cover - typing only
    from .inventory import Inventory


class ItemPickup:
    """Floating item pickup that can be collected by the player."""

    PICKUP_RADIUS = 1.25
    ROTATION_SPEED = 45.0
    BOB_AMPLITUDE = 0.12
    BOB_PERIOD = 1.8

    def __init__(
        self,
        parent: NodePath,
        template: ItemTemplate,
        quantity: int = 1,
    ) -> None:
        self.template = template
        self.quantity = max(1, quantity)
        self.node = parent.attachNewNode(f"item_pickup_{template.id}")
        self.node.setTransparency(TransparencyAttrib.M_alpha)

        self._model = self._build_model(self.node)
        self._elapsed = random.random() * self.BOB_PERIOD
        self._rotation = random.random() * 360.0
        self._destroyed = False

    def _build_model(self, parent: NodePath) -> NodePath:
        size = Vec3(0.18, 0.18, 0.18)
        color = Vec4(0.85, 0.92, 1.0, 0.95)
        model = parent.attachNewNode("pickup_model")

        from .enemies import _make_box  # local import to avoid cycle at load time

        geometry = _make_box(size, color, "item_pickup_box")
        geometry.reparentTo(model)
        geometry.setTransparency(TransparencyAttrib.M_alpha)

        return model

    def update(self, dt: float) -> None:
        if self._destroyed or self.node.isEmpty():
            return
        self._elapsed = (self._elapsed + dt) % self.BOB_PERIOD
        bob_offset = math.sin((self._elapsed / self.BOB_PERIOD) * math.tau)
        self._model.setZ(0.4 + bob_offset * self.BOB_AMPLITUDE)

        self._rotation = (self._rotation + self.ROTATION_SPEED * dt) % 360.0
        self._model.setH(self._rotation)

    def try_collect(self, player_np: NodePath, inventory: "Inventory") -> bool:
        """Attempt to collect the pickup. Returns ``True`` if consumed."""

        if (
            self._destroyed
            or self.node.isEmpty()
            or player_np is None
            or player_np.isEmpty()
        ):
            return False

        if player_np.getDistance(self.node) > self.PICKUP_RADIUS:
            return False

        remaining = inventory.add_item(self.template, self.quantity)
        if remaining == self.quantity:
            # Inventory is full or rejected the item.
            return False

        self.quantity = remaining
        if self.quantity <= 0:
            self.destroy()
            return True
        return False

    def destroy(self) -> None:
        if self._destroyed:
            return
        self._destroyed = True
        if not self.node.isEmpty():
            self.node.removeNode()


__all__ = ["ItemPickup"]

