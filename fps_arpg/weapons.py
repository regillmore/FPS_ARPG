"""Lightweight weapon system prototype for the FPS ARPG."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WeaponBlueprint:
    """Authoritative data used to build runtime weapon state."""

    id: str
    name: str
    fire_rate: float
    magazine_size: int
    reload_time: float
    damage: float
    automatic: bool = False


@dataclass
class WeaponFireEvent:
    """Simple return value describing the outcome of a fire attempt."""

    fired: bool
    reason: str | None = None
    damage: float = 0.0
    ammo_remaining: int = 0
    magazine_size: int = 0


class WeaponState:
    """Runtime state for a single weapon instance."""

    def __init__(self, blueprint: WeaponBlueprint) -> None:
        self.blueprint = blueprint
        self.ammo_in_mag = blueprint.magazine_size
        self._cooldown = 0.0
        self._reload_timer = 0.0
        self._is_reloading = False

    # Lifecycle ------------------------------------------------------
    def update(self, dt: float) -> None:
        """Advance internal timers."""

        if self._cooldown > 0.0:
            self._cooldown = max(0.0, self._cooldown - dt)
        if self._is_reloading:
            self._reload_timer -= dt
            if self._reload_timer <= 0.0:
                self._finish_reload()

    # Queries --------------------------------------------------------
    @property
    def is_reloading(self) -> bool:
        return self._is_reloading

    @property
    def time_until_ready(self) -> float:
        """Return the time before the weapon can fire again."""

        if self._is_reloading:
            return max(0.0, self._reload_timer)
        return self._cooldown

    def get_ammo_display(self) -> str:
        return f"{self.ammo_in_mag}/{self.blueprint.magazine_size}"

    # Actions --------------------------------------------------------
    def try_fire(self) -> WeaponFireEvent:
        if self._is_reloading:
            return self._build_event(False, "reloading")
        if self.ammo_in_mag <= 0:
            return self._build_event(False, "empty")
        if self._cooldown > 0.0:
            return self._build_event(False, "cooldown")

        self.ammo_in_mag -= 1
        if self.blueprint.fire_rate > 0:
            self._cooldown = 1.0 / self.blueprint.fire_rate
        else:
            self._cooldown = 0.0
        return self._build_event(True, None)

    def start_reload(self) -> WeaponFireEvent:
        if self._is_reloading:
            return self._build_event(False, "already-reloading")
        if self.ammo_in_mag >= self.blueprint.magazine_size:
            return self._build_event(False, "mag-full")

        self._is_reloading = True
        self._reload_timer = max(0.0, self.blueprint.reload_time)
        if self._reload_timer == 0.0:
            self._finish_reload()
        return self._build_event(False, "reload-started")

    # Helpers --------------------------------------------------------
    def _finish_reload(self) -> None:
        self._is_reloading = False
        self.ammo_in_mag = self.blueprint.magazine_size
        self._reload_timer = 0.0

    def _build_event(self, fired: bool, reason: str | None) -> WeaponFireEvent:
        return WeaponFireEvent(
            fired=fired,
            reason=reason,
            damage=self.blueprint.damage if fired else 0.0,
            ammo_remaining=self.ammo_in_mag,
            magazine_size=self.blueprint.magazine_size,
        )


WEAPON_BLUEPRINTS: dict[str, WeaponBlueprint] = {
    "sentinel_rifle": WeaponBlueprint(
        id="sentinel_rifle",
        name="Sentinel Rifle",
        fire_rate=2.0,
        magazine_size=6,
        reload_time=2.2,
        damage=38.0,
        automatic=False,
    )
}


def get_weapon_blueprint(item_id: str) -> WeaponBlueprint | None:
    """Return the registered blueprint for ``item_id`` if available."""

    return WEAPON_BLUEPRINTS.get(item_id)


__all__ = [
    "WeaponBlueprint",
    "WeaponFireEvent",
    "WeaponState",
    "get_weapon_blueprint",
]

