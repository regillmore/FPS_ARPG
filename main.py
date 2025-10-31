"""Entry point for the prototype FPS ARPG application."""

from __future__ import annotations

from dataclasses import dataclass

from direct.gui import DirectGuiGlobals as DGG
from direct.gui.DirectGui import DirectButton, DirectFrame, OnscreenText
from direct.showbase.ShowBase import ShowBase
from panda3d.core import ClockObject, TextNode, Vec3, WindowProperties


class MainMenu:
    """Simple main menu constructed with Panda3D DirectGUI widgets."""

    def __init__(self, app: "GameApp") -> None:
        self.app = app
        self._build()

    def _build(self) -> None:
        """Create menu widgets and attach callbacks."""

        self.frame = DirectFrame(frameColor=(0, 0, 0, 0))

        self.title = OnscreenText(
            text="Project Aegis",
            pos=(0, 0.65),
            scale=0.1,
            fg=(1, 1, 1, 1),
            shadow=(0, 0, 0, 0.75),
            parent=self.frame,
            align=TextNode.ACenter,
            mayChange=False,
        )

        button_cfg = dict(
            parent=self.frame,
            scale=0.08,
            frameColor=(0.1, 0.1, 0.1, 0.8),
            text_fg=(1, 1, 1, 1),
            text_shadow=(0, 0, 0, 0.7),
            relief=1,
            pad=(0.8, 0.4),
        )

        self.start_button = DirectButton(
            text="Start Game",
            pos=(0, 0, 0.15),
            command=self.app.start_game,
            **button_cfg,
        )

        self.options_button = DirectButton(
            text="Options",
            pos=(0, 0, -0.05),
            command=self.app.show_options,
            **button_cfg,
        )

        self.quit_button = DirectButton(
            text="Quit",
            pos=(0, 0, -0.25),
            command=self.app.quit_game,
            **button_cfg,
        )

        self.hint_text = OnscreenText(
            text="Prototype build",
            pos=(0, -0.9),
            scale=0.05,
            fg=(0.8, 0.8, 0.8, 1),
            parent=self.frame,
            align=TextNode.ACenter,
            mayChange=False,
        )

    def destroy(self) -> None:
        """Tear down menu widgets to free resources."""

        for widget in (
            getattr(self, name, None)
            for name in (
                "hint_text",
                "quit_button",
                "options_button",
                "start_button",
                "title",
                "frame",
            )
        ):
            if widget is not None:
                widget.destroy()


class GameApp(ShowBase):
    """Application root for the prototype game."""

    def __init__(self) -> None:
        super().__init__()
        self.disableMouse()
        self.win.setClearColor((0.05, 0.05, 0.08, 1))
        self.accept("escape", self.userExit)

        self.status_text: OnscreenText | None = None
        self.menu: MainMenu | None = None
        self.world: GameWorld | None = None

        self.show_main_menu()

    # Menu management -------------------------------------------------
    def show_main_menu(self) -> None:
        """Display the main menu and remove any placeholder overlays."""

        self._clear_status_text()
        self._destroy_world()
        if self.menu is None:
            self.menu = MainMenu(self)

    def hide_main_menu(self) -> None:
        if self.menu is not None:
            self.menu.destroy()
            self.menu = None

    def start_game(self) -> None:
        """Placeholder start handler used for early prototyping."""

        self.hide_main_menu()
        self._clear_status_text()
        if self.world is None:
            self.world = GameWorld(self)

    def show_options(self) -> None:
        """Display a temporary message until a real options screen exists."""

        self._set_status_text(
            "Options are not available in this prototype build.",
            fg=(0.9, 0.8, 0.5, 1),
        )

    def quit_game(self) -> None:
        self.userExit()

    # Helper methods --------------------------------------------------
    def _set_status_text(self, text: str, fg=(1, 1, 1, 1)) -> None:
        self._clear_status_text()
        self.status_text = OnscreenText(
            text=text,
            pos=(0, -0.75),
            scale=0.06,
            fg=fg,
            align=TextNode.ACenter,
            mayChange=True,
        )

    def _clear_status_text(self) -> None:
        if self.status_text is not None:
            self.status_text.destroy()
            self.status_text = None

    def _destroy_world(self) -> None:
        if self.world is not None:
            self.world.destroy()
            self.world = None


