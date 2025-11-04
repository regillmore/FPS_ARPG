"""Game world implementation for the prototype FPS ARPG."""

from __future__ import annotations

from typing import TYPE_CHECKING

import random

from panda3d.core import (
    BitMask32,
    CardMaker,
    ClockObject,
    CollisionHandlerPusher,
    CollisionHandlerQueue,
    CollisionNode,
    CollisionSphere,
    CollisionTraverser,
    NodePath,
    Point3,
    TextNode,
    TransparencyAttrib,
    Vec3,
    Vec4,
    WindowProperties,
)

from direct.gui.DirectGui import OnscreenText

from .enemies import Enemy, TargetDummy
from .equipment import EquipmentLoadout
from .inventory import Inventory, InventoryStack, ItemTemplate
from .projectiles import Projectile, get_projectile_blueprint
from .stats import PlayerStats
from .ui import (
    FloatingDamageNumbers,
    ItemHoverDisplay,
    PlayerHUD,
    TabbedMenu,
)
from .weapon_geometry import build_weapon_model
from .weapons import WeaponBlueprint, WeaponState, get_weapon_blueprint
from .world_items import ItemPickup
from .stash import StashBox, StashOverlay, transfer_all_items


FIELD_MEDKIT_TEMPLATE = ItemTemplate(
    id="field_medkit",
    name="Field Medkit",
    description="Restores a large chunk of health when deployed.",
    category="Consumable",
    stack_limit=5,
)
from .maps import SafehouseMap, SafehouseMapInstance

if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from .app import GameApp


