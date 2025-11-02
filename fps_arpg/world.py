"""Game world implementation for the prototype FPS ARPG."""

from __future__ import annotations

from typing import TYPE_CHECKING

from direct.gui.DirectGui import OnscreenText
from panda3d.core import (
    AmbientLight,
    CardMaker,
    ClockObject,
    DirectionalLight,
    Material,
    NodePath,
    TextNode,
    Vec3,
    Vec4,
    WindowProperties,
)

from .equipment import EquipmentLoadout
from .inventory import Inventory, ItemTemplate
from .projectiles import Projectile, get_projectile_blueprint
from .stats import PlayerStats
from .ui import TabbedMenu
from .weapon_geometry import build_weapon_model
from .weapons import WeaponBlueprint, WeaponState, get_weapon_blueprint

if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from .app import GameApp


class GameWorld:
    """Simple first-playable test area with FPS-style controls."""

    MOVE_SPEED = 10
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

        self.weapon_root: NodePath | None = None
        self.weapon_model: NodePath | None = None
        self.active_weapon: WeaponState | None = None
        self.is_fire_held = False
        self.projectile_root: NodePath | None = None
        self.projectiles: list[Projectile] = []

        self.player_stats = PlayerStats()
        self.inventory = Inventory()
        self.equipment = EquipmentLoadout()
        self.equipment.add_listener(self._on_equipment_changed)
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
        self._setup_weapon_anchor()
        self._setup_projectiles()
        self._setup_controls()
        self._setup_hud()
        self._setup_tabbed_menu()

        self._on_equipment_changed(self.equipment)

        self._task_name = "update_game_world"
        self.app.taskMgr.add(self._update_task, self._task_name)

    # Setup -----------------------------------------------------------
    def _setup_environment(self) -> None:
        self.safehouse_dimensions = Vec3(20, 26, 8)
        self.safehouse_root = self.root.attachNewNode("safehouse")
        self._build_safehouse_shell(self.safehouse_root, self.safehouse_dimensions)
        self._add_safehouse_details(self.safehouse_root, self.safehouse_dimensions)
        self._configure_safehouse_lighting(self.safehouse_root)

        self.app.render.setShaderAuto()

    def _setup_camera(self) -> None:
        self.app.camera.reparentTo(self.player_np)
        self.app.camera.setPos(0, 0, 1.6)
        self.app.camera.setHpr(0, 0, 0)

        self.center_x = int(self.app.win.getXSize() / 2)
        self.center_y = int(self.app.win.getYSize() / 2)

        self._set_mouse_capture(True)

    def _setup_weapon_anchor(self) -> None:
        self.weapon_root = self.app.camera.attachNewNode("weapon_anchor")
        self.weapon_root.setPos(0.32, 0.85, -0.3)
        self.weapon_root.setHpr(5, -4, 0)
        self.weapon_root.setScale(1.0)

    def _setup_projectiles(self) -> None:
        self.projectile_root = self.root.attachNewNode("projectiles")
        self.projectiles = []

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
        self.app.accept("mouse1", self._on_fire_pressed)
        self._accepted_events.append("mouse1")
        self.app.accept("mouse1-up", self._on_fire_released)
        self._accepted_events.append("mouse1-up")
        self.app.accept("r", self._reload_weapon)
        self._accepted_events.append("r")

    def _setup_hud(self) -> None:

        self.weapon_hud = OnscreenText(
            text="No weapon equipped",
            pos=(0.9, -0.85),
            scale=0.06,
            fg=(0.85, 0.95, 1, 1),
            align=TextNode.ARight,
            mayChange=True,
        )
        self._update_weapon_hud()

    def _setup_tabbed_menu(self) -> None:
        self.tabbed_menu = TabbedMenu(
            self.player_stats, self.inventory, self.equipment
        )
        self.tabbed_menu.hide()

    def _build_safehouse_shell(self, parent: NodePath, room_size: Vec3) -> None:

        concrete_base_color = Vec4(0.32, 0.33, 0.35, 1.0)
        concrete_trim_color = Vec4(0.28, 0.29, 0.31, 1.0)
        ceiling_color = Vec4(0.24, 0.24, 0.26, 1.0)

        def make_material(name: str, base_color: Vec4) -> Material:
            mat = Material(name)
            mat.setDiffuse(base_color)
            mat.setAmbient(
                Vec4(base_color.x * 0.6, base_color.y * 0.6, base_color.z * 0.6, 1.0)
            )
            mat.setSpecular(Vec4(0.08, 0.08, 0.08, 1.0))
            mat.setShininess(8.0)
            return mat

        base_material = make_material("concrete_base", concrete_base_color)
        trim_material = make_material("concrete_trim", concrete_trim_color)
        ceiling_material = make_material("concrete_ceiling", ceiling_color)

        # Floor ----------------------------------------------------------------
        floor_maker = CardMaker("safehouse_floor")
        floor_maker.setFrame(
            -room_size.x / 2,
            room_size.x / 2,
            -room_size.y / 2,
            room_size.y / 2,
        )
        floor = parent.attachNewNode(floor_maker.generate())
        floor.setPos(0, 0, 0)
        floor.setColor(concrete_base_color)
        floor.setMaterial(base_material, 1)
        floor.setTwoSided(True)

        # Ceiling --------------------------------------------------------------
        ceiling = parent.attachNewNode(floor_maker.generate())
        ceiling.setPos(0, 0, room_size.z)
        ceiling.setHpr(180, 0, 0)
        ceiling.setColor(ceiling_color)
        ceiling.setMaterial(ceiling_material, 1)
        ceiling.setTwoSided(True)

        # Primary walls --------------------------------------------------------
        wall_maker = CardMaker("safehouse_wall")
        wall_maker.setFrame(
            -room_size.x / 2,
            room_size.x / 2,
            -room_size.z / 2,
            room_size.z / 2,
        )

        back_wall = parent.attachNewNode(wall_maker.generate())
        back_wall.setPos(0, room_size.y / 2, room_size.z / 2)
        back_wall.setP(-90)
        back_wall.setColor(concrete_base_color)
        back_wall.setMaterial(base_material, 1)
        back_wall.setTwoSided(True)

        front_wall = parent.attachNewNode(wall_maker.generate())
        front_wall.setPos(0, -room_size.y / 2, room_size.z / 2)
        front_wall.setP(90)
        front_wall.setColor(concrete_base_color)
        front_wall.setMaterial(base_material, 1)
        front_wall.setTwoSided(True)

        side_wall_maker = CardMaker("safehouse_side_wall")
        side_wall_maker.setFrame(
            -room_size.y / 2,
            room_size.y / 2,
            -room_size.z / 2,
            room_size.z / 2,
        )

        left_wall = parent.attachNewNode(side_wall_maker.generate())
        left_wall.setPos(-room_size.x / 2, 0, room_size.z / 2)
        left_wall.setH(90)
        left_wall.setP(-90)
        left_wall.setColor(concrete_base_color)
        left_wall.setMaterial(base_material, 1)
        left_wall.setTwoSided(True)

        right_wall = parent.attachNewNode(side_wall_maker.generate())
        right_wall.setPos(room_size.x / 2, 0, room_size.z / 2)
        right_wall.setH(-90)
        right_wall.setP(-90)
        right_wall.setColor(concrete_base_color)
        right_wall.setMaterial(base_material, 1)
        right_wall.setTwoSided(True)

        # Add darker trim bands to break up the silhouette
        trim_height = 1.2
        trim_offset = room_size.z / 2 - trim_height / 2
        trim_maker = CardMaker("safehouse_trim")
        trim_maker.setFrame(-room_size.x / 2, room_size.x / 2, -trim_height / 2, trim_height / 2)

        for sign in (-1, 1):
            trim = parent.attachNewNode(trim_maker.generate())
            trim.setPos(0, sign * (room_size.y / 2 - 0.01), trim_offset)
            trim.setP(-90 * sign)
            trim.setColor(concrete_trim_color)
            trim.setMaterial(trim_material, 1)
            trim.setTwoSided(True)

        trim_side_maker = CardMaker("safehouse_side_trim")
        trim_side_maker.setFrame(
            -room_size.y / 2,
            room_size.y / 2,
            -trim_height / 2,
            trim_height / 2,
        )

        for sign in (-1, 1):
            side_trim = parent.attachNewNode(trim_side_maker.generate())
            side_trim.setPos(sign * (room_size.x / 2 - 0.01), 0, trim_offset)
            side_trim.setH(sign * 90)
            side_trim.setP(-90)
            side_trim.setColor(concrete_trim_color)
            side_trim.setMaterial(trim_material, 1)
            side_trim.setTwoSided(True)

    def _add_safehouse_details(self, parent: NodePath, room_size: Vec3) -> None:
        # Build a raised platform at the rear for staging equipment lockers
        dais_depth = 6.0
        dais_height = 0.35
        dais_width = room_size.x - 8.0

        dais_maker = CardMaker("safehouse_dais")
        dais_maker.setFrame(-dais_width / 2, dais_width / 2, -dais_depth / 2, dais_depth / 2)
        dais = parent.attachNewNode(dais_maker.generate())
        dais.setPos(0, room_size.y / 2 - dais_depth / 2 - 1.0, dais_height)
        dais.setColor(0.26, 0.27, 0.29, 1.0)
        dais.setP(0)
        dais.setTwoSided(True)

        riser_height = dais_height
        riser_maker = CardMaker("safehouse_dais_riser")
        riser_maker.setFrame(-dais_width / 2, dais_width / 2, -riser_height / 2, riser_height / 2)
        riser = parent.attachNewNode(riser_maker.generate())
        riser.setPos(0, dais.getY() - dais_depth / 2, riser_height / 2)
        riser.setP(90)
        riser.setColor(0.22, 0.23, 0.25, 1.0)
        riser.setTwoSided(True)

        # Add a simple walkway strip around the edges to suggest embedded lighting
        walkway_width = 1.2
        walkway_color = (0.38, 0.4, 0.42, 1.0)

        front_back_maker = CardMaker("safehouse_walkway_fb")
        front_back_maker.setFrame(
            -(room_size.x - 2.0) / 2,
            (room_size.x - 2.0) / 2,
            -walkway_width / 2,
            walkway_width / 2,
        )

        for y_sign in (-1, 1):
            walkway = parent.attachNewNode(front_back_maker.generate())
            walkway.setPos(0, y_sign * (room_size.y / 2 - walkway_width / 2), 0.01)
            walkway.setColor(walkway_color)
            walkway.setTwoSided(True)

        side_maker = CardMaker("safehouse_walkway_side")
        side_maker.setFrame(
            -(room_size.y - 2.0) / 2,
            (room_size.y - 2.0) / 2,
            -walkway_width / 2,
            walkway_width / 2,
        )

        for x_sign in (-1, 1):
            walkway = parent.attachNewNode(side_maker.generate())
            walkway.setPos(x_sign * (room_size.x / 2 - walkway_width / 2), 0, 0.01)
            walkway.setH(90)
            walkway.setColor(walkway_color)
            walkway.setTwoSided(True)

        # Create inset floor panels to give the space more depth
        inset_maker = CardMaker("safehouse_inset")
        inset_maker.setFrame(-4, 4, -4, 4)

        inset_offset = room_size.x / 2 - 3.5
        inset_positions = [
            Vec3(-inset_offset, -inset_offset, 0.02),
            Vec3(inset_offset, -inset_offset, 0.02),
            Vec3(-inset_offset, inset_offset, 0.02),
        ]
        for pos in inset_positions:
            inset = parent.attachNewNode(inset_maker.generate())
            inset.setPos(pos)
            inset.setColor(0.29, 0.3, 0.32, 1.0)
            inset.setTwoSided(True)

        # Suspended ceiling light panels to accentuate the safehouse vibe
        light_panel_maker = CardMaker("safehouse_ceiling_light")
        light_panel_maker.setFrame(-2.4, 2.4, -0.5, 0.5)

        for offset in (-5.0, 0.0, 5.0):
            panel = parent.attachNewNode(light_panel_maker.generate())
            panel.setPos(0, offset, room_size.z - 0.05)
            panel.setHpr(180, 0, 0)
            panel.setColor(0.78, 0.82, 0.88, 1.0)
            panel.setTwoSided(True)

    def _configure_safehouse_lighting(self, parent: NodePath) -> None:
        ambient = AmbientLight("safehouse_ambient")
        ambient.setColor((0.26, 0.28, 0.32, 1.0))
        ambient_np = parent.attachNewNode(ambient)
        parent.setLight(ambient_np)

        key_light = DirectionalLight("safehouse_key")
        key_light.setColor((0.62, 0.65, 0.7, 1.0))
        key_light.setShadowCaster(False)
        key_np = parent.attachNewNode(key_light)
        key_np.setHpr(-35, -45, 0)
        parent.setLight(key_np)

        fill_light = DirectionalLight("safehouse_fill")
        fill_light.setColor((0.3, 0.32, 0.35, 1.0))
        fill_np = parent.attachNewNode(fill_light)
        fill_np.setHpr(145, -30, 0)
        parent.setLight(fill_np)

    def _seed_debug_items(self) -> None:
        """Populate the prototype inventory with a few sample items."""

        gear_templates = [
            (
                ItemTemplate(
                    id="aegis_recon_visor",
                    name="Recon Visor",
                    description="Advanced optics suite hardened for combat ops.",
                    category="Armor - Head",
                    stack_limit=1,
                    stat_bonuses={"max_focus": 10, "willpower": 2},
                ),
                "head",
            ),
            (
                ItemTemplate(
                    id="aegis_breastplate",
                    name="Ballistic Carapace",
                    description="Reactive plating that disperses high-calibre impacts.",
                    category="Armor - Chest",
                    stack_limit=1,
                    stat_bonuses={"max_health": 35, "health_regen": 0.5},
                ),
                "chest",
            ),
            (
                ItemTemplate(
                    id="aegis_vambraces",
                    name="Kinetic Vambraces",
                    description="Servo-assisted forearm guards for melee deflection.",
                    category="Armor - Arms",
                    stack_limit=1,
                    stat_bonuses={"strength": 3},
                ),
                "arms",
            ),
            (
                ItemTemplate(
                    id="aegis_greaves",
                    name="Mobility Greaves",
                    description="Stabilised leg armor that enhances jump resilience.",
                    category="Armor - Legs",
                    stack_limit=1,
                    stat_bonuses={"agility": 3, "max_health": 15},
                ),
                "legs",
            ),
            (
                ItemTemplate(
                    id="aegis_psionic_relic",
                    name="Psionic Resonator",
                    description="Artifact that boosts tactical focus regeneration.",
                    category="Artifact",
                    stack_limit=1,
                    stat_bonuses={"max_focus": 20, "focus_regen": 1.5},
                ),
                "artifact",
            ),
        ]

        for template, slot_id in gear_templates:
            self.equipment.equip(slot_id, template)

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
                stat_bonuses={"agility": 12}
            ), 1),
            (ItemTemplate(
                id="aegis_operative_badge",
                name="Operative Badge",
                description="Identification marking elite Aegis operatives.",
                category="Quest Item",
                stack_limit=1,
            ), 1),
            (ItemTemplate(
                id="reserve_arm_guards",
                name="Reserve Arm Guards",
                description="Spare gauntlets stored for emergency deployment.",
                category="Armor - Arms",
                stack_limit=1,
                stat_bonuses={"strength": 1},
            ), 1),
            (ItemTemplate(
                id="lunar_focus_charm",
                name="Lunar Focus Charm",
                description="A miniature relic humming with psionic energy.",
                category="Artifact",
                stack_limit=1,
                stat_bonuses={"max_focus": 10, "focus_regen": 0.8},
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
            self.is_fire_held = False
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
            self._update_weapon(dt)
            self._update_projectiles(dt)
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

        self.equipment.remove_listener(self._on_equipment_changed)

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
        if hasattr(self, "weapon_hud") and self.weapon_hud is not None:
            self.weapon_hud.destroy()
            self.weapon_hud = None
        if self.weapon_model is not None and not self.weapon_model.isEmpty():
            self.weapon_model.removeNode()
            self.weapon_model = None
        self._clear_projectiles()
        if self.projectile_root is not None and not self.projectile_root.isEmpty():
            self.projectile_root.removeNode()
            self.projectile_root = None
        if self.weapon_root is not None and not self.weapon_root.isEmpty():
            self.weapon_root.removeNode()
            self.weapon_root = None

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

    # Equipment events ------------------------------------------------
    def _on_equipment_changed(self, loadout: EquipmentLoadout) -> None:
        self.player_stats.set_equipment_bonuses(loadout.build_stat_bonuses())
        self._refresh_active_weapon(loadout)

    # Weapon handling ------------------------------------------------
    def _refresh_active_weapon(self, loadout: EquipmentLoadout) -> None:
        slot = loadout.get_slot("primary")
        template = slot.item if slot is not None else None
        blueprint: WeaponBlueprint | None = None
        self.is_fire_held = False
        if template is not None:
            blueprint = get_weapon_blueprint(template.id)
        if blueprint is None:
            self.active_weapon = None
        else:
            self.active_weapon = WeaponState(blueprint)
        self._set_weapon_model(blueprint)
        self._update_weapon_hud()

    def _set_weapon_model(self, blueprint: WeaponBlueprint | None) -> None:
        if self.weapon_model is not None and not self.weapon_model.isEmpty():
            self.weapon_model.removeNode()
            self.weapon_model = None

        if blueprint is None:
            return

        if self.weapon_root is None or self.weapon_root.isEmpty():
            return

        model = build_weapon_model(blueprint)
        model.reparentTo(self.weapon_root)
        model.setPos(0, 0, 0)
        model.setScale(1.0)
        self.weapon_model = model

    def _update_weapon(self, dt: float) -> None:
        weapon = self.active_weapon
        if weapon is None:
            return

        was_reloading = weapon.is_reloading
        weapon.update(dt)
        if was_reloading and not weapon.is_reloading:
            self._update_weapon_hud()
        if self.is_fire_held and weapon.blueprint.automatic:
            event = weapon.try_fire()
            if event.fired:
                print(
                    f"[Weapon] Fired {weapon.blueprint.name} for {event.damage:.1f} damage"
                )
                self._spawn_projectile(weapon, event.damage)
                self._update_weapon_hud()
            elif event.reason == "empty":
                self._update_weapon_hud()

    def _on_fire_pressed(self) -> None:
        if self.is_paused:
            return
        self.is_fire_held = True
        weapon = self.active_weapon
        if weapon is None:
            return
        event = weapon.try_fire()
        if event.fired:
            print(f"[Weapon] Fired {weapon.blueprint.name} for {event.damage:.1f} damage")
            self._spawn_projectile(weapon, event.damage)
        elif event.reason == "empty":
            print("[Weapon] Trigger pulled on empty magazine")
        elif event.reason == "reloading":
            print("[Weapon] Cannot fire while reloading")
        self._update_weapon_hud()

    def _on_fire_released(self) -> None:
        self.is_fire_held = False

    def _reload_weapon(self) -> None:
        if self.is_paused:
            return
        weapon = self.active_weapon
        if weapon is None:
            return
        event = weapon.start_reload()
        if event.reason == "reload-started":
            print(f"[Weapon] Reloading {weapon.blueprint.name}")
        elif event.reason == "mag-full":
            print("[Weapon] Magazine already full")
        elif event.reason == "already-reloading":
            print("[Weapon] Reload already in progress")
        self._update_weapon_hud()

    def _update_weapon_hud(self) -> None:
        if not hasattr(self, "weapon_hud") or self.weapon_hud is None:
            return
        if self.active_weapon is None:
            self.weapon_hud.setText("No weapon equipped")
            return
        weapon = self.active_weapon
        status = "Reloading" if weapon.is_reloading else weapon.get_ammo_display()
        self.weapon_hud.setText(f"{weapon.blueprint.name}\n{status}")

    # Projectiles ----------------------------------------------------
    def _spawn_projectile(self, weapon: WeaponState, base_damage: float) -> None:
        if self.projectile_root is None or self.projectile_root.isEmpty():
            return
        projectile_id = weapon.blueprint.projectile_id
        if projectile_id is None:
            return
        blueprint = get_projectile_blueprint(projectile_id)
        if blueprint is None:
            print(f"[Projectile] Blueprint '{projectile_id}' not found")
            return

        origin = self.app.camera.getPos(self.root)
        direction = self.app.camera.getQuat(self.root).getForward()
        if direction.length_squared() == 0:
            direction = Vec3(0, 1, 0)
        else:
            direction.normalize()

        spawn_position = origin + direction * 0.6
        projectile = Projectile(
            blueprint,
            self.projectile_root,
            spawn_position,
            direction,
            base_damage,
        )
        self.projectiles.append(projectile)

    def _update_projectiles(self, dt: float) -> None:
        alive: list[Projectile] = []
        for projectile in self.projectiles:
            if projectile.update(dt):
                alive.append(projectile)
        self.projectiles = alive

    def _clear_projectiles(self) -> None:
        for projectile in self.projectiles:
            projectile.destroy()
        self.projectiles.clear()


__all__ = ["GameWorld"]