class GameWorld:
    """Simple first-playable test area with FPS-style controls."""

    MOVE_SPEED = 7.5
    MOUSE_SENSITIVITY = 0.2
    PITCH_LIMIT = 75

    def __init__(self, app: GameApp) -> None:
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
        self._setup_stats_menu()
        self._setup_inventory_menu()

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
            text="WASD to move, Mouse to look, TAB stats, I inventory",
            pos=(0, 0.9),
            scale=0.05,
            fg=(0.9, 0.9, 0.9, 1),
            align=TextNode.ACenter,
            mayChange=False,
        )

    def _setup_stats_menu(self) -> None:
        self.stats_menu = StatsMenu(self.player_stats)
        self.stats_menu.hide()

    def _setup_inventory_menu(self) -> None:
        self.inventory_menu = InventoryMenu(self.inventory)
        self.inventory_menu.hide()

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
        if self.stats_menu.is_visible:
            self.stats_menu.update()
        if self.inventory_menu.is_visible:
            self.inventory_menu.update()
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

        if hasattr(self, "stats_menu") and self.stats_menu is not None:
            self.stats_menu.destroy()
            self.stats_menu = None
        if hasattr(self, "inventory_menu") and self.inventory_menu is not None:
            self.inventory_menu.destroy()
            self.inventory_menu = None

        if hasattr(self, "hud_text") and self.hud_text is not None:
            self.hud_text.destroy()
            self.hud_text = None

        self.app.camera.reparentTo(self.app.render)
        self.app.camera.setPos(0, 0, 0)
        self.app.camera.setHpr(0, 0, 0)

        self.root.removeNode()

    # UI actions ------------------------------------------------------
    def _toggle_stats_menu(self) -> None:
        if self.stats_menu.is_visible:
            self.stats_menu.hide()
        else:
            if self.inventory_menu.is_visible:
                self.inventory_menu.hide()
                self._set_paused(False)
            self.stats_menu.show()
            self.stats_menu.update()

    def _toggle_inventory_menu(self) -> None:
        if self.inventory_menu.is_visible:
            self.inventory_menu.hide()
            self._set_paused(False)
        else:
            if self.stats_menu.is_visible:
                self.stats_menu.hide()
            self.inventory_menu.show()
            self._set_paused(True)


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
            "",
            f"Strength: {self.strength}",
            f"Agility: {self.agility}",
            f"Willpower: {self.willpower}",
            "",
            f"Ability Points Available: {self.points_available}",
        ]


@dataclass
class ItemTemplate:
    """Static definition describing an inventory item."""

    id: str
    name: str
    description: str
    category: str
    stack_limit: int = 1

    def __post_init__(self) -> None:
        if self.stack_limit < 1:
            raise ValueError("stack_limit must be at least 1")


@dataclass
class InventoryStack:
    """Represents a stack of identical items stored together."""

    template: ItemTemplate
    quantity: int = 0

    def space_remaining(self) -> int:
        return max(0, self.template.stack_limit - self.quantity)


