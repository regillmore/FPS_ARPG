"""Simple projectile system for the prototype FPS ARPG."""

from __future__ import annotations

from dataclasses import dataclass

from panda3d.core import CardMaker, NodePath, TransparencyAttrib, Vec3, Vec4


@dataclass(frozen=True)
class ProjectileBlueprint:
    """Configuration used to spawn and drive a projectile instance."""

    id: str
    name: str
    speed: float
    lifespan: float
    color: Vec4
    scale: float = 0.08
    damage_multiplier: float = 1.0


class Projectile:
    """Runtime projectile that advances forward until its lifespan ends."""

    def __init__(
        self,
        blueprint: ProjectileBlueprint,
        parent: NodePath,
        position: Vec3,
        direction: Vec3,
        base_damage: float,
    ) -> None:
        self.blueprint = blueprint
        self.remaining_life = blueprint.lifespan
        self.damage = base_damage * blueprint.damage_multiplier

        self.node = _build_projectile_model(blueprint)
        self.node.reparentTo(parent)
        self.node.setPos(position)

        forward = Vec3(direction)
        if forward.length_squared() == 0:
            forward = Vec3(0, 1, 0)
        else:
            forward.normalize()

        look_target = position + forward
        self.node.lookAt(parent, look_target)

    # Lifecycle ------------------------------------------------------
    def update(self, dt: float) -> bool:
        """Advance the projectile, returning ``True`` while alive."""

        if self.node.isEmpty():
            return False

        self.remaining_life -= dt
        if self.remaining_life <= 0.0:
            self.destroy()
            return False

        self.node.setY(self.node, self.blueprint.speed * dt)
        return True

    def destroy(self) -> None:
        if not self.node.isEmpty():
            self.node.removeNode()


PROJECTILE_BLUEPRINTS: dict[str, ProjectileBlueprint] = {
    "standard_round": ProjectileBlueprint(
        id="standard_round",
        name="Kinetic Round",
        speed=20.0,
        lifespan=3.0,
        color=Vec4(0.95, 0.85, 0.4, 0.9),
        scale=0.06,
    ),
}


def get_projectile_blueprint(projectile_id: str) -> ProjectileBlueprint | None:
    """Return the projectile blueprint registered under ``projectile_id``."""

    return PROJECTILE_BLUEPRINTS.get(projectile_id)


def _build_projectile_model(blueprint: ProjectileBlueprint) -> NodePath:
    """Create a simple quad billboard tinted for the projectile."""

    cm = CardMaker(f"{blueprint.id}_cm")
    half = blueprint.scale * 0.5
    cm.setFrame(-half, half, -half, half)
    root = NodePath(f"{blueprint.id}_projectile")
    quad = root.attachNewNode(cm.generate())
    quad.setBillboardPointEye()
    quad.setColor(blueprint.color)
    quad.setTransparency(TransparencyAttrib.M_alpha)
    quad.setTwoSided(True)
    return root


__all__ = [
    "Projectile",
    "ProjectileBlueprint",
    "get_projectile_blueprint",
]

