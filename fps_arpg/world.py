"""Game world implementation for the prototype FPS ARPG."""

from __future__ import annotations

from typing import TYPE_CHECKING

from direct.gui.DirectGui import OnscreenText
from panda3d.core import ClockObject, TextNode, Vec3, WindowProperties

from .inventory import Inventory, ItemTemplate
from .stats import PlayerStats
from .ui import TabbedMenu

if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from .app import GameApp


class GameWorld:
    """Simple first-playable test area with FPS-style controls."""

    MOVE_SPEED = 7.5
    MOUSE_SENSITIVITY = 0.2
    PITCH_LIMIT = 75

    def __init__(self, app: "GameApp") -> None:
        self.app = app
        self.root = self.app.render.attachNewNode("game_world")
        self.player_np = self.root.attachNewNode("player")
        self.player_np.setPos(0, 0, 2)

        self.heading = 0.0
        self.pitch = 0.0
        self.is_paused = False
        self._mouse_captured = False

        self.player_stats = PlayerStats()
        self.inventory = Inventory()
        self._seed_debug_items()

        self.key_map: dict[str, bool] = {
            "forward": False,
            "back": False,
            "left": False,
            "right": False,
        }

        self._accepted_events: list[str] = []

        self._setup_environment()
        self._setup_camera()
        self._setup_controls()
        self._setup_hud()
        self._setup_tabbed_menu()

        self._task_name = "update_game_world"
        self.app.taskMgr.add(self._update_task, self._task_name)

    # Setup -----------------------------------------------------------
    def _setup_environment(self) -> None:
        env = self.app.loader.loadModel("models/environment")
        env.reparentTo(self.root)
        env.setScale(0.12)
        env.setPos(-8, 42, 0)

        self.app.render.setShaderAuto()

    def _setup_camera(self) -> None:
        self.app.camera.reparentTo(self.player_np)
        self.app.camera.setPos(0, 0, 1.6)
        self.app.camera.setHpr(0, 0, 0)

        self.center_x = int(self.app.win.getXSize() / 2)
        self.center_y = int(self.app.win.getYSize() / 2)

        self._set_mouse_capture(True)

    def _setup_controls(self) -> None:
        self._bind("w", "forward", True)
        self._bind("w-up", "forward", False)
        self._bind("s", "back", True)
        self._bind("s-up", "back", False)
        self._bind("a", "left", True)
        self._bind("a-up", "left", False)
        self._bind("d", "right", True)
        self._bind("d-up", "right", False)

        self.app.accept("tab", self._toggle_stats_menu)
        self._accepted_events.append("tab")
        self.app.accept("i", self._toggle_inventory_menu)
        self._accepted_events.append("i")

    def _setup_hud(self) -> None:
        self.hud_text = OnscreenText(
            text="WASD move, Mouse look, TAB menu, I inventory tab",
            pos=(0, 0.9),
            scale=0.05,
            fg=(0.9, 0.9, 0.9, 1),
            align=TextNode.ACenter,
            mayChange=False,
        )

    def _setup_tabbed_menu(self) -> None:
        self.tabbed_menu = TabbedMenu(self.player_stats, self.inventory)
        self.tabbed_menu.hide()

    def _seed_debug_items(self) -> None:
        """Populate the prototype inventory with a few sample items."""

        samples = [
            (ItemTemplate(
                id="field_medkit",
                name="Field Medkit",
                description="Restores a large chunk of health when deployed.",
                category="Consumable",
                stack_limit=5,
            ), 3),
            (ItemTemplate(
                id="focus_ampoule",
                name="Focus Ampoule",
                description="A stimulant vial that restores tactical focus.",
                category="Consumable",
                stack_limit=10,
            ), 5),
            (ItemTemplate(
                id="sentinel_rifle",
                name="Sentinel Rifle",
                description="A precision marksman rifle from the Aegis program.",
                category="Primary Weapon",
                stack_limit=1,
            ), 1),
            (ItemTemplate(
                id="aegis_operative_badge",
                name="Operative Badge",
                description="Identification marking elite Aegis operatives.",
                category="Quest Item",
                stack_limit=1,
            ), 1),
        ]

        for template, qty in samples:
            self.inventory.add_item(template, qty)

    # Event helpers ---------------------------------------------------
    def _bind(self, event_name: str, key: str, value: bool) -> None:
        self.app.accept(event_name, self._set_key, [key, value])
        self._accepted_events.append(event_name)

    def _set_key(self, key: str, value: bool) -> None:
        self.key_map[key] = value

    def _set_mouse_capture(self, capture: bool) -> None:
        if self._mouse_captured == capture:
            return

        props = WindowProperties()
        props.setCursorHidden(capture)
        self.app.win.requestProperties(props)

        self._mouse_captured = capture
        if capture:
            self.app.win.movePointer(0, self.center_x, self.center_y)

    def _set_paused(self, paused: bool) -> None:
        if self.is_paused == paused:
            return

        self.is_paused = paused
        if paused:
            self._set_mouse_capture(False)
        else:
            self._set_mouse_capture(True)

    # Update loop -----------------------------------------------------
    def _update_task(self, task) -> int:
        dt = ClockObject.getGlobalClock().getDt()
        if not self.is_paused:
            self.player_stats.tick(dt)
            self._update_mouse_look()
            self._update_movement(dt)
        if self.tabbed_menu.is_visible:
            self.tabbed_menu.update()
        return task.cont

    def _update_mouse_look(self) -> None:
        if not self.app.mouseWatcherNode.hasMouse():
            return

        pointer = self.app.win.getPointer(0)
        delta_x = pointer.getX() - self.center_x
        delta_y = pointer.getY() - self.center_y

        if delta_x == 0 and delta_y == 0:
            return

        self.heading -= delta_x * self.MOUSE_SENSITIVITY
        self.pitch -= delta_y * self.MOUSE_SENSITIVITY
        self.pitch = max(-self.PITCH_LIMIT, min(self.PITCH_LIMIT, self.pitch))

        self.player_np.setH(self.heading)
        self.app.camera.setP(self.pitch)

        self.app.win.movePointer(0, self.center_x, self.center_y)

    def _update_movement(self, dt: float) -> None:
        direction = Vec3(0, 0, 0)
        if self.key_map["forward"]:
            direction += Vec3(0, 1, 0)
        if self.key_map["back"]:
            direction += Vec3(0, -1, 0)
        if self.key_map["left"]:
            direction += Vec3(-1, 0, 0)
        if self.key_map["right"]:
            direction += Vec3(1, 0, 0)

        if direction.length_squared() == 0:
            return

        direction.normalize()
        movement = direction * self.MOVE_SPEED * dt
        self.player_np.setPos(self.player_np, movement)

    # Cleanup ---------------------------------------------------------
    def destroy(self) -> None:
        self.app.taskMgr.remove(self._task_name)

        for event_name in self._accepted_events:
            self.app.ignore(event_name)
        self._accepted_events.clear()

        self.is_paused = False
        self._set_mouse_capture(False)

        if hasattr(self, "tabbed_menu") and self.tabbed_menu is not None:
            self.tabbed_menu.destroy()
            self.tabbed_menu = None

        if hasattr(self, "hud_text") and self.hud_text is not None:
            self.hud_text.destroy()
            self.hud_text = None

        self.app.camera.reparentTo(self.app.render)
        self.app.camera.setPos(0, 0, 0)
        self.app.camera.setHpr(0, 0, 0)

        self.root.removeNode()

    # UI actions ------------------------------------------------------
    def _toggle_stats_menu(self) -> None:
        self._toggle_tabbed_menu(TabbedMenu.TAB_STATS)

    def _toggle_inventory_menu(self) -> None:
        self._toggle_tabbed_menu(TabbedMenu.TAB_INVENTORY)

    def _toggle_tabbed_menu(self, tab: str) -> None:
        if self.tabbed_menu.is_visible and self.tabbed_menu.active_tab == tab:
            self.tabbed_menu.hide()
            self._set_paused(False)
            return

        if not self.tabbed_menu.is_visible:
            self.tabbed_menu.show()
            self._set_paused(True)

        self.tabbed_menu.select_tab(tab)


__all__ = ["GameWorld"]
