"""Player statistics models and helpers."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping


STAT_LABELS: dict[str, str] = {
    "max_health": "Max Health",
    "health_regen": "Health Regeneration",
    "max_focus": "Max Focus",
    "focus_regen": "Focus Regeneration",
    "strength": "Strength",
    "agility": "Agility",
    "willpower": "Willpower",
}
_INT_STATS = {"strength", "agility", "willpower"}
_WHOLE_NUMBER_FLOAT_STATS = {"max_health", "max_focus"}
_PRECISION_STATS = {"health_regen", "focus_regen"}


def format_stat_bonus(stat: str, amount: float) -> str:
    """Return a readable description of a single stat adjustment."""

    label = STAT_LABELS.get(stat, stat.replace("_", " ").title())
    sign = "+" if amount >= 0 else "-"
    value = abs(amount)
    if stat in _INT_STATS or stat in _WHOLE_NUMBER_FLOAT_STATS:
        value_str = f"{int(round(value))}"
    elif stat in _PRECISION_STATS:
        value_str = f"{value:.2f}".rstrip("0").rstrip(".")
    else:
        value_str = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{label}: {sign}{value_str}"


def build_stat_bonus_lines(bonuses: Mapping[str, float]) -> list[str]:
    """Convert a stat bonus mapping into user-facing lines."""

    if not bonuses:
        return []
    return [
        format_stat_bonus(stat, value)
        for stat, value in sorted(
            bonuses.items(), key=lambda item: STAT_LABELS.get(item[0], item[0])
        )
    ]


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
    _equipment_bonuses: dict[str, float] = field(
        default_factory=dict, init=False, repr=False
    )

    def __post_init__(self) -> None:
        self.health = min(self.health, self.max_health)
        self.focus = min(self.focus, self.max_focus)
        self._clamp_resources()

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
        self.health = min(self.effective_max_health, self.health + amount)

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
        self.focus = min(self.effective_max_focus, self.focus + amount)

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

        if self.health < self.effective_max_health:
            self.health = min(
                self.effective_max_health,
                self.health + self.effective_health_regen * dt,
            )

        if self.focus < self.effective_max_focus:
            self.focus = min(
                self.effective_max_focus,
                self.focus + self.effective_focus_regen * dt,
            )

    # Internal helpers ------------------------------------------------
    def _level_up(self) -> None:
        self.level += 1
        self.points_available += 3

        self.max_health += 8 + self.strength * 0.5
        self.max_focus += 5 + self.willpower * 0.4
        self.health = self.effective_max_health
        self.focus = self.effective_max_focus

        self.xp_to_next = int(self.xp_to_next * 1.25)

    # Formatting helpers ---------------------------------------------
    def build_summary_lines(self) -> list[str]:
        """Generate user-facing lines describing the current stats."""

        lines = [
            f"Level {self.level}",
            f"XP: {self.xp} / {self.xp_to_next}",
            "",
            f"Health: {int(self.health)} / {int(self.effective_max_health)}",
            f"Focus: {int(self.focus)} / {int(self.effective_max_focus)}",
            f"Strength: {self.effective_strength}",
            f"Agility: {self.effective_agility}",
            f"Willpower: {self.effective_willpower}",
            "",
            f"Ability Points Available: {self.points_available}",
        ]

        bonus_lines = build_stat_bonus_lines(self._equipment_bonuses)
        if bonus_lines:
            lines.extend(["", "Equipment Bonuses:"])
            lines.extend(f"- {line}" for line in bonus_lines)

        return lines

    # Equipment modifiers --------------------------------------------
    def set_equipment_bonuses(self, bonuses: Mapping[str, float]) -> None:
        """Update stat modifiers granted by equipped items."""

        self._equipment_bonuses = dict(bonuses)
        self._clamp_resources()

    @property
    def effective_max_health(self) -> float:
        return max(1.0, self._effective_float("max_health"))

    @property
    def effective_max_focus(self) -> float:
        return max(0.0, self._effective_float("max_focus"))

    @property
    def effective_health_regen(self) -> float:
        return max(0.0, self._effective_float("health_regen"))

    @property
    def effective_focus_regen(self) -> float:
        return max(0.0, self._effective_float("focus_regen"))

    @property
    def effective_strength(self) -> int:
        return max(0, self._effective_int("strength"))

    @property
    def effective_agility(self) -> int:
        return max(0, self._effective_int("agility"))

    @property
    def effective_willpower(self) -> int:
        return max(0, self._effective_int("willpower"))

    # Internal helpers ------------------------------------------------
    def _clamp_resources(self) -> None:
        self.health = min(self.health, self.effective_max_health)
        self.focus = min(self.focus, self.effective_max_focus)

    def _effective_float(self, key: str) -> float:
        base = float(getattr(self, key))
        bonus = float(self._equipment_bonuses.get(key, 0.0))
        return base + bonus

    def _effective_int(self, key: str) -> int:
        base = int(getattr(self, key))
        bonus = self._equipment_bonuses.get(key, 0.0)
        return int(round(base + bonus))


__all__ = ["PlayerStats", "build_stat_bonus_lines", "format_stat_bonus"]
