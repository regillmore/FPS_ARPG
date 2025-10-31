"""Entry point for the prototype FPS ARPG application."""

from fps_arpg import GameApp


def main() -> None:
    """Start the Panda3D application."""

    GameApp().run()


if __name__ == "__main__":
    main()
