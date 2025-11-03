"""Safehouse map resource providing modular geometry and collision setup."""

from __future__ import annotations

from dataclasses import dataclass

from panda3d.core import (
    AmbientLight,
    BitMask32,
    CardMaker,
    CollisionNode,
    CollisionPlane,
    DirectionalLight,
    NodePath,
    Plane,
    Point3,
    Vec3,
    Vec4,
)


@dataclass
class SafehouseMapInstance:
    """Collection of nodes generated when the safehouse map is built."""

    root: NodePath
    environment_collider: NodePath
    projectile_decal_root: NodePath
    lights: tuple[NodePath, ...]
    stash_anchor: NodePath


class SafehouseMap:
    """Factory for building the prototype safehouse environment."""

    def __init__(
        self,
        *,
        width: float,
        length: float,
        height: float,
        environment_collision_mask: BitMask32,
    ) -> None:
        self.width = width
        self.length = length
        self.height = height
        self.environment_collision_mask = environment_collision_mask

    def build(self, parent: NodePath) -> SafehouseMapInstance:
        """Attach the safehouse environment to ``parent`` and return its nodes."""

        safehouse_root = parent.attachNewNode("safehouse")

        floor_cm = CardMaker("safehouse_floor")
        floor_cm.setFrame(
            -self.width / 2,
            self.width / 2,
            -self.length / 2,
            self.length / 2,
        )
        floor = safehouse_root.attachNewNode(floor_cm.generate())
        floor.setPos(0, 0, 0)
        floor.setHpr(0, -90, 0)
        floor.setColor(0.18, 0.18, 0.2, 1)

        ceiling_cm = CardMaker("safehouse_ceiling")
        ceiling_cm.setFrame(
            -self.width / 2,
            self.width / 2,
            -self.length / 2,
            self.length / 2,
        )
        ceiling = safehouse_root.attachNewNode(ceiling_cm.generate())
        ceiling.setPos(0, 0, self.height)
        ceiling.setHpr(0, 90, 0)
        ceiling.setColor(0.16, 0.16, 0.18, 1)

        wall_color = Vec4(0.3, 0.32, 0.36, 1)

        def make_wall(name: str, width: float, height: float) -> NodePath:
            cm = CardMaker(name)
            cm.setFrame(-width / 2, width / 2, 0.0, height)
            wall_np = safehouse_root.attachNewNode(cm.generate())
            wall_np.setColor(wall_color)
            return wall_np

        front_wall = make_wall("safehouse_wall_front", self.width, self.height)
        front_wall.setHpr(0, 0, 0)
        front_wall.setPos(0, self.length / 2, 0)

        back_wall = make_wall("safehouse_wall_back", self.width, self.height)
        back_wall.setHpr(180, 0, 0)
        back_wall.setPos(0, -self.length / 2, 0)

        left_wall = make_wall("safehouse_wall_left", self.length, self.height)
        left_wall.setHpr(90, 0, 0)
        left_wall.setPos(-self.width / 2, 0, 0)

        right_wall = make_wall("safehouse_wall_right", self.length, self.height)
        right_wall.setHpr(-90, 0, 0)
        right_wall.setPos(self.width / 2, 0, 0)

        ambient_light = AmbientLight("safehouse_ambient")
        ambient_light.setColor(Vec4(0.25, 0.25, 0.28, 1))
        ambient_np = safehouse_root.attachNewNode(ambient_light)

        key_light = DirectionalLight("safehouse_key")
        key_light.setColor(Vec4(0.7, 0.7, 0.75, 1))
        key_light_np = safehouse_root.attachNewNode(key_light)
        key_light_np.setHpr(-35, -60, 0)

        for light_np in (ambient_np, key_light_np):
            safehouse_root.setLight(light_np)

        environment_node = CollisionNode("safehouse_bounds")
        environment_node.setFromCollideMask(BitMask32.allOff())
        environment_node.setIntoCollideMask(self.environment_collision_mask)

        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(0, -1, 0), Point3(0, self.length / 2, 0)))
        )
        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(0, 1, 0), Point3(0, -self.length / 2, 0)))
        )
        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(1, 0, 0), Point3(-self.width / 2, 0, 0)))
        )
        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(-1, 0, 0), Point3(self.width / 2, 0, 0)))
        )
        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(0, 0, 1), Point3(0, 0, 0)))
        )
        environment_node.addSolid(
            CollisionPlane(Plane(Vec3(0, 0, -1), Point3(0, 0, self.height)))
        )

        environment_collider = safehouse_root.attachNewNode(environment_node)

        projectile_decal_root = safehouse_root.attachNewNode("projectile_decals")

        stash_anchor = safehouse_root.attachNewNode("stash_anchor")
        stash_anchor.setPos(-6.0, -38.0, 0.0)

        pad_cm = CardMaker("safehouse_stash_pad")
        pad_cm.setFrame(-1.3, 1.3, -1.3, 1.3)
        stash_pad = stash_anchor.attachNewNode(pad_cm.generate())
        stash_pad.setHpr(0, -90, 0)
        stash_pad.setZ(0.01)
        stash_pad.setColor(0.22, 0.24, 0.3, 1)

        return SafehouseMapInstance(
            root=safehouse_root,
            environment_collider=environment_collider,
            projectile_decal_root=projectile_decal_root,
            lights=(ambient_np, key_light_np),
            stash_anchor=stash_anchor,
        )
