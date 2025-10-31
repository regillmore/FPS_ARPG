"""User interface widgets built with Panda3D DirectGUI."""

from __future__ import annotations

from typing import TYPE_CHECKING

from direct.gui import DirectGuiGlobals as DGG
from direct.gui.DirectGui import DirectButton, DirectFrame, OnscreenText
from direct.showbase import ShowBaseGlobal
from panda3d.core import TextNode

from .equipment import EquipmentLoadout
from .inventory import Inventory, InventoryStack, ItemTemplate
from .stats import PlayerStats

if TYPE_CHECKING:  # pragma: no cover - used only for type checking
    from .app import GameApp


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


class StatsMenu:
    """Lightweight overlay that visualises :class:`PlayerStats`."""

    def __init__(
        self,
        stats: PlayerStats,
        *,
        parent: DirectFrame | None = None,
        frame_size: tuple[float, float, float, float] | None = None,
        footer_text: str | None = "TAB - Close",
    ) -> None:
        self.stats = stats
        frame_kwargs: dict[str, object] = {
            "frameColor": (0.05, 0.05, 0.07, 0.85),
            "frameSize": frame_size or (-0.75, 0.75, -0.6, 0.6),
        }
        if parent is not None:
            frame_kwargs["parent"] = parent
        self.frame = DirectFrame(**frame_kwargs)
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
        if footer_text:
            self.footer = OnscreenText(
                text=footer_text,
                parent=self.frame,
                pos=(0, -0.55),
                scale=0.045,
                fg=(0.7, 0.75, 0.95, 1),
                align=TextNode.ACenter,
                mayChange=False,
            )
        else:
            self.footer = None

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

    def __init__(
        self,
        inventory: Inventory,
        equipment: EquipmentLoadout,
        *,
        parent: DirectFrame | None = None,
        frame_size: tuple[float, float, float, float] | None = None,
        footer_text: str | None = "I - Close",
    ) -> None:
        self.inventory = inventory
        self.equipment = equipment
        frame_kwargs: dict[str, object] = {
            "frameColor": (0.08, 0.07, 0.09, 0.92),
            "frameSize": frame_size or (-0.9, 0.9, -0.7, 0.7),
        }
        if parent is not None:
            frame_kwargs["parent"] = parent
        self.frame = DirectFrame(**frame_kwargs)
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
        self.detail_window = DirectFrame(
            parent=self.frame,
            frameColor=(0.12, 0.12, 0.16, 0.95),
            frameSize=(-0.35, 0.35, -0.25, 0.25),
            borderWidth=(0.01, 0.01),
            relief=1,
            sortOrder=100,
        )
        self.detail_title = OnscreenText(
            text="",
            parent=self.detail_window,
            pos=(-0.32, 0.18),
            scale=0.055,
            fg=(0.95, 0.95, 0.88, 1),
            align=TextNode.ALeft,
            mayChange=True,
            wordwrap=16,
        )
        self.detail_body = OnscreenText(
            text="",
            parent=self.detail_window,
            pos=(-0.32, 0.05),
            scale=0.045,
            fg=(0.85, 0.88, 1, 1),
            align=TextNode.ALeft,
            mayChange=True,
            wordwrap=18,
        )
        if footer_text:
            self.footer = OnscreenText(
                text=footer_text,
                parent=self.frame,
                pos=(0, -0.62),
                scale=0.045,
                fg=(0.7, 0.8, 1, 1),
                align=TextNode.ACenter,
                mayChange=False,
            )
        else:
            self.footer = None

        self.is_visible = True
        self._default_detail_message = "Hover over an item to inspect its details."
        self._empty_slot_color = (0.08, 0.08, 0.12, 0.95)
        self._default_slot_color = (0.16, 0.17, 0.22, 0.95)
        self._full_slot_color = (0.25, 0.18, 0.18, 0.95)
        self._hover_slot_color = (0.4, 0.4, 0.55, 1)
        self._selected_slot_color = (0.5, 0.4, 0.25, 1)
        self._equipment_empty_color = (0.12, 0.12, 0.18, 0.95)
        self._equipment_filled_color = (0.22, 0.24, 0.3, 0.95)
        self._equipment_hover_color = (0.35, 0.38, 0.55, 1)
        self._equipment_selected_color = (0.48, 0.36, 0.22, 1)

        self.slot_count = self.GRID_COLUMNS * self.GRID_ROWS
        self.slots: list[DirectButton] = []
        self.slot_contents: list[InventoryStack | None] = [None] * self.slot_count
        self._current_hover_index: int | None = None
        self._dragged_stack: InventoryStack | None = None
        self._drag_source_index: int | None = None
        self._drag_source_equipment_index: int | None = None
        self._current_equipment_hover: int | None = None

        self.equipment_buttons: list[DirectButton] = []
        self.equipment_slot_ids: list[str] = []
        self.equipment_slot_labels: list[str] = []
        self.equipment_slot_categories: list[tuple[str, ...]] = []
        self.equipment_slot_contents: list[ItemTemplate | None] = []

        drag_parent = getattr(ShowBaseGlobal, "aspect2d", None)
        self._drag_label = OnscreenText(
            text="",
            parent=drag_parent,
            pos=(0, 0),
            scale=0.055,
            fg=(0.96, 0.96, 0.88, 1),
            shadow=(0, 0, 0, 0.9),
            align=TextNode.ACenter,
            mayChange=True,
        )
        self._drag_label.hide()

        self._create_equipment_panel()
        self._create_slots()
        self.frame.bind(DGG.B3PRESS, self._on_cancel_drag_event)
        self.detail_window.hide()
        self._set_default_description()

    def _create_equipment_panel(self) -> None:
        self.equipment_panel = DirectFrame(
            parent=self.frame,
            pos=(0.68, 0, 0.03),
            frameColor=(0.1, 0.1, 0.14, 0.95),
            frameSize=(-0.28, 0.28, -0.55, 0.55),
            borderWidth=(0.012, 0.012),
            relief=1,
        )
        self.equipment_title = OnscreenText(
            text="Equipped Gear",
            parent=self.equipment_panel,
            pos=(0, 0.46),
            scale=0.06,
            fg=(0.92, 0.94, 1, 1),
            shadow=(0, 0, 0, 0.8),
            align=TextNode.ACenter,
            mayChange=False,
        )

        slot_height = 0.15
        spacing = 0.045
        start_z = 0.31

        self.equipment_buttons.clear()
        self.equipment_slot_ids.clear()
        self.equipment_slot_labels.clear()
        self.equipment_slot_categories.clear()
        self.equipment_slot_contents.clear()

        for index, slot_state in enumerate(self.equipment.iter_slots()):
            slot_id = slot_state.definition.id
            slot_label = slot_state.definition.name
            slot_categories = slot_state.definition.allowed_categories

            z = start_z - index * (slot_height + spacing)
            button = DirectButton(
                parent=self.equipment_panel,
                pos=(0, 0, z),
                frameColor=self._equipment_empty_color,
                frameSize=(
                    -0.24,
                    0.24,
                    -slot_height / 2,
                    slot_height / 2,
                ),
                text="",
                text_scale=0.045,
                text_align=TextNode.ACenter,
                text_fg=(0.92, 0.92, 1, 1),
                text_wordwrap=12,
                textMayChange=1,
                relief=1,
                pressEffect=False,
                rolloverSound=None,
                clickSound=None,
                command=self._on_equipment_clicked,
                extraArgs=[index],
            )
            button.bind(DGG.ENTER, self._on_equipment_hover, [index])
            button.bind(DGG.EXIT, self._on_equipment_exit, [index])

            self.equipment_buttons.append(button)
            self.equipment_slot_ids.append(slot_id)
            self.equipment_slot_labels.append(slot_label)
            self.equipment_slot_categories.append(slot_categories)
            self.equipment_slot_contents.append(slot_state.item)

        self._update_equipment_panel()

    def _create_slots(self) -> None:
        slot_width = 0.22
        slot_height = 0.22
        spacing = 0.03
        start_x = -0.78
        start_z = 0.32

        index = 0
        for _row in range(self.GRID_ROWS):
            for _col in range(self.GRID_COLUMNS):
                x = start_x + _col * (slot_width + spacing)
                z = start_z - _row * (slot_height + spacing)
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
                    command=self._on_slot_clicked,
                    extraArgs=[index],
                )
                button.bind(DGG.ENTER, self._on_slot_hover, [index])
                button.bind(DGG.EXIT, self._on_slot_exit, [index])
                self.slots.append(button)
                index += 1

    def _update_equipment_panel(self) -> None:
        for index, button in enumerate(self.equipment_buttons):
            slot_id = self.equipment_slot_ids[index]
            state = self.equipment.get_slot(slot_id)
            item = state.item if state is not None else None
            self.equipment_slot_contents[index] = item
            if item is None:
                button["text"] = f"{self.equipment_slot_labels[index]}\n-- Empty --"
            else:
                button["text"] = (
                    f"{self.equipment_slot_labels[index]}\n{item.name}"
                )
        self._refresh_all_equipment_visuals()

    def update(self) -> None:
        stacks = self.inventory.stacks
        for index, slot in enumerate(self.slots):
            stack = stacks[index] if index < len(stacks) else None
            self.slot_contents[index] = stack
            if stack is None:
                slot["text"] = ""
            else:
                slot["text"] = f"{stack.template.name}\n x{stack.quantity}"

        for index in range(len(self.slots)):
            self._apply_slot_visual(index)

        self._update_equipment_panel()

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

        if self._dragged_stack is None:
            self._refresh_hover_description()

        self._update_drag_visual()

    def show(self) -> None:
        self.frame.show()
        self.is_visible = True
        self._cancel_drag()
        self._clear_hover_state()
        self.update()

    def hide(self) -> None:
        self.frame.hide()
        self.is_visible = False
        self._cancel_drag()
        self._clear_hover_state()

    def destroy(self) -> None:
        self._cancel_drag()
        if getattr(self, "_drag_label", None) is not None:
            self._drag_label.destroy()
            self._drag_label = None
        for slot in getattr(self, "slots", []):
            slot.destroy()
        self.slots = []
        self.slot_contents = []

        for button in getattr(self, "equipment_buttons", []):
            button.destroy()
        self.equipment_buttons = []
        self.equipment_slot_ids = []
        self.equipment_slot_labels = []
        self.equipment_slot_categories = []
        self.equipment_slot_contents = []

        for widget in (
            "footer",
            "detail_body",
            "detail_title",
            "detail_window",
            "capacity_hint",
            "capacity_text",
            "equipment_title",
            "equipment_panel",
            "title",
            "frame",
        ):
            element = getattr(self, widget, None)
            if element is not None:
                element.destroy()
                setattr(self, widget, None)

    def _clear_hover_state(self) -> None:
        self._current_hover_index = None
        self._current_equipment_hover = None
        self._set_default_description()
        self.detail_window.hide()
        self._refresh_all_slot_visuals()

    def _on_slot_clicked(self, index: int) -> None:
        if index >= len(self.slot_contents):
            return

        if self._dragged_stack is None:
            stack = self.slot_contents[index]
            if stack is None:
                return
            self._start_drag(index, stack)
            return

        if self._drag_source_equipment_index is not None:
            self._handle_equipment_drop_onto_inventory(index)
            return

        if self._drag_source_index is None:
            self._cancel_drag()
            return

        if index == self._drag_source_index:
            self._cancel_drag()
            return

        moved = self.inventory.move_stack(self._drag_source_index, index)
        self._dragged_stack = None
        self._drag_source_index = None
        self._drag_source_equipment_index = None
        if self._drag_label is not None:
            self._drag_label.hide()
        if moved:
            self.update()
        else:
            self._refresh_all_slot_visuals()
            self._refresh_hover_description()

    def _on_slot_hover(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        self._current_equipment_hover = None
        self._current_hover_index = index
        self.slots[index]["frameColor"] = self._hover_slot_color
        self._refresh_all_equipment_visuals()
        self._refresh_hover_description()

    def _on_slot_exit(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        if self._current_hover_index == index:
            self._current_hover_index = None
            if self._dragged_stack is not None and self._has_active_drag_source():
                self._set_drag_description(self._dragged_stack)
            else:
                self._set_default_description()
                self.detail_window.hide()
        self._apply_slot_visual(index)

    def _on_equipment_hover(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.equipment_buttons):
            return
        self._current_hover_index = None
        self._current_equipment_hover = index
        self._refresh_all_slot_visuals()
        self._refresh_hover_description()

    def _on_equipment_exit(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.equipment_buttons):
            return
        if self._current_equipment_hover == index:
            self._current_equipment_hover = None
            if self._dragged_stack is not None and self._has_active_drag_source():
                self._set_drag_description(self._dragged_stack)
            else:
                self._set_default_description()
                self.detail_window.hide()
        self._apply_equipment_slot_visual(index)

    def _on_equipment_clicked(self, index: int) -> None:
        if index >= len(self.equipment_slot_ids):
            return

        slot_id = self.equipment_slot_ids[index]
        slot_state = self.equipment.get_slot(slot_id)
        if slot_state is None:
            return

        if self._dragged_stack is None:
            if slot_state.item is None:
                return
            self._start_equipment_drag(index, slot_state.item)
            return

        if self._drag_source_index is not None:
            self._handle_inventory_drop_onto_equipment(index)
            return

        if self._drag_source_equipment_index is not None:
            self._handle_equipment_drop_onto_equipment(index)
            return

        self._cancel_drag()

    def _refresh_hover_description(self) -> None:
        if self._dragged_stack is not None and self._has_active_drag_source():
            if (
                self._current_hover_index is None
                and self._current_equipment_hover is None
            ):
                self._set_drag_description(self._dragged_stack)
                return
        if self._current_equipment_hover is not None:
            button = self.equipment_buttons[self._current_equipment_hover]
            self._position_detail_window_near(
                button,
                prefer_left=True,
                offset_x=0.34,
            )
            self._apply_equipment_description(self._current_equipment_hover)
            return
        if self._current_hover_index is None:
            self._set_default_description()
            self.detail_window.hide()
            return
        if self._current_hover_index >= len(self.slot_contents):
            self._current_hover_index = None
            self._set_default_description()
            self.detail_window.hide()
            return
        slot = self.slots[self._current_hover_index]
        self._position_detail_window_near(slot)
        if (
            self._dragged_stack is not None
            and self._drag_source_index == self._current_hover_index
        ):
            self._set_drag_description(self._dragged_stack)
        else:
            self._apply_description(self._current_hover_index)

    def _apply_slot_visual(self, index: int) -> None:
        stack = self.slot_contents[index]
        slot = self.slots[index]
        if self._current_hover_index == index:
            slot["frameColor"] = self._hover_slot_color
            return
        if self._dragged_stack is not None and self._drag_source_index == index:
            slot["frameColor"] = self._selected_slot_color
            return
        if stack is None:
            slot["frameColor"] = self._empty_slot_color
        elif stack.template.stack_limit > 1 and stack.space_remaining() == 0:
            slot["frameColor"] = self._full_slot_color
        else:
            slot["frameColor"] = self._default_slot_color

    def _apply_equipment_slot_visual(self, index: int) -> None:
        button = self.equipment_buttons[index]
        item = self.equipment_slot_contents[index]
        if self._drag_source_equipment_index == index:
            button["frameColor"] = self._equipment_selected_color
        elif self._current_equipment_hover == index:
            button["frameColor"] = self._equipment_hover_color
        elif item is None:
            button["frameColor"] = self._equipment_empty_color
        else:
            button["frameColor"] = self._equipment_filled_color

    def _has_active_drag_source(self) -> bool:
        return (
            self._drag_source_index is not None
            or self._drag_source_equipment_index is not None
        )

    def _start_drag(self, index: int, stack: InventoryStack) -> None:
        self._dragged_stack = stack
        self._drag_source_index = index
        self._drag_source_equipment_index = None
        if self._drag_label is not None:
            self._drag_label.setText(f"{stack.template.name}\n x{stack.quantity}")
            self._drag_label.show()
        self._update_drag_visual()
        self._set_drag_description(stack)
        self._refresh_all_slot_visuals()

    def _cancel_drag(self) -> None:
        if self._dragged_stack is None:
            return
        if self._drag_source_equipment_index is not None:
            slot_id = self.equipment_slot_ids[self._drag_source_equipment_index]
            self.equipment.equip(slot_id, self._dragged_stack.template)
            self._update_equipment_panel()
        self._dragged_stack = None
        self._drag_source_index = None
        self._drag_source_equipment_index = None
        if self._drag_label is not None:
            self._drag_label.hide()
        self._refresh_all_slot_visuals()
        self._refresh_hover_description()

    def _reset_drag_state(self) -> None:
        if self._drag_label is not None:
            self._drag_label.hide()
        self._dragged_stack = None
        self._drag_source_index = None
        self._drag_source_equipment_index = None

    def _start_equipment_drag(self, index: int, item: ItemTemplate) -> None:
        slot_id = self.equipment_slot_ids[index]
        removed = self.equipment.unequip(slot_id)
        if removed is None:
            return
        self._dragged_stack = InventoryStack(template=removed, quantity=1)
        self._drag_source_index = None
        self._drag_source_equipment_index = index
        if self._drag_label is not None:
            self._drag_label.setText(f"{removed.name}\n x1")
            self._drag_label.show()
        self._update_equipment_panel()
        self._update_drag_visual()
        self._set_drag_description(self._dragged_stack)
        self._refresh_all_equipment_visuals()

    def _handle_inventory_drop_onto_equipment(self, index: int) -> None:
        if self._drag_source_index is None:
            self._cancel_drag()
            return
        if self._drag_source_index >= len(self.slot_contents):
            self._cancel_drag()
            return

        stack = self.slot_contents[self._drag_source_index]
        if stack is None:
            self._cancel_drag()
            return

        slot_id = self.equipment_slot_ids[index]
        slot_state = self.equipment.get_slot(slot_id)
        if slot_state is None:
            self._cancel_drag()
            return

        if not slot_state.definition.accepts(stack.template):
            self._cancel_drag()
            return

        previous_item = slot_state.item
        original_quantity = stack.quantity

        equipped = self.equipment.equip(slot_id, stack.template)
        if not equipped:
            self._cancel_drag()
            return

        if original_quantity <= 1:
            self.inventory.stacks[self._drag_source_index] = None
        else:
            stack.quantity -= 1

        placed_previous = True
        preferred_index = (
            self._drag_source_index if original_quantity <= 1 else None
        )
        if previous_item is not None:
            placed_previous = self._place_item_in_inventory(
                previous_item, preferred_index=preferred_index
            )

        if not placed_previous:
            if original_quantity <= 1:
                self.inventory.stacks[self._drag_source_index] = InventoryStack(
                    template=stack.template,
                    quantity=original_quantity,
                )
            else:
                stack.quantity = original_quantity
            if previous_item is not None:
                self.equipment.equip(slot_id, previous_item)
            else:
                self.equipment.unequip(slot_id)
            self._reset_drag_state()
            self.update()
            return

        self._reset_drag_state()
        self.update()

    def _handle_equipment_drop_onto_inventory(self, index: int) -> None:
        if self._dragged_stack is None:
            self._cancel_drag()
            return
        if self._drag_source_equipment_index is None:
            self._cancel_drag()
            return

        dragged_template = self._dragged_stack.template
        target_stack = self.inventory.stacks[index]

        if target_stack is None:
            self.inventory.stacks[index] = InventoryStack(
                template=dragged_template,
                quantity=self._dragged_stack.quantity,
            )
            self._reset_drag_state()
            self.update()
            return

        if (
            target_stack.template.id == dragged_template.id
            and target_stack.space_remaining() >= self._dragged_stack.quantity
        ):
            target_stack.quantity += self._dragged_stack.quantity
            self._reset_drag_state()
            self.update()
            return

        if target_stack.quantity != 1:
            self._cancel_drag()
            return

        source_slot_id = self.equipment_slot_ids[self._drag_source_equipment_index]
        source_state = self.equipment.get_slot(source_slot_id)
        if source_state is None:
            self._cancel_drag()
            return
        if not source_state.definition.accepts(target_stack.template):
            self._cancel_drag()
            return

        equipped = self.equipment.equip(source_slot_id, target_stack.template)
        if not equipped:
            self._cancel_drag()
            return

        self.inventory.stacks[index] = InventoryStack(
            template=dragged_template,
            quantity=self._dragged_stack.quantity,
        )
        self._reset_drag_state()
        self.update()

    def _handle_equipment_drop_onto_equipment(self, index: int) -> None:
        if self._dragged_stack is None:
            self._cancel_drag()
            return
        if self._drag_source_equipment_index is None:
            self._cancel_drag()
            return

        if index == self._drag_source_equipment_index:
            self._cancel_drag()
            return

        source_slot_id = self.equipment_slot_ids[self._drag_source_equipment_index]
        target_slot_id = self.equipment_slot_ids[index]
        source_state = self.equipment.get_slot(source_slot_id)
        target_state = self.equipment.get_slot(target_slot_id)
        if source_state is None or target_state is None:
            self._cancel_drag()
            return

        dragged_template = self._dragged_stack.template
        if not target_state.definition.accepts(dragged_template):
            self._cancel_drag()
            return

        existing_item = target_state.item
        if existing_item is not None and not source_state.definition.accepts(
            existing_item
        ):
            self._cancel_drag()
            return

        equipped = self.equipment.equip(target_slot_id, dragged_template)
        if not equipped:
            self._cancel_drag()
            return

        if existing_item is not None:
            self.equipment.equip(source_slot_id, existing_item)

        self._reset_drag_state()
        self.update()

    def _place_item_in_inventory(
        self, template: ItemTemplate, *, preferred_index: int | None = None
    ) -> bool:
        if (
            preferred_index is not None
            and 0 <= preferred_index < len(self.inventory.stacks)
            and self.inventory.stacks[preferred_index] is None
        ):
            self.inventory.stacks[preferred_index] = InventoryStack(
                template=template,
                quantity=1,
            )
            return True

        remainder = self.inventory.add_item(template, 1)
        return remainder == 0

    def _set_drag_description(self, stack: InventoryStack) -> None:
        lines = [
            f"Quantity: {stack.quantity}",
            "",
            "Click another slot to move this stack.",
            "Right click to cancel.",
        ]
        self.detail_title.setText(f"Moving: {stack.template.name}")
        self.detail_body.setText("\n".join(lines))
        self.detail_window.show()

    def _refresh_all_slot_visuals(self) -> None:
        for idx in range(len(self.slots)):
            self._apply_slot_visual(idx)
        self._refresh_all_equipment_visuals()

    def _refresh_all_equipment_visuals(self) -> None:
        for idx in range(len(self.equipment_buttons)):
            self._apply_equipment_slot_visual(idx)

    def _set_default_description(self) -> None:
        self.detail_title.setText("Item Details")
        self.detail_body.setText(self._default_detail_message)
        self.detail_window.hide()

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
        self.detail_window.show()

    def _apply_equipment_description(self, index: int) -> None:
        slot_label = self.equipment_slot_labels[index]
        item = self.equipment_slot_contents[index]
        if item is None:
            lines = ["Slot is currently empty."]
            categories = self.equipment_slot_categories[index]
            if categories:
                lines.append("")
                lines.append("Accepts:")
                for category in categories:
                    lines.append(f"- {category}")
            else:
                lines.append("Accepts any equipped item.")
            self.detail_title.setText(slot_label)
        else:
            lines = [f"Category: {item.category}"]
            if item.description:
                lines.append("")
                lines.append(item.description)
            self.detail_title.setText(f"{slot_label}: {item.name}")
        self.detail_body.setText("\n".join(lines))
        self.detail_window.show()

    def _set_empty_description(self) -> None:
        if self.inventory.is_full():
            message = (
                "Inventory is at capacity. Clear space to pick up new gear."
            )
        else:
            message = "Ready to store newly acquired gear."
        self.detail_title.setText("Empty Slot")
        self.detail_body.setText(message)
        self.detail_window.show()

    def _position_detail_window_near(
        self,
        node: DirectButton,
        *,
        prefer_left: bool = False,
        offset_x: float = 0.38,
        offset_z: float = 0.0,
    ) -> None:
        node_pos = node.getPos(self.frame)
        direction = -1 if prefer_left else 1
        x = node_pos.x + direction * offset_x
        z = node_pos.z + offset_z

        if not prefer_left and x > 0.55:
            x = node_pos.x - offset_x
        if prefer_left and x < -0.55:
            x = node_pos.x + offset_x

        z = max(-0.35, min(0.45, z))

        self.detail_window.setPos(x, 0, z)

    def _update_drag_visual(self) -> None:
        if self._dragged_stack is None or self._drag_label is None:
            if self._drag_label is not None:
                self._drag_label.hide()
            return

        base = ShowBaseGlobal.base
        if base is None or base.mouseWatcherNode is None:
            self._drag_label.hide()
            return
        if not base.mouseWatcherNode.hasMouse():
            self._drag_label.hide()
            return

        mouse_x = base.mouseWatcherNode.getMouseX()
        mouse_y = base.mouseWatcherNode.getMouseY()
        self._drag_label.setPos(mouse_x, mouse_y)
        self._drag_label.show()

    def _on_cancel_drag_event(self, _event: object | None = None) -> None:
        self._cancel_drag()


class TabbedMenu:
    """Container that combines stats and inventory views under tab controls."""

    TAB_STATS = "stats"
    TAB_INVENTORY = "inventory"

    def __init__(
        self, stats: PlayerStats, inventory: Inventory, equipment: EquipmentLoadout
    ) -> None:
        self.stats = stats
        self.inventory = inventory
        self.equipment = equipment
        self.active_tab = None

        self.frame = DirectFrame(
            frameColor=(0.03, 0.04, 0.08, 0.95),
            frameSize=(-1.05, 1.05, -0.8, 0.8),
        )
        self.title = OnscreenText(
            text="Operative Interface",
            parent=self.frame,
            pos=(0, 0.63),
            scale=0.08,
            fg=(0.95, 0.95, 0.88, 1),
            shadow=(0, 0, 0, 0.85),
            align=TextNode.ACenter,
            mayChange=False,
        )

        self.content_frame = DirectFrame(
            parent=self.frame,
            frameColor=(0, 0, 0, 0),
            pos=(0, 0, -0.05),
        )

        self.stats_menu = StatsMenu(
            stats,
            parent=self.content_frame,
            footer_text=None,
        )
        self.inventory_menu = InventoryMenu(
            inventory,
            equipment,
            parent=self.content_frame,
            footer_text=None,
        )

        # Slightly reposition panels to accommodate the shared title bar.
        self.stats_menu.frame.setZ(-0.05)
        self.inventory_menu.frame.setZ(-0.02)

        self.tab_buttons: dict[str, DirectButton] = {}
        self._build_tabs()

        self.footer = OnscreenText(
            text="TAB - Toggle Menu   I - Jump to Inventory Tab",
            parent=self.frame,
            pos=(0, -0.72),
            scale=0.045,
            fg=(0.75, 0.82, 1, 1),
            align=TextNode.ACenter,
            mayChange=False,
        )

        self.active_tab: str = self.TAB_STATS
        self.is_visible = True
        self.select_tab(self.TAB_STATS)

    def _build_tabs(self) -> None:
        button_cfg = dict(
            parent=self.frame,
            scale=0.06,
            text_fg=(0.92, 0.94, 1, 1),
            text_shadow=(0, 0, 0, 0.8),
            pad=(0.6, 0.35),
            relief=1,
            pressEffect=False,
            rolloverSound=None,
            clickSound=None,
        )

        self.tab_buttons[self.TAB_STATS] = DirectButton(
            text="Operative Stats",
            pos=(-0.45, 0, 0.5),
            command=self._on_tab_selected,
            extraArgs=[self.TAB_STATS],
            **button_cfg,
        )
        self.tab_buttons[self.TAB_INVENTORY] = DirectButton(
            text="Field Inventory",
            pos=(0.45, 0, 0.5),
            command=self._on_tab_selected,
            extraArgs=[self.TAB_INVENTORY],
            **button_cfg,
        )

        self._refresh_tab_visuals()

    def _on_tab_selected(self, tab: str) -> None:
        self.select_tab(tab)

    def _refresh_tab_visuals(self) -> None:
        for name, button in self.tab_buttons.items():
            if name == self.active_tab:
                button["frameColor"] = (0.25, 0.32, 0.55, 1)
            else:
                button["frameColor"] = (0.12, 0.14, 0.2, 1)

    def select_tab(self, tab: str) -> None:
        if tab not in (self.TAB_STATS, self.TAB_INVENTORY):
            return
        self.active_tab = tab
        if self.is_visible:
            if tab == self.TAB_STATS:
                self.inventory_menu.hide()
                self.stats_menu.show()
                self.stats_menu.update()
            else:
                self.stats_menu.hide()
                self.inventory_menu.show()
                self.inventory_menu.update()
        self._refresh_tab_visuals()

    def show(self) -> None:
        self.frame.show()
        self.is_visible = True
        self.select_tab(self.active_tab)

    def hide(self) -> None:
        self.frame.hide()
        self.is_visible = False
        self.stats_menu.hide()
        self.inventory_menu.hide()

    def update(self) -> None:
        if not self.is_visible:
            return
        if self.active_tab == self.TAB_STATS:
            self.stats_menu.update()
        else:
            self.inventory_menu.update()

    def destroy(self) -> None:
        for button in self.tab_buttons.values():
            button.destroy()
        self.tab_buttons.clear()

        self.stats_menu.destroy()
        self.inventory_menu.destroy()

        for widget in ("footer", "content_frame", "title", "frame"):
            element = getattr(self, widget, None)
            if element is not None:
                element.destroy()
                setattr(self, widget, None)


__all__ = ["InventoryMenu", "MainMenu", "StatsMenu", "TabbedMenu"]