class Inventory:
    """Simple inventory container supporting stackable items."""

    def __init__(self, capacity: int = 24) -> None:
        self.capacity = capacity
        self.stacks: list[InventoryStack] = []

    # Core management -------------------------------------------------
    def add_item(self, template: ItemTemplate, quantity: int = 1) -> int:
        """Add ``quantity`` items and return any remainder not stored."""

        if quantity <= 0:
            return 0

        remaining = quantity

        # Fill existing stacks first.
        for stack in self.stacks:
            if stack.template.id != template.id:
                continue
            space = stack.space_remaining()
            if space <= 0:
                continue
            to_add = min(space, remaining)
            stack.quantity += to_add
            remaining -= to_add
            if remaining == 0:
                return 0

        # Create new stacks if there is capacity remaining.
        while remaining > 0 and len(self.stacks) < self.capacity:
            to_add = min(template.stack_limit, remaining)
            self.stacks.append(InventoryStack(template=template, quantity=to_add))
            remaining -= to_add

        return remaining

    def remove_item(self, item_id: str, quantity: int = 1) -> int:
        """Remove items matching ``item_id`` and return the amount removed."""

        if quantity <= 0:
            return 0

        removed = 0
        for stack in list(self.stacks):
            if stack.template.id != item_id:
                continue
            take = min(stack.quantity, quantity - removed)
            stack.quantity -= take
            removed += take
            if stack.quantity == 0:
                self.stacks.remove(stack)
            if removed >= quantity:
                break
        return removed

    # Query helpers ---------------------------------------------------
    def count_unique(self) -> int:
        return len(self.stacks)

    def is_full(self) -> bool:
        return self.count_unique() >= self.capacity

    def build_summary_lines(self) -> list[str]:
        """Return formatted lines suitable for the inventory UI."""

        lines: list[str] = [
            f"Capacity: {self.count_unique()} / {self.capacity}",
            "",
        ]

        if not self.stacks:
            lines.append("Inventory is empty.")
            return lines

        for index, stack in enumerate(self.stacks, start=1):
            lines.append(f"{index:02}. {stack.template.name}")
            lines.append(
                f"    {stack.template.category}  x{stack.quantity}"
                + (" (Full)" if stack.space_remaining() == 0 else "")
            )
            if stack.template.description:
                lines.append(f"    {stack.template.description}")
            lines.append("")

        if lines[-1] == "":
            lines.pop()

        return lines


class StatsMenu:
    """Lightweight overlay that visualises :class:`PlayerStats`."""

    def __init__(self, stats: PlayerStats) -> None:
        self.stats = stats
        self.frame = DirectFrame(
            frameColor=(0.05, 0.05, 0.07, 0.85),
            frameSize=(-0.75, 0.75, -0.6, 0.6),
        )
        self.title = OnscreenText(
            text="Operative Profile",
            parent=self.frame,
            pos=(0, 0.5),
            scale=0.08,
            fg=(0.95, 0.92, 0.8, 1),
            shadow=(0, 0, 0, 0.8),
            align=TextNode.ACenter,
            mayChange=False,
        )
        self.body = OnscreenText(
            text="",
            parent=self.frame,
            pos=(-0.7, 0.35),
            scale=0.055,
            fg=(0.85, 0.88, 1, 1),
            align=TextNode.ALeft,
            mayChange=True,
        )
        self.footer = OnscreenText(
            text="TAB - Close",
            parent=self.frame,
            pos=(0, -0.55),
            scale=0.045,
            fg=(0.7, 0.75, 0.95, 1),
            align=TextNode.ACenter,
            mayChange=False,
        )

        self.is_visible = True

    def update(self) -> None:
        lines = self.stats.build_summary_lines()
        self.body.setText("\n".join(lines))

    def show(self) -> None:
        self.frame.show()
        self.is_visible = True

    def hide(self) -> None:
        self.frame.hide()
        self.is_visible = False

    def destroy(self) -> None:
        for widget in ("footer", "body", "title", "frame"):
            element = getattr(self, widget, None)
            if element is not None:
                element.destroy()
                setattr(self, widget, None)


