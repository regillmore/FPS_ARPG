# FPS ARPG Prototype

A single-player first-person shooter action RPG prototype built with [Panda3D](https://www.panda3d.org/).
The project provides a sandbox for experimenting with core gameplay systems such as combat,
loot, and character progression while taking advantage of Panda3D's real-time rendering
and input handling.

## Features

- **Prototype gameplay loop** with a main menu and placeholder game world managed by `GameApp`.
- **World simulation** including actors, world items, and level maps defined under `fps_arpg/world.py` and the `maps/` package.
- **Combat systems** covering ranged weapons, projectiles, and enemy behavior located in `fps_arpg/weapons.py`, `fps_arpg/projectiles.py`, and `fps_arpg/enemies.py`.
- **RPG mechanics** for player statistics, equipment, inventory, and stash management implemented across the `stats.py`, `equipment.py`, `inventory.py`, and `stash.py` modules.
- **User interface scaffolding** via `fps_arpg/ui.py` with menus and status overlays using Panda3D's DirectGUI toolkit.

## Getting Started

### Prerequisites

- Python 3.11+
- Panda3D (install with `pip install panda3d`)

It is recommended to work inside a virtual environment (for example, `python -m venv .venv` followed by `source .venv/bin/activate`).

### Installation

1. Clone the repository.
2. Install Python dependencies:

   ```bash
   pip install -r requirements.txt
   ```

   If a `requirements.txt` file is not provided, install Panda3D manually using the command in the prerequisites section.

## Running the Game

Launch the prototype by executing the entry point script:

```bash
python -m main
```

This will open the Panda3D window, display the main menu, and allow you to jump into the placeholder game world.

## Project Structure

```
FPS_ARPG/
├── main.py           # Entry point that bootstraps GameApp
├── fps_arpg/
│   ├── app.py        # Panda3D ShowBase subclass managing lifecycle
│   ├── ui.py         # User interface menus and overlays
│   ├── world.py      # Game world management
│   ├── enemies.py    # Enemy behaviors and data
│   ├── weapons.py    # Weapon definitions and firing logic
│   ├── projectiles.py# Projectile handling and collision
│   ├── inventory.py  # Player inventory system
│   ├── equipment.py  # Gear and loadout management
│   ├── stats.py      # Character statistics and leveling
│   ├── stash.py      # Shared stash implementation
│   └── ...
└── README.md
```

## Contributing

Contributions, bug reports, and feature requests are welcome. Please open an issue to discuss your ideas or submit a pull request with your improvements.

## License

This project is distributed under the terms specified in the repository's license file.
