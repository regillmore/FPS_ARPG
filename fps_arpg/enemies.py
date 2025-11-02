"""Prototype enemy implementations for the FPS ARPG."""
from __future__ import annotations

from panda3d.core import (
    BitMask32,
    CardMaker,
    CollisionNode,
    CollisionSphere,
    Geom,
    GeomNode,
    GeomTriangles,
    GeomVertexData,
    GeomVertexFormat,
    GeomVertexWriter,
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
        health_bar_offset: float = 2.2,
    ) -> None:
        self.node = parent.attachNewNode(name)
        self.collision_mask = BitMask32(collision_mask)
        self.max_health = float(max_health)
        self.health = float(max_health)
        self.is_alive = True
        self._destroyed = False
        self.collider: NodePath | None = None
        self._health_bar_offset = float(health_bar_offset)
        self._health_bar_root: NodePath | None = None
        self._health_bar_fill_parent: NodePath | None = None
        self._health_bar_visible = False

        self._build_health_bar()
        self._update_health_bar()

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
        if self._health_bar_root is not None:
            if not self._health_bar_root.isEmpty():
                self._health_bar_root.removeNode()
            self._health_bar_root = None
        self._health_bar_fill_parent = None
        if not self.node.isEmpty():
            self.node.removeNode()

    # UI -------------------------------------------------------------
    def _build_health_bar(self) -> None:
        width = 1.2
        height = 0.16
        border = 0.04
        fill_width = max(width - border * 2.0, 0.0)
        fill_height = max(height - border * 2.0, 0.0)

        root = self.node.attachNewNode("health_bar")
        root.setPos(0.0, 0.0, self._health_bar_offset)
        root.setBillboardPointWorld()
        root.setTransparency(TransparencyAttrib.M_alpha)
        root.setDepthTest(False)
        root.setDepthWrite(False)
        root.setLightOff(1)
        root.setBin("fixed", 0)
        root.hide()

        cm_bg = CardMaker("enemy_health_bar_bg")
        cm_bg.setFrame(-width / 2.0, width / 2.0, -height / 2.0, height / 2.0)
        background = root.attachNewNode(cm_bg.generate())
        background.setColor(Vec4(0.02, 0.02, 0.02, 0.75))
        background.setTransparency(TransparencyAttrib.M_alpha)
        background.setDepthTest(False)
        background.setDepthWrite(False)
        background.setLightOff(1)
        background.setBin("fixed", 0)

        fill_parent = root.attachNewNode("enemy_health_bar_fill")
        fill_parent.setPos(-width / 2.0 + border, 0.0, 0.0)

        cm_fill = CardMaker("enemy_health_bar_fill_geom")
        cm_fill.setFrame(0.0, fill_width, -fill_height / 2.0, fill_height / 2.0)
        fill_geom = fill_parent.attachNewNode(cm_fill.generate())
        fill_geom.setColor(Vec4(0.83, 0.21, 0.26, 0.95))
        fill_geom.setTransparency(TransparencyAttrib.M_alpha)
        fill_geom.setDepthTest(False)
        fill_geom.setDepthWrite(False)
        fill_geom.setLightOff(1)
        fill_geom.setBin("fixed", 1)

        self._health_bar_root = root
        self._health_bar_fill_parent = fill_parent
        self._health_bar_visible = False

    def _update_health_bar(self) -> None:
        if (
            self._health_bar_root is None
            or self._health_bar_root.isEmpty()
            or self._health_bar_fill_parent is None
            or self._health_bar_fill_parent.isEmpty()
        ):
            return

        ratio = 0.0 if self.max_health <= 0.0 else self.health / self.max_health
        ratio = max(0.0, min(1.0, ratio))
        self._health_bar_fill_parent.setScale(ratio, 1.0, 1.0)

        should_show = self.is_alive and ratio < 0.999
        if should_show:
            self._health_bar_root.show()
        else:
            self._health_bar_root.hide()
        self._health_bar_visible = should_show

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
        self._update_health_bar()

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
        self._update_health_bar()

    def _build_model(self, parent: NodePath, body_color: Vec4) -> NodePath:
        root = parent.attachNewNode("target_dummy_model")

        base = _make_box(Vec3(0.26, 0.26, 0.05), Vec4(0.2, 0.22, 0.26, 1.0), "dummy_base")
        base.reparentTo(root)
        base.setPos(0.0, 0.0, 0.05)

        support = _make_box(Vec3(0.08, 0.08, 0.32), Vec4(0.28, 0.3, 0.34, 1.0), "dummy_support")
        support.reparentTo(root)
        support.setPos(0.0, 0.0, 0.42)

        torso = _make_box(Vec3(0.3, 0.16, 0.42), body_color, "dummy_torso")
        torso.reparentTo(root)
        torso.setPos(0.0, 0.0, 1.16)

        shoulders = _make_box(Vec3(0.4, 0.12, 0.12), Vec4(0.76, 0.5, 0.38, 1.0), "dummy_shoulders")
        shoulders.reparentTo(root)
        shoulders.setPos(0.0, 0.0, 1.24)

        head = _make_box(Vec3(0.2, 0.18, 0.22), Vec4(0.9, 0.85, 0.78, 1.0), "dummy_head")
        head.reparentTo(root)
        head.setPos(0.0, 0.0, 1.84)

        visor = _make_box(Vec3(0.14, 0.02, 0.08), Vec4(0.32, 0.36, 0.42, 1.0), "dummy_visor")
        visor.reparentTo(root)
        visor.setPos(0.0, 0.2, 1.86)

        core = _make_box(Vec3(0.12, 0.025, 0.14), Vec4(0.95, 0.92, 0.6, 1.0), "dummy_core")
        core.reparentTo(root)
        core.setPos(0.0, 0.18, 1.1)

        harness = _make_box(Vec3(0.18, 0.03, 0.32), Vec4(0.24, 0.28, 0.34, 1.0), "dummy_harness")
        harness.reparentTo(root)
        harness.setPos(0.0, -0.18, 1.16)

        return root


