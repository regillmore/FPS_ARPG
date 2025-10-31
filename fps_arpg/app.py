"""Application bootstrap and lifecycle management."""

from __future__ import annotations

from direct.gui.DirectGui import OnscreenText
from direct.showbase.ShowBase import ShowBase
from panda3d.core import TextNode

from .ui import MainMenu
from .world import GameWorld


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


__all__ = ["GameApp"]
