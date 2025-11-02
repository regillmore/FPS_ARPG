"""Prototype enemy implementations for the FPS ARPG."""
from __future__ import annotations

from panda3d.core import (
    BitMask32,
    CardMaker,
    CollisionNode,
    CollisionSphere,
    NodePath,
    TransparencyAttrib,
    Vec3,
    Vec4,
)

from .projectiles import Projectile


class Enemy:
    """Base enemy actor that can receive projectile hits."""

    COLLIDER_TAG = "enemy"

    def __init__(
        self,
        name: str,
        parent: NodePath,
        collision_mask: BitMask32,
        *,
        max_health: float = 100.0,
    ) -> None:
        self.node = parent.attachNewNode(name)
        self.collision_mask = BitMask32(collision_mask)
        self.max_health = float(max_health)
        self.health = float(max_health)
        self.is_alive = True
        self._destroyed = False
        self.collider: NodePath | None = None

    # Lifecycle -------------------------------------------------------
    def update(self, dt: float) -> bool:
        """Advance the enemy state. Return ``True`` to remain active."""

        if self._destroyed:
            return False
        self._update(dt)
        return not self._destroyed

    def _update(self, dt: float) -> None:  # pragma: no cover - hooks for subclasses
        """Optional per-frame update hook for subclasses."""

    def destroy(self) -> None:
        if self._destroyed:
            return
        self._destroyed = True
        self._teardown()

    def _teardown(self) -> None:
        if self.collider is not None:
            if not self.collider.isEmpty():
                self.collider.clearPythonTag(self.COLLIDER_TAG)
                self.collider.removeNode()
            self.collider = None
        if not self.node.isEmpty():
            self.node.removeNode()

    # Combat ---------------------------------------------------------
    def handle_projectile_hit(
        self,
        projectile: Projectile,
        hit_point: Vec3,
        hit_normal: Vec3,
    ) -> None:
        """Called when a projectile intersects the enemy collider."""

        self.take_damage(projectile.damage)

    def take_damage(self, amount: float) -> None:
        if not self.is_alive or self._destroyed:
            return
        self.health = max(0.0, self.health - amount)
        self.on_damage(amount)
        if self.health <= 0.0:
            self.is_alive = False
            self.on_death()
            self._on_downed()

    def on_damage(self, amount: float) -> None:  # pragma: no cover - hooks
        """Optional callback when the enemy takes damage."""

    def on_death(self) -> None:  # pragma: no cover - hooks
        """Optional callback invoked when health reaches zero."""

    def _on_downed(self) -> None:
        self.set_collider_enabled(False)

    # Collision -------------------------------------------------------
    def register_collider(self, collider: NodePath) -> None:
        self.collider = collider
        self.collider.setPythonTag(self.COLLIDER_TAG, self)
        self.set_collider_enabled(self.is_alive)

    def set_collider_enabled(self, enabled: bool) -> None:
        if self.collider is None or self.collider.isEmpty():
            return
        mask = self.collision_mask if enabled else BitMask32.allOff()
        collider_node = self.collider.node()
        if isinstance(collider_node, CollisionNode):
            collider_node.setIntoCollideMask(mask)