def _make_box(half_extents: Vec3, color: Vec4, name: str) -> NodePath:
    """Create a coloured box primitive."""

    format = GeomVertexFormat.getV3n3c4()
    vdata = GeomVertexData(name, format, Geom.UHStatic)
    vertex = GeomVertexWriter(vdata, "vertex")
    normal = GeomVertexWriter(vdata, "normal")
    color_writer = GeomVertexWriter(vdata, "color")

    hx, hy, hz = half_extents
    corners = [
        Vec3(-hx, -hy, -hz),
        Vec3(hx, -hy, -hz),
        Vec3(hx, hy, -hz),
        Vec3(-hx, hy, -hz),
        Vec3(-hx, -hy, hz),
        Vec3(hx, -hy, hz),
        Vec3(hx, hy, hz),
        Vec3(-hx, hy, hz),
    ]

    faces = [
        ((0, 1, 2, 3), Vec3(0, 0, -1)),  # Bottom
        ((4, 5, 6, 7), Vec3(0, 0, 1)),  # Top
        ((2, 3, 7, 6), Vec3(0, 1, 0)),  # Front
        ((0, 1, 5, 4), Vec3(0, -1, 0)),  # Back
        ((1, 2, 6, 5), Vec3(1, 0, 0)),  # Right
        ((3, 0, 4, 7), Vec3(-1, 0, 0)),  # Left
    ]

    prim = GeomTriangles(Geom.UHStatic)
    vert_index = 0

    for indices, face_normal in faces:
        for idx in indices:
            vertex.addData3f(corners[idx])
            normal.addData3f(face_normal)
            color_writer.addData4f(color)
        prim.addVertices(vert_index, vert_index + 1, vert_index + 2)
        prim.addVertices(vert_index, vert_index + 2, vert_index + 3)
        vert_index += 4

    prim.closePrimitive()

    geom = Geom(vdata)
    geom.addPrimitive(prim)

    node = GeomNode(name)
    node.addGeom(geom)

    return NodePath(node)


__all__ = [
    "Enemy",
    "TargetDummy",
]