class GameWorld:
    """Simple first-playable test area with FPS-style controls."""

    MOVE_SPEED = 10
    MOUSE_SENSITIVITY = 0.2
    PITCH_LIMIT = 75
    ENVIRONMENT_COLLISION_MASK = BitMask32.bit(2)
    MAX_PROJECTILE_DECALS = 60
    PICKUP_HOVER_RANGE = ItemPickup.PICKUP_RADIUS + 5.0
    PICKUP_AIM_THRESHOLD = 0.995

    def __init__(self, app: "GameApp") -> None:
        self.app = app
        self.root = self.app.render.attachNewNode("game_world")
        self.player_np = self.root.attachNewNode("player")
        self.player_np.setPos(0, 0, 2)

        self.map_resource = SafehouseMap(
            width=20.0,
            length=100.0,
            height=10.0,
            environment_collision_mask=self.ENVIRONMENT_COLLISION_MASK,
        )
        self.map_instance: SafehouseMapInstance | None = None

        self.collision_traverser = CollisionTraverser("game_world_traverser")
        self.collision_handler = CollisionHandlerPusher()
        self.player_collider: NodePath | None = None
        self.environment_collider: NodePath | None = None

        self.heading = 0.0
        self.pitch = 0.0
        self.is_paused = False
        self._mouse_captured = False

        self.weapon_root: NodePath | None = None
        self.weapon_model: NodePath | None = None
        self.weapon_muzzle: NodePath | None = None
        self.active_weapon: WeaponState | None = None
        self.is_fire_held = False
        self.projectile_root: NodePath | None = None
        self.projectiles: list[Projectile] = []
        self.projectile_collision_handler = CollisionHandlerQueue()
        self.projectile_colliders: dict[int, Projectile] = {}
        self.projectile_decal_root: NodePath | None = None
        self.projectile_decals: list[NodePath] = []

        self.enemy_root: NodePath | None = None
        self.enemies: list[Enemy] = []

        self.item_root: NodePath | None = None
        self.item_pickups: list[ItemPickup] = []

        self.player_stats = PlayerStats()
        self.inventory = Inventory()
        self.equipment = EquipmentLoadout()
        self.equipment.add_listener(self._on_equipment_changed)
        self.damage_numbers = FloatingDamageNumbers()
        self.crosshair_root: NodePath | None = None
        self.hud: PlayerHUD | None = None
        self.item_hover_display: ItemHoverDisplay | None = None
        self._seed_debug_items()

        self.stash_box: StashBox | None = None
        self.stash_overlay: StashOverlay | None = None
        self._is_stash_open = False
        self._stash_prompt: OnscreenText | None = None

        self.key_map: dict[str, bool] = {
            "forward": False,
            "back": False,
            "left": False,
            "right": False,
        }

        self._accepted_events: list[str] = []

        self._setup_environment()
        self._setup_collisions()
        self._setup_camera()
        self._setup_weapon_anchor()
        self._setup_projectiles()
        self._setup_item_pickups()
        self._setup_enemies()
        self._setup_stash()
        self._setup_controls()
        self._setup_hud()
        self._setup_tabbed_menu()

        self._on_equipment_changed(self.equipment)

        self._task_name = "update_game_world"
        self.app.taskMgr.add(self._update_task, self._task_name)

    # Setup -----------------------------------------------------------
    def _setup_environment(self) -> None:
        self.map_instance = self.map_resource.build(self.root)
        self.environment_collider = self.map_instance.environment_collider
        for light_np in self.map_instance.lights:
            self.root.setLight(light_np)
        self.app.render.setShaderAuto()

    def _setup_collisions(self) -> None:
        player_collider_node = CollisionNode("player_collider")
        player_collider_node.setFromCollideMask(self.ENVIRONMENT_COLLISION_MASK)
        player_collider_node.setIntoCollideMask(BitMask32.allOff())
        player_collider_node.addSolid(CollisionSphere(0, 0, 0, 0.5))
        self.player_collider = self.player_np.attachNewNode(player_collider_node)
        self.collision_handler.addCollider(self.player_collider, self.player_np)
        self.collision_traverser.addCollider(self.player_collider, self.collision_handler)

        if (
            self.map_instance is None
            or self.map_instance.environment_collider.isEmpty()
        ):
            self.environment_collider = None
            return

        self.environment_collider = self.map_instance.environment_collider

    def _setup_camera(self) -> None:
        self.app.camera.reparentTo(self.player_np)
        self.app.camera.setPos(0, 0, 1.6)
        self.app.camera.setHpr(0, 0, 0)

        self.center_x = int(self.app.win.getXSize() / 2)
        self.center_y = int(self.app.win.getYSize() / 2)

        self._set_mouse_capture(True)

    def _setup_weapon_anchor(self) -> None:
        self.weapon_root = self.app.camera.attachNewNode("weapon_anchor")
        self.weapon_root.setPos(0.32, 1.85, -0.3)
        self.weapon_root.setHpr(0.4, 0.3, 0)
        self.weapon_root.setScale(1.0)

    def _setup_projectiles(self) -> None:
        self.projectile_root = self.root.attachNewNode("projectiles")
        self.projectiles = []
        self.projectile_colliders.clear()
        self.projectile_decals = []
        if (
            self.map_instance is not None
            and not self.map_instance.projectile_decal_root.isEmpty()
        ):
            self.projectile_decal_root = self.map_instance.projectile_decal_root
        else:
            self.projectile_decal_root = self.root.attachNewNode("projectile_decals")

    def _setup_item_pickups(self) -> None:
        if self.item_root is not None and not self.item_root.isEmpty():
            self.item_root.removeNode()
        self.item_root = self.root.attachNewNode("item_pickups")
        self.item_pickups = []

    def _setup_stash(self) -> None:
        if self.map_instance is None or self.map_instance.stash_anchor.isEmpty():
            return

        stash_parent = self.map_instance.stash_anchor
        stash_inventory = Inventory(capacity=36)
        self.stash_box = StashBox(stash_parent, stash_inventory)
        self.stash_overlay = StashOverlay(self.inventory, stash_inventory)
        self.stash_overlay.hide()
        self._is_stash_open = False
        self._stash_prompt = OnscreenText(
            text="F - Access Safehouse Stash",
            parent=self.app.aspect2d,
            pos=(0, -0.9),
            scale=0.05,
            fg=(0.82, 0.88, 1.0, 1.0),
            align=TextNode.ACenter,
            mayChange=False,
        )
        self._stash_prompt.hide()

    def _setup_enemies(self) -> None:
        if self.enemy_root is not None and not self.enemy_root.isEmpty():
            self.enemy_root.removeNode()
        self.enemy_root = self.root.attachNewNode("enemies")
        self.enemies = []
        self._spawn_safehouse_dummy()

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
        self.app.accept("f", self._handle_stash_interact)
        self._accepted_events.append("f")
        self.app.accept("z", self._deposit_all_to_stash)
        self._accepted_events.append("z")
        self.app.accept("x", self._withdraw_all_from_stash)
        self._accepted_events.append("x")

    def _spawn_safehouse_dummy(self) -> None:
        if self.enemy_root is None or self.enemy_root.isEmpty():
            return
        dummy = TargetDummy(
            self.enemy_root,
            self.ENVIRONMENT_COLLISION_MASK,
            on_death_callback=self._on_safehouse_dummy_death,
        )
        dummy.node.setPos(0.0, 18.0, 0.0)
        dummy.node.setH(180.0)
        self._register_enemy(dummy)

    def _register_enemy(self, enemy: Enemy) -> None:
        if self.damage_numbers is not None:
            enemy.set_damage_number_manager(self.damage_numbers)
        self.enemies.append(enemy)

    def _on_safehouse_dummy_death(self, dummy: TargetDummy) -> None:
        drop_position = dummy.node.getPos(self.root) + Vec3(0.0, 0.0, 0.5)
        self._spawn_item_pickup(FIELD_MEDKIT_TEMPLATE, drop_position)

    def _spawn_item_pickup(
        self, template: ItemTemplate, position: Vec3, quantity: int = 1
    ) -> None:
        if self.item_root is None or self.item_root.isEmpty():
            return
        pickup = ItemPickup(self.item_root, template, quantity)
        pickup.node.setPos(position)
        self.item_pickups.append(pickup)

    def _setup_hud(self) -> None:

        self.hud = PlayerHUD(self.player_stats)
        self._build_crosshair()
        self._update_weapon_hud()
        if self.item_hover_display is None:
            try:
                self.item_hover_display = ItemHoverDisplay(parent=self.app.aspect2d)
            except RuntimeError:
                self.item_hover_display = None
        if self.item_hover_display is not None:
            self.item_hover_display.hide()

    def _build_crosshair(self) -> None:
        if self.crosshair_root is not None and not self.crosshair_root.isEmpty():
            self.crosshair_root.removeNode()

        self.crosshair_root = self.app.aspect2d.attachNewNode("sentinel_crosshair")
        self.crosshair_root.setTransparency(TransparencyAttrib.MAlpha)
        self.crosshair_root.setBin("fixed", 0)

        color = Vec4(0.95, 0.98, 1.0, 0.9)
        thickness = 0.01
        length = 0.06

        def _make_bar(name: str, width: float, height: float) -> NodePath:
            cm = CardMaker(name)
            cm.setFrame(-width * 0.5, width * 0.5, -height * 0.5, height * 0.5)
            bar = self.crosshair_root.attachNewNode(cm.generate())
            bar.setColor(color)
            return bar

        _make_bar("sentinel_crosshair_vertical", thickness, length)
        _make_bar("sentinel_crosshair_horizontal", length, thickness)

        self.crosshair_root.hide()

    def _setup_tabbed_menu(self) -> None:
        self.tabbed_menu = TabbedMenu(
            self.player_stats,
            self.inventory,
            self.equipment,
            on_drop_stack=self._drop_inventory_stack,
        )
        self.tabbed_menu.hide()

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
            (FIELD_MEDKIT_TEMPLATE, 3),
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
        elif self.item_hover_display is not None:
            self.item_hover_display.hide()

    def _set_paused(self, paused: bool) -> None:
        if self.is_paused == paused:
            return

        self.is_paused = paused
        if paused:
            self.is_fire_held = False
            self._set_mouse_capture(False)
        else:
            self._set_mouse_capture(True)
        self._update_crosshair()
        if paused and self.item_hover_display is not None:
            self.item_hover_display.hide()

    # Update loop -----------------------------------------------------
    def _update_task(self, task) -> int:
        dt = ClockObject.getGlobalClock().getDt()
        if not self.is_paused:
            self.player_stats.tick(dt)
            self._update_mouse_look()
            self._update_movement(dt)
            self._update_weapon(dt)
            self._update_projectiles(dt)
            self._update_enemies(dt)
            self._update_item_pickups(dt)
            self._traverse_collisions()
        if self.damage_numbers is not None:
            self.damage_numbers.update(dt)
        if self.hud is not None:
            self.hud.update(self.player_stats)
        if self.tabbed_menu.is_visible:
            self.tabbed_menu.update()
        self._update_stash_prompt()
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

    def _traverse_collisions(self) -> None:
        if self.collision_traverser is not None:
            self.collision_traverser.traverse(self.root)
            self._process_projectile_collisions()

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

        if self.stash_overlay is not None:
            self.stash_overlay.destroy()
            self.stash_overlay = None
        if self.stash_box is not None:
            self.stash_box.destroy()
            self.stash_box = None
        if self._stash_prompt is not None:
            self._stash_prompt.destroy()
            self._stash_prompt = None

        if hasattr(self, "hud_text") and self.hud_text is not None:
            self.hud_text.destroy()
            self.hud_text = None
        if hasattr(self, "hud") and self.hud is not None:
            self.hud.destroy()
            self.hud = None
        if self.item_hover_display is not None:
            self.item_hover_display.destroy()
            self.item_hover_display = None
        if self.crosshair_root is not None and not self.crosshair_root.isEmpty():
            self.crosshair_root.removeNode()
            self.crosshair_root = None
        if hasattr(self, "damage_numbers") and self.damage_numbers is not None:
            self.damage_numbers.destroy()
            self.damage_numbers = None
        if self.weapon_model is not None and not self.weapon_model.isEmpty():
            self.weapon_model.removeNode()
            self.weapon_model = None
        self.weapon_muzzle = None
        self._clear_projectiles()
        self._clear_enemies()
        self._clear_item_pickups()
        if self.projectile_root is not None and not self.projectile_root.isEmpty():
            self.projectile_root.removeNode()
            self.projectile_root = None
        if (
            self.projectile_decal_root is not None
            and not self.projectile_decal_root.isEmpty()
        ):
            self.projectile_decal_root.removeNode()
            self.projectile_decal_root = None
        self.projectile_decals = []
        if self.weapon_root is not None and not self.weapon_root.isEmpty():
            self.weapon_root.removeNode()
            self.weapon_root = None

        if self.player_collider is not None and not self.player_collider.isEmpty():
            self.collision_traverser.removeCollider(self.player_collider)
            self.collision_handler.removeCollider(self.player_collider)
            self.player_collider.removeNode()
            self.player_collider = None
        if self.environment_collider is not None and not self.environment_collider.isEmpty():
            self.environment_collider.removeNode()
            self.environment_collider = None

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

    def _drop_inventory_stack(self, stack: InventoryStack) -> bool:
        if stack.quantity <= 0:
            return False
        if (
            self.item_root is None
            or self.item_root.isEmpty()
            or self.player_np is None
            or self.player_np.isEmpty()
        ):
            return False

        forward_offset = Vec3(0.0, 3.0, 0.0)
        forward_world = self.player_np.getQuat(self.root).xform(forward_offset)
        drop_position = self.player_np.getPos(self.root) + forward_world
        drop_position -= Vec3(0.0, 0.0, 1.0)
        drop_position.z = max(drop_position.z, 0.5)

        self._spawn_item_pickup(stack.template, drop_position, stack.quantity)
        return True

    def _handle_stash_interact(self) -> None:
        if self._is_stash_open:
            self._close_stash()
            return
        if self.stash_box is None:
            return
        if not self.stash_box.is_player_in_range(self.player_np):
            return
        self._open_stash()

    def _open_stash(self) -> None:
        if self.stash_overlay is None or self.stash_box is None:
            return
        if self.tabbed_menu.is_visible:
            self.tabbed_menu.hide()
        self.stash_overlay.show()
        self._is_stash_open = True
        self._set_paused(True)
        if self._stash_prompt is not None:
            self._stash_prompt.hide()
        self.stash_box.set_highlighted(True)

    def _close_stash(self) -> None:
        if not self._is_stash_open:
            return
        if self.stash_overlay is not None:
            self.stash_overlay.hide()
        self._is_stash_open = False
        self._set_paused(False)
        self._update_stash_prompt()

    def _deposit_all_to_stash(self) -> None:
        if not self._is_stash_open or self.stash_box is None or self.stash_overlay is None:
            return
        moved = transfer_all_items(self.inventory, self.stash_box.inventory)
        if moved > 0:
            print(f"[Stash] Deposited {moved} item(s) into the safehouse stash")
            self.stash_overlay.refresh()
        else:
            print("[Stash] No items could be deposited")

    def _withdraw_all_from_stash(self) -> None:
        if not self._is_stash_open or self.stash_box is None or self.stash_overlay is None:
            return
        moved = transfer_all_items(self.stash_box.inventory, self.inventory)
        if moved > 0:
            print(f"[Stash] Retrieved {moved} item(s) from the safehouse stash")
            self.stash_overlay.refresh()
        else:
            print("[Stash] No items could be withdrawn")

    def _update_stash_prompt(self) -> None:
        if self.stash_box is None:
            return
        if self._is_stash_open:
            self.stash_box.set_highlighted(True)
            if self._stash_prompt is not None:
                self._stash_prompt.hide()
            return
        in_range = self.stash_box.is_player_in_range(self.player_np)
        self.stash_box.set_highlighted(in_range)
        if self._stash_prompt is not None:
            if in_range:
                self._stash_prompt.show()
            else:
                self._stash_prompt.hide()

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

        muzzle_node = model.find("**/muzzle")
        if not muzzle_node.isEmpty():
            muzzle_tip = muzzle_node.attachNewNode("muzzle_tip")
            bounds = muzzle_node.getTightBounds()
            if (
                bounds is not None
                and bounds[0] is not None
                and bounds[1] is not None
            ):
                min_bound, max_bound = bounds
                muzzle_tip.setPos(
                    (min_bound.x + max_bound.x) * 0.5,
                    max_bound.y,
                    (min_bound.z + max_bound.z) * 0.5,
                )
            self.weapon_muzzle = muzzle_tip
        else:
            self.weapon_muzzle = model.attachNewNode("muzzle_tip")
            self.weapon_muzzle.setPos(0, 1.0, 0)

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
        if self.hud is None:
            return
        if self.active_weapon is None:
            self.hud.set_weapon_status(weapon_name=None, status_text=None)
            self._update_crosshair()
            return
        weapon = self.active_weapon
        status = "Reloading" if weapon.is_reloading else weapon.get_ammo_display()
        self.hud.set_weapon_status(
            weapon_name=weapon.blueprint.name,
            status_text=status,
        )
        self._update_crosshair()

    def _update_crosshair(self) -> None:
        if self.crosshair_root is None or self.crosshair_root.isEmpty():
            return
        weapon = self.active_weapon
        if (
            weapon is None
            or weapon.blueprint.id != "sentinel_rifle"
            or self.is_paused
        ):
            self.crosshair_root.hide()
            return
        self.crosshair_root.show()

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

        if self.weapon_muzzle is not None and not self.weapon_muzzle.isEmpty():
            origin = self.weapon_muzzle.getPos(self.root)
            direction = self.weapon_muzzle.getQuat(self.root).getForward()
        else:
            origin = self.app.camera.getPos(self.root)
            direction = self.app.camera.getQuat(self.root).getForward()
        if direction.length_squared() == 0:
            direction = Vec3(0, 1, 0)
        else:
            direction.normalize()

        spawn_position = origin + direction * 0.1
        projectile = Projectile(
            blueprint,
            self.projectile_root,
            spawn_position,
            direction,
            base_damage,
        )
        self._attach_projectile_collider(projectile)
        self.projectiles.append(projectile)

    def _update_projectiles(self, dt: float) -> None:
        alive: list[Projectile] = []
        for projectile in self.projectiles:
            if projectile.update(dt):
                alive.append(projectile)
            else:
                self._destroy_projectile(projectile, remove_from_list=False)
        self.projectiles = alive

    def _update_enemies(self, dt: float) -> None:
        alive: list[Enemy] = []
        for enemy in self.enemies:
            if enemy.update(dt):
                alive.append(enemy)
            else:
                enemy.destroy()
        self.enemies = alive

    def _update_item_pickups(self, dt: float) -> None:
        if not self.item_pickups:
            self._update_item_hover_display(None)
            return

        targeted = self._find_targeted_pickup()

        alive: list[ItemPickup] = []
        for pickup in self.item_pickups:
            pickup.update(dt)
            consumed = pickup.try_collect(self.player_np, self.inventory)
            if not consumed and pickup.quantity > 0:
                alive.append(pickup)
            elif pickup is targeted:
                targeted = None
        self.item_pickups = alive
        if targeted not in alive:
            targeted = None
        self._update_item_hover_display(targeted)

    def _clear_projectiles(self) -> None:
        for projectile in self.projectiles:
            self._destroy_projectile(projectile, remove_from_list=False)
        self.projectiles.clear()
        self.projectile_colliders.clear()

    def _clear_enemies(self) -> None:
        for enemy in self.enemies:
            enemy.destroy()
        self.enemies.clear()
        if self.enemy_root is not None and not self.enemy_root.isEmpty():
            self.enemy_root.removeNode()
            self.enemy_root = None

    def _clear_item_pickups(self) -> None:
        for pickup in self.item_pickups:
            pickup.destroy()
        self.item_pickups.clear()
        if self.item_root is not None and not self.item_root.isEmpty():
            self.item_root.removeNode()
            self.item_root = None
        if self.item_hover_display is not None:
            self.item_hover_display.hide()

    def _find_targeted_pickup(self) -> ItemPickup | None:
        if (
            self.is_paused
            or self.app.camera is None
            or self.app.camera.isEmpty()
            or self.player_np is None
            or self.player_np.isEmpty()
        ):
            return None

        camera_pos = self.app.camera.getPos(self.root)
        forward = self.app.camera.getQuat(self.root).getForward()
        if forward.length_squared() == 0:
            return None
        forward.normalize()

        best_pickup: ItemPickup | None = None
        best_alignment = self.PICKUP_AIM_THRESHOLD
        best_distance = float("inf")

        for pickup in self.item_pickups:
            if pickup.quantity <= 0 or pickup.node.isEmpty():
                continue
            if self.player_np.getDistance(pickup.node) > self.PICKUP_HOVER_RANGE:
                continue

            offset = pickup.node.getPos(self.root) - camera_pos
            distance = offset.length()
            if distance <= 0.0:
                continue
            offset.normalize()
            alignment = forward.dot(offset)
            if alignment < self.PICKUP_AIM_THRESHOLD:
                continue

            if (
                best_pickup is None
                or alignment > best_alignment + 1e-4
                or (
                    abs(alignment - best_alignment) <= 1e-4
                    and distance < best_distance
                )
            ):
                best_pickup = pickup
                best_alignment = alignment
                best_distance = distance

        return best_pickup

    def _update_item_hover_display(self, pickup: ItemPickup | None) -> None:
        if self.item_hover_display is None:
            return
        if (
            pickup is None
            or pickup.quantity <= 0
            or pickup.node.isEmpty()
            or self.is_paused
        ):
            self.item_hover_display.hide()
            return
        self.item_hover_display.show_item(pickup.template, pickup.quantity)

    def _attach_projectile_collider(self, projectile: Projectile) -> None:
        if self.projectile_collision_handler is None or self.collision_traverser is None:
            return
        collider_node = CollisionNode(f"{projectile.blueprint.id}_collider")
        collider_node.setFromCollideMask(self.ENVIRONMENT_COLLISION_MASK)
        collider_node.setIntoCollideMask(BitMask32.allOff())
        radius = max(projectile.blueprint.scale * 0.6, 0.03)
        collider_node.addSolid(CollisionSphere(0, 0, 0, radius))
        collider = projectile.node.attachNewNode(collider_node)
        self.collision_traverser.addCollider(collider, self.projectile_collision_handler)
        projectile.set_collider(collider)
        self.projectile_colliders[collider.getKey()] = projectile

    def _destroy_projectile(
        self, projectile: Projectile, *, remove_from_list: bool = True
    ) -> None:
        collider = projectile.collider
        if collider is not None:
            collider_key = collider.getKey()
            self.projectile_colliders.pop(collider_key, None)
            if self.collision_traverser is not None:
                self.collision_traverser.removeCollider(collider)
            if not collider.isEmpty():
                collider.removeNode()
            projectile.set_collider(None)
        projectile.destroy()
        if remove_from_list and projectile in self.projectiles:
            self.projectiles.remove(projectile)

    def _find_enemy_on_node(self, node: NodePath) -> Enemy | None:
        current = node
        while not current.isEmpty() and current != self.root:
            if current.hasPythonTag(Enemy.COLLIDER_TAG):
                candidate = current.getPythonTag(Enemy.COLLIDER_TAG)
                if isinstance(candidate, Enemy):
                    return candidate
                return None
            current = current.getParent()
        return None

    def _process_projectile_collisions(self) -> None:
        handler = self.projectile_collision_handler
        if handler is None or handler.getNumEntries() == 0:
            return
        handler.sortEntries()
        impacted: set[Projectile] = set()
        for index in range(handler.getNumEntries()):
            entry = handler.getEntry(index)
            from_np = entry.getFromNodePath()
            projectile = self.projectile_colliders.get(from_np.getKey())
            if projectile is None or projectile in impacted:
                continue
            hit_point = entry.getSurfacePoint(self.root)
            hit_normal = entry.getSurfaceNormal(self.root)
            enemy = self._find_enemy_on_node(entry.getIntoNodePath())
            if enemy is not None:
                enemy.handle_projectile_hit(
                    projectile,
                    Vec3(hit_point),
                    Vec3(hit_normal),
                )
            else:
                self._spawn_projectile_decal(hit_point, hit_normal, projectile)
            impacted.add(projectile)
        try:
            handler.clearEntries()
        except AttributeError:
            pass
        for projectile in impacted:
            self._destroy_projectile(projectile)

    def _spawn_projectile_decal(
        self, position: Point3, normal: Vec3, projectile: Projectile
    ) -> None:
        if self.projectile_decal_root is None or self.projectile_decal_root.isEmpty():
            return
        cm = CardMaker("projectile_decal")
        size = max(projectile.blueprint.scale * 2.5, 0.15)
        cm.setFrame(-size / 2, size / 2, -size / 2, size / 2)
        decal = self.projectile_decal_root.attachNewNode(cm.generate())
        offset = Vec3(normal)
        if offset.length() > 0:
            offset.normalize()
            offset *= 0.01
        else:
            offset = Vec3(0, 0, 0)
        decal.setPos(self.projectile_decal_root, position + offset)
        decal.lookAt(self.projectile_decal_root, position - normal)
        decal.setR(random.uniform(0.0, 360.0))
        decal.setTransparency(TransparencyAttrib.M_alpha)
        decal.setDepthOffset(1)
        base_color = projectile.blueprint.color
        tint = Vec4(
            max(0.05, base_color.x * 0.45),
            max(0.05, base_color.y * 0.45),
            max(0.05, base_color.z * 0.45),
            0.85,
        )
        decal.setColor(tint)
        decal.setLightOff(1)
        self.projectile_decals.append(decal)
        if len(self.projectile_decals) > self.MAX_PROJECTILE_DECALS:
            oldest = self.projectile_decals.pop(0)
            if not oldest.isEmpty():
                oldest.removeNode()


__all__ = ["GameWorld"]