class InventoryMenu:
    """Overlay that renders the current contents of an :class:`Inventory`."""

    GRID_COLUMNS = 6
    GRID_ROWS = 4

    def __init__(self, inventory: Inventory) -> None:
        self.inventory = inventory
        self.frame = DirectFrame(
            frameColor=(0.08, 0.07, 0.09, 0.92),
            frameSize=(-0.9, 0.9, -0.7, 0.7),
        )
        self.title = OnscreenText(
            text="Field Inventory",
            parent=self.frame,
            pos=(0, 0.58),
            scale=0.08,
            fg=(0.95, 0.95, 0.85, 1),
            shadow=(0, 0, 0, 0.8),
            align=TextNode.ACenter,
            mayChange=False,
        )
        self.capacity_text = OnscreenText(
            text="",
            parent=self.frame,
            pos=(-0.82, 0.46),
            scale=0.05,
            fg=(0.85, 0.88, 1, 1),
            align=TextNode.ALeft,
            mayChange=True,
        )
        self.capacity_hint = OnscreenText(
            text="",
            parent=self.frame,
            pos=(-0.82, 0.4),
            scale=0.042,
            fg=(0.9, 0.6, 0.6, 1),
            align=TextNode.ALeft,
            mayChange=True,
        )
        self.detail_title = OnscreenText(
            text="",
            parent=self.frame,
            pos=(0.55, 0.46),
            scale=0.055,
            fg=(0.95, 0.95, 0.88, 1),
            align=TextNode.ALeft,
            mayChange=True,
            wordwrap=16,
        )
        self.detail_body = OnscreenText(
            text="",
            parent=self.frame,
            pos=(0.55, 0.35),
            scale=0.045,
            fg=(0.85, 0.88, 1, 1),
            align=TextNode.ALeft,
            mayChange=True,
            wordwrap=16,
        )
        self.footer = OnscreenText(
            text="I - Close",
            parent=self.frame,
            pos=(0, -0.62),
            scale=0.045,
            fg=(0.7, 0.8, 1, 1),
            align=TextNode.ACenter,
            mayChange=False,
        )

        self.is_visible = True
        self._default_detail_message = "Hover over an item to inspect its details."
        self._empty_slot_color = (0.08, 0.08, 0.12, 0.95)
        self._default_slot_color = (0.16, 0.17, 0.22, 0.95)
        self._full_slot_color = (0.25, 0.18, 0.18, 0.95)
        self._hover_slot_color = (0.4, 0.4, 0.55, 1)

        self.slot_count = self.GRID_COLUMNS * self.GRID_ROWS
        self.slots: list[DirectButton] = []
        self.slot_contents: list[InventoryStack | None] = [None] * self.slot_count
        self._current_hover_index: int | None = None

        self._create_slots()
        self._set_default_description()

    def _create_slots(self) -> None:
        slot_width = 0.22
        slot_height = 0.22
        spacing = 0.03
        start_x = -0.78
        start_z = 0.32

        index = 0
        for row in range(self.GRID_ROWS):
            for col in range(self.GRID_COLUMNS):
                x = start_x + col * (slot_width + spacing)
                z = start_z - row * (slot_height + spacing)
                button = DirectButton(
                    parent=self.frame,
                    pos=(x, 0, z),
                    frameColor=self._empty_slot_color,
                    frameSize=(
                        -slot_width / 2,
                        slot_width / 2,
                        -slot_height / 2,
                        slot_height / 2,
                    ),
                    text="",
                    text_scale=0.045,
                    text_align=TextNode.ACenter,
                    text_fg=(0.92, 0.92, 1, 1),
                    text_wordwrap=9,
                    textMayChange=1,
                    relief=1,
                    pressEffect=False,
                    rolloverSound=None,
                    clickSound=None,
                )
                button.bind(DGG.ENTER, self._on_slot_hover, [index])
                button.bind(DGG.EXIT, self._on_slot_exit, [index])
                self.slots.append(button)
                index += 1

    def update(self) -> None:
        stacks = self.inventory.stacks
        for index, slot in enumerate(self.slots):
            stack = stacks[index] if index < len(stacks) else None
            self.slot_contents[index] = stack
            if stack is None:
                slot["text"] = ""
                slot["frameColor"] = self._empty_slot_color
            else:
                slot["text"] = f"{stack.template.name}\n x{stack.quantity}"
                if stack.template.stack_limit > 1 and stack.space_remaining() == 0:
                    slot["frameColor"] = self._full_slot_color
                else:
                    slot["frameColor"] = self._default_slot_color

            if self._current_hover_index == index:
                slot["frameColor"] = self._hover_slot_color

        capacity_line = (
            f"Capacity: {self.inventory.count_unique()} / {self.inventory.capacity}"
        )
        self.capacity_text.setText(capacity_line)
        if self.inventory.is_full():
            self.capacity_hint.setText(
                "Inventory full - clear space to loot more gear."
            )
        else:
            self.capacity_hint.setText("")

        self._refresh_hover_description()

    def show(self) -> None:
        self.frame.show()
        self.is_visible = True
        self._clear_hover_state()
        self.update()

    def hide(self) -> None:
        self.frame.hide()
        self.is_visible = False
        self._clear_hover_state()

    def destroy(self) -> None:
        for slot in getattr(self, "slots", []):
            slot.destroy()
        self.slots = []
        self.slot_contents = []

        for widget in (
            "footer",
            "detail_body",
            "detail_title",
            "capacity_hint",
            "capacity_text",
            "title",
            "frame",
        ):
            element = getattr(self, widget, None)
            if element is not None:
                element.destroy()
                setattr(self, widget, None)

    def _clear_hover_state(self) -> None:
        self._current_hover_index = None
        self._set_default_description()
        for index in range(len(self.slots)):
            self._apply_slot_visual(index)

    def _on_slot_hover(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        self._current_hover_index = index
        self.slots[index]["frameColor"] = self._hover_slot_color
        self._apply_description(index)

    def _on_slot_exit(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        if self._current_hover_index == index:
            self._current_hover_index = None
            self._set_default_description()
        self._apply_slot_visual(index)

    def _refresh_hover_description(self) -> None:
        if self._current_hover_index is None:
            self._set_default_description()
            return
        if self._current_hover_index >= len(self.slot_contents):
            self._current_hover_index = None
            self._set_default_description()
            return
        self._apply_description(self._current_hover_index)

    def _apply_slot_visual(self, index: int) -> None:
        stack = self.slot_contents[index]
        slot = self.slots[index]
        if self._current_hover_index == index:
            slot["frameColor"] = self._hover_slot_color
            return
        if stack is None:
            slot["frameColor"] = self._empty_slot_color
        elif stack.template.stack_limit > 1 and stack.space_remaining() == 0:
            slot["frameColor"] = self._full_slot_color
        else:
            slot["frameColor"] = self._default_slot_color

    def _set_default_description(self) -> None:
        self.detail_title.setText("Item Details")
        self.detail_body.setText(self._default_detail_message)

    def _apply_description(self, index: int) -> None:
        stack = self.slot_contents[index]
        if stack is None:
            self._set_empty_description()
            return

        lines = [f"Category: {stack.template.category}"]
        if stack.template.stack_limit > 1:
            lines.append(
                f"Stack: {stack.quantity}/{stack.template.stack_limit}"
            )
            if stack.space_remaining() == 0:
                lines.append("Stack is full.")
        else:
            lines.append(f"Quantity: {stack.quantity}")

        if stack.template.description:
            lines.append("")
            lines.append(stack.template.description)

        self.detail_title.setText(f"{stack.template.name} (x{stack.quantity})")
        self.detail_body.setText("\n".join(lines))

    def _set_empty_description(self) -> None:
        if self.inventory.is_full():
            message = (
                "Inventory is at capacity. Clear space to pick up new gear."
            )
        else:
            message = "Ready to store newly acquired gear."
        self.detail_title.setText("Empty Slot")
        self.detail_body.setText(message)



if __name__ == "__main__":
    GameApp().run()