class TargetDummy(Enemy):
    """Static, low-poly target dummy for safe practice areas."""

    RESPAWN_DELAY = 4.0

    def __init__(self, parent: NodePath, collision_mask: BitMask32) -> None:
        super().__init__(
            "target_dummy",
            parent,
            collision_mask,
            max_health=60.0,
        )
        self._base_color = Vec4(0.82, 0.47, 0.32, 1.0)
        self.model = self._build_model(self.node, self._base_color)
        self._flash_timer = 0.0
        self._flash_duration = 0.2
        self._respawn_timer = 0.0
        self._knocked_down = False

        collider_node = CollisionNode("target_dummy_collider")
        collider_node.addSolid(CollisionSphere(0, 0, 0.9, 0.9))
        collider = self.node.attachNewNode(collider_node)
        self.register_collider(collider)

        self.model.setTransparency(TransparencyAttrib.M_alpha)

    # Hooks -----------------------------------------------------------
    def _update(self, dt: float) -> None:
        if self._flash_timer > 0.0:
            self._flash_timer = max(0.0, self._flash_timer - dt)
            self._apply_flash()
        elif self.model.hasColorScale() and self.is_alive:
            self.model.clearColorScale()

        if not self.is_alive:
            self._respawn_timer = max(0.0, self._respawn_timer - dt)
            if self._respawn_timer == 0.0 and self._knocked_down:
                self._reset()

    def on_damage(self, amount: float) -> None:
        self._flash_timer = self._flash_duration
        self._apply_flash()

    def on_death(self) -> None:
        self._flash_timer = 0.0
        self._respawn_timer = self.RESPAWN_DELAY
        self._knocked_down = True
        self.node.setP(-25.0)
        self.node.setR(8.0)
        self.model.setColorScale(Vec4(0.35, 0.35, 0.35, 1.0))

    def _on_downed(self) -> None:
        super()._on_downed()

    # Helpers ---------------------------------------------------------
    def _apply_flash(self) -> None:
        if self._flash_timer <= 0.0:
            self.model.clearColorScale()
            return
        intensity = self._flash_timer / self._flash_duration
        scale = 1.0 + 0.6 * intensity
        self.model.setColorScale(Vec4(scale, scale, scale, 1.0))

    def _reset(self) -> None:
        self.health = self.max_health
        self.is_alive = True
        self._knocked_down = False
        self._respawn_timer = 0.0
        self.node.setP(0.0)
        self.node.setR(0.0)
        self.model.clearColorScale()
        self.set_collider_enabled(True)

    def _build_model(self, parent: NodePath, body_color: Vec4) -> NodePath:
        root = parent.attachNewNode("target_dummy_model")

        stand_cm = CardMaker("target_dummy_stand")
        stand_cm.setFrame(-0.18, 0.18, 0.0, 0.35)
        stand_front = root.attachNewNode(stand_cm.generate())
        stand_front.setTwoSided(True)
        stand_front.setColor(Vec4(0.28, 0.3, 0.32, 1.0))
        stand_front.setPos(0, 0, 0.02)

        stand_side = root.attachNewNode(stand_cm.generate())
        stand_side.setTwoSided(True)
        stand_side.setH(90)
        stand_side.setColor(Vec4(0.22, 0.24, 0.26, 1.0))
        stand_side.setPos(0, 0, 0.02)

        body_cm = CardMaker("target_dummy_body")
        body_cm.setFrame(-0.45, 0.45, 0.25, 1.7)
        body_front = root.attachNewNode(body_cm.generate())
        body_front.setTwoSided(True)
        body_front.setPos(0, 0.0, 0.0)
        body_front.setColor(body_color)

        body_side = root.attachNewNode(body_cm.generate())
        body_side.setTwoSided(True)
        body_side.setH(90)
        body_side.setColor(body_color)

        head_cm = CardMaker("target_dummy_head")
        head_cm.setFrame(-0.3, 0.3, 1.25, 1.85)
        head_front = root.attachNewNode(head_cm.generate())
        head_front.setTwoSided(True)
        head_front.setColor(Vec4(0.9, 0.85, 0.78, 1.0))

        head_side = root.attachNewNode(head_cm.generate())
        head_side.setTwoSided(True)
        head_side.setH(90)
        head_side.setColor(Vec4(0.9, 0.85, 0.78, 1.0))

        center_cm = CardMaker("target_dummy_center")
        center_cm.setFrame(-0.18, 0.18, 0.85, 1.25)
        center_front = root.attachNewNode(center_cm.generate())
        center_front.setTwoSided(True)
        center_front.setColor(Vec4(0.95, 0.92, 0.6, 1.0))

        center_side = root.attachNewNode(center_cm.generate())
        center_side.setTwoSided(True)
        center_side.setH(90)
        center_side.setColor(Vec4(0.95, 0.92, 0.6, 1.0))

        return root


__all__ = [
    "Enemy",
    "TargetDummy",
]
