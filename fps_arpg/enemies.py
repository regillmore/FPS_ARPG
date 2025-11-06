"""Prototype enemy implementations for the FPS ARPG."""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Callable

from direct.showbase import ShowBaseGlobal
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


@dataclass
class _TrackSegment:
    """Simple container describing a single animated tread segment."""

    node: NodePath
    distance: float
    side: int


if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from .ui import FloatingDamageNumbers


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
        self._damage_number_manager: "FloatingDamageNumbers | None" = None

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
        self._spawn_damage_number(amount)
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

    def set_damage_number_manager(
        self, manager: "FloatingDamageNumbers | None"
    ) -> None:
        self._damage_number_manager = manager

    def _spawn_damage_number(self, amount: float) -> None:
        if self._damage_number_manager is None or amount <= 0.0:
            return
        if self.node.isEmpty():
            return
        world_pos = self.node.getPos(ShowBaseGlobal.render2d)
        world_pos += Vec3(0.0, 0.0, self._health_bar_offset + 0.4)
        self._damage_number_manager.spawn(amount, world_pos)


class TargetDummy(Enemy):
    """Static, low-poly target dummy for safe practice areas."""

    RESPAWN_DELAY = 4.0

    def __init__(
        self,
        parent: NodePath,
        collision_mask: BitMask32,
        *,
        on_death_callback: Callable[["TargetDummy"], None] | None = None,
    ) -> None:
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
        self._on_death_callback = on_death_callback

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
        if self._on_death_callback is not None:
            self._on_death_callback(self)

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


