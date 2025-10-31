"""Player statistics models and helpers."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class PlayerStats:
    """Lightweight RPG stats container with a few helper operations."""

    level: int = 1
    xp: int = 0
    xp_to_next: int = 100
    max_health: float = 120.0
    health: float = 120.0
    max_focus: float = 60.0
    focus: float = 60.0
    strength: int = 12
    agility: int = 10
    willpower: int = 8
    points_available: int = 0
    health_regen: float = 1.5
    focus_regen: float = 3.0

    def __post_init__(self) -> None:
        self.health = min(self.health, self.max_health)
        self.focus = min(self.focus, self.max_focus)

    # Core operations -------------------------------------------------
    def apply_damage(self, amount: float) -> None:
        """Reduce health by ``amount`` without dropping below zero."""

        if amount <= 0:
            return
        self.health = max(0.0, self.health - amount)

    def heal(self, amount: float) -> None:
        """Restore health while respecting the maximum."""

        if amount <= 0:
            return
        self.health = min(self.max_health, self.health + amount)

    def spend_focus(self, amount: float) -> bool:
        """Try to spend focus; return ``True`` on success."""

        if amount <= 0:
            return True
        if self.focus < amount:
            return False
        self.focus -= amount
        return True

    def restore_focus(self, amount: float) -> None:
        if amount <= 0:
            return
        self.focus = min(self.max_focus, self.focus + amount)

    def gain_xp(self, amount: int) -> None:
        if amount <= 0:
            return

        self.xp += amount
        while self.xp >= self.xp_to_next:
            self.xp -= self.xp_to_next
            self._level_up()

    # Update ----------------------------------------------------------
    def tick(self, dt: float) -> None:
        """Passive regeneration tick called each frame."""

        if dt <= 0:
            return

        if self.health < self.max_health:
            self.health = min(self.max_health, self.health + self.health_regen * dt)

        if self.focus < self.max_focus:
            self.focus = min(self.max_focus, self.focus + self.focus_regen * dt)

    # Internal helpers ------------------------------------------------
    def _level_up(self) -> None:
        self.level += 1
        self.points_available += 3

        self.max_health += 8 + self.strength * 0.5
        self.max_focus += 5 + self.willpower * 0.4
        self.health = self.max_health
        self.focus = self.max_focus

        self.xp_to_next = int(self.xp_to_next * 1.25)

    # Formatting helpers ---------------------------------------------
    def build_summary_lines(self) -> list[str]:
        """Generate user-facing lines describing the current stats."""

        return [
            f"Level {self.level}",
            f"XP: {self.xp} / {self.xp_to_next}",
            "",
            f"Health: {int(self.health)} / {int(self.max_health)}",
            f"Focus: {int(self.focus)} / {int(self.max_focus)}",
            f"Strength: {self.strength}",
            f"Agility: {self.agility}",
            f"Willpower: {self.willpower}",
            "",
            f"Ability Points Available: {self.points_available}",
        ]


__all__ = ["PlayerStats"]
