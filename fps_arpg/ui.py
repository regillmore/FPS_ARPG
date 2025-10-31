"""User interface widgets built with Panda3D DirectGUI."""

from __future__ import annotations

from typing import TYPE_CHECKING

from direct.gui import DirectGuiGlobals as DGG
from direct.gui.DirectGui import DirectButton, DirectFrame, OnscreenText
from panda3d.core import TextNode

from .inventory import Inventory, InventoryStack
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
        self.detail_window.hide()
        self._set_default_description()

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
            "detail_window",
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
        self.detail_window.hide()

    def _on_slot_hover(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        self._current_hover_index = index
        self.slots[index]["frameColor"] = self._hover_slot_color
        self._position_detail_window(index)
        self._apply_description(index)

    def _on_slot_exit(self, index: int, _event: object | None = None) -> None:
        if index >= len(self.slots):
            return
        if self._current_hover_index == index:
            self._current_hover_index = None
            self._set_default_description()
            self.detail_window.hide()
        self._apply_slot_visual(index)

    def _refresh_hover_description(self) -> None:
        if self._current_hover_index is None:
            self._set_default_description()
            self.detail_window.hide()
            return
        if self._current_hover_index >= len(self.slot_contents):
            self._current_hover_index = None
            self._set_default_description()
            self.detail_window.hide()
            return
        self._position_detail_window(self._current_hover_index)
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

    def _position_detail_window(self, index: int) -> None:
        slot = self.slots[index]
        slot_pos = slot.getPos(self.frame)
        offset_x = 0.38
        offset_z = 0.0

        x = slot_pos.x + offset_x
        z = slot_pos.z + offset_z

        # If the tooltip would overflow the right edge, flip it to the left side
        if x > 0.55:
            x = slot_pos.x - offset_x

        # Clamp vertically to keep the tooltip within the menu bounds
        z = max(-0.35, min(0.45, z))

        self.detail_window.setPos(x, 0, z)


__all__ = ["InventoryMenu", "MainMenu", "StatsMenu"]