class TrackedDummy(TargetDummy):
    """Target dummy variant mounted on animated treads."""

    TRACK_SPEED = 1.4

    def __init__(
        self,
        parent: NodePath,
        collision_mask: BitMask32,
        *,
        track_speed: float | None = None,
        on_death_callback: Callable[["TargetDummy"], None] | None = None,
    ) -> None:
        self._track_segments: list[_TrackSegment] = []
        self._track_speed = float(track_speed) if track_speed is not None else float(self.TRACK_SPEED)
        self._track_spacing = 0.0
        self._track_bottom_length = 0.0
        self._track_vertical_height = 0.0
        self._track_bottom_z = 0.0
        self._track_loop_length = 0.0
        self._segments_per_side = 0
        super().__init__(
            parent,
            collision_mask,
            on_death_callback=on_death_callback,
        )

    def _update(self, dt: float) -> None:
        super()._update(dt)
        self._update_tracks(dt)

    def _build_model(self, parent: NodePath, body_color: Vec4) -> NodePath:
        self._track_segments.clear()

        root = parent.attachNewNode("tracked_dummy_model")

        deck = _make_box(
            Vec3(0.44, 0.52, 0.07),
            Vec4(0.16, 0.18, 0.2, 1.0),
            "tracked_dummy_deck",
        )
        deck.reparentTo(root)
        deck.setZ(0.07)

        chassis = _make_box(
            Vec3(0.34, 0.4, 0.16),
            Vec4(0.26, 0.28, 0.32, 1.0),
            "tracked_dummy_chassis",
        )
        chassis.reparentTo(root)
        chassis.setZ(0.31)

        turret_ring = _make_box(
            Vec3(0.28, 0.28, 0.06),
            Vec4(0.32, 0.34, 0.38, 1.0),
            "tracked_dummy_turret_ring",
        )
        turret_ring.reparentTo(root)
        turret_ring.setZ(0.52)

        sensor_core = _make_box(
            Vec3(0.16, 0.16, 0.08),
            Vec4(0.95, 0.92, 0.6, 1.0),
            "tracked_dummy_sensor_core",
        )
        sensor_core.reparentTo(root)
        sensor_core.setPos(0.0, 0.0, 0.62)

        self._build_tracks(root)

        stabilizer = _make_box(
            Vec3(0.18, 0.3, 0.12),
            Vec4(0.2, 0.22, 0.26, 1.0),
            "tracked_dummy_stabilizer",
        )
        stabilizer.reparentTo(root)
        stabilizer.setPos(0.0, -0.02, 0.82)

        torso = _make_box(
            Vec3(0.28, 0.18, 0.36),
            body_color,
            "tracked_dummy_torso",
        )
        torso.reparentTo(root)
        torso.setPos(0.0, 0.02, 1.1)

        shoulders = _make_box(
            Vec3(0.4, 0.12, 0.12),
            Vec4(0.76, 0.5, 0.38, 1.0),
            "tracked_dummy_shoulders",
        )
        shoulders.reparentTo(root)
        shoulders.setPos(0.0, 0.0, 1.22)

        head = _make_box(
            Vec3(0.2, 0.18, 0.22),
            Vec4(0.9, 0.85, 0.78, 1.0),
            "tracked_dummy_head",
        )
        head.reparentTo(root)
        head.setPos(0.0, 0.0, 1.82)

        visor = _make_box(
            Vec3(0.14, 0.02, 0.08),
            Vec4(0.26, 0.3, 0.36, 1.0),
            "tracked_dummy_visor",
        )
        visor.reparentTo(root)
        visor.setPos(0.0, 0.2, 1.84)

        antenna = _make_box(
            Vec3(0.02, 0.02, 0.32),
            Vec4(0.3, 0.32, 0.36, 1.0),
            "tracked_dummy_antenna",
        )
        antenna.reparentTo(root)
        antenna.setPos(-0.16, -0.08, 1.82)

        return root

    def _build_tracks(self, root: NodePath) -> None:
        track_color = Vec4(0.14, 0.16, 0.19, 1.0)
        housing_color = Vec4(0.22, 0.24, 0.28, 1.0)
        roller_color = Vec4(0.32, 0.34, 0.38, 1.0)

        self._track_spacing = 0.46
        self._track_bottom_length = 1.08
        self._track_vertical_height = 0.44
        track_thickness = 0.1
        self._track_bottom_z = track_thickness / 2.0
        self._track_loop_length = 2.0 * (self._track_bottom_length + self._track_vertical_height)
        self._segments_per_side = 12

        guard = _make_box(
            Vec3(0.06, self._track_bottom_length / 2.0 + 0.08, self._track_vertical_height / 2.0 + 0.12),
            housing_color,
            "tracked_dummy_track_guard",
        )
        guard.reparentTo(root)
        guard.setPos(self._track_spacing - 0.08, 0.0, self._track_bottom_z + self._track_vertical_height / 2.0 + 0.06)

        guard_mirror = guard.copyTo(root)
        guard_mirror.setX(-guard.getX())

        for offset in (-1.0, 1.0):
            roller = _make_box(
                Vec3(0.08, 0.12, 0.08),
                roller_color,
                "tracked_dummy_drive_wheel",
            )
            roller.reparentTo(root)
            roller.setPos(offset * self._track_spacing, self._track_bottom_length / 2.0 + 0.02, self._track_bottom_z + self._track_vertical_height)

            idler = roller.copyTo(root)
            idler.setY(-roller.getY())

        if self._segments_per_side <= 0 or self._track_loop_length <= 0.0:
            return

        segment_half_extents = Vec3(0.05, 0.14, track_thickness / 2.0)
        segment_spacing = self._track_loop_length / self._segments_per_side

        for side in (-1, 1):
            side_name = "left" if side < 0 else "right"
            for index in range(self._segments_per_side):
                distance = index * segment_spacing
                segment = _make_box(
                    segment_half_extents,
                    track_color,
                    f"tracked_dummy_{side_name}_tread_{index}",
                )
                segment.reparentTo(root)
                tread = _TrackSegment(segment, distance, side)
                self._track_segments.append(tread)
                self._apply_track_pose(tread)

    def _apply_track_pose(self, segment: _TrackSegment) -> None:
        position, hpr = self._compute_track_pose(segment.distance)
        segment.node.setPos(segment.side * self._track_spacing, position.y, position.z)
        segment.node.setHpr(*hpr)

    def _compute_track_pose(self, distance: float) -> tuple[Vec3, tuple[float, float, float]]:
        if self._track_loop_length <= 0.0:
            return Vec3(0.0, 0.0, self._track_bottom_z), (0.0, 0.0, 0.0)

        bottom_len = self._track_bottom_length
        vertical_height = self._track_vertical_height
        loop = self._track_loop_length
        bottom_z = self._track_bottom_z
        top_z = bottom_z + vertical_height
        half_bottom = bottom_len / 2.0

        progress = distance % loop

        if progress < bottom_len:
            y = -half_bottom + progress
            z = bottom_z
            hpr = (0.0, 0.0, 0.0)
        elif progress < bottom_len + vertical_height:
            climb = progress - bottom_len
            y = half_bottom
            z = bottom_z + climb
            hpr = (0.0, -90.0, 0.0)
        elif progress < bottom_len + vertical_height + bottom_len:
            traverse = progress - bottom_len - vertical_height
            y = half_bottom - traverse
            z = top_z
            hpr = (180.0, 0.0, 0.0)
        else:
            descend = progress - (bottom_len * 2.0 + vertical_height)
            y = -half_bottom
            z = top_z - descend
            hpr = (0.0, 90.0, 0.0)

        return Vec3(0.0, y, z), hpr

    def _update_tracks(self, dt: float) -> None:
        if not self.is_alive or self._track_loop_length <= 0.0:
            return
        if not self._track_segments:
            return
        if self._track_speed == 0.0:
            return

        for segment in self._track_segments:
            segment.distance = (segment.distance + self._track_speed * dt) % self._track_loop_length
            self._apply_track_pose(segment)

    def _reset(self) -> None:
        super()._reset()
        for segment in self._track_segments:
            self._apply_track_pose(segment)


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
        ((1, 0, 3, 2), Vec3(0, 0, -1)),  # Bottom
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
    "TrackedDummy",
]
