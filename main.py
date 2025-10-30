"""Entry point for the prototype FPS ARPG application."""

from direct.gui.DirectGui import DirectButton, DirectFrame, OnscreenText
from direct.showbase.ShowBase import ShowBase
from panda3d.core import TextNode


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

        self.show_main_menu()

    # Menu management -------------------------------------------------
    def show_main_menu(self) -> None:
        """Display the main menu and remove any placeholder overlays."""

        self._clear_status_text()
        if self.menu is None:
            self.menu = MainMenu(self)

    def hide_main_menu(self) -> None:
        if self.menu is not None:
            self.menu.destroy()
            self.menu = None

    def start_game(self) -> None:
        """Placeholder start handler used for early prototyping."""

        self.hide_main_menu()
        self._set_status_text(
            "Loading prototype level...",
            fg=(0.9, 0.9, 0.9, 1),
        )

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


if __name__ == "__main__":
    GameApp().run()
