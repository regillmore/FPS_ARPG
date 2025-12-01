# Procedural WebGPU FPS Prototype

A first-person shooter prototype built with vanilla WebGPU and procedural level generation. Explore stacked rooms, fight wandering enemies, loot storage chests, and manage your loadout through an in-game pause menu—all without external frameworks.

## Play online

The latest build is deployed to GitHub Pages: https://regillmore.github.io/FPS_ARPG/

## Core features

- **Vanilla WebGPU renderer** with forward lighting, depth buffering, and simple material controls defined in `index.html` and `src/webgpu`. It runs entirely in the browser—no bundler required.
- **Procedural level system** that streams modular rooms around the player, including doors, spatial partitioning, and decorative props for variation. Enemy and fighter spawns are tied into the same room graph to keep encounters near the player.
- **Combat sandbox** featuring a first-person controller, hitscan projectiles with bullet hole decals, and basic enemy AI that awards experience on defeat.
- **Loot and inventory**: storage chests and ground pickups feed into an inventory grid, allowing weapon and gear slots, rarity tags, and a simple stat system.
- **In-game HUD and pause menu**: a tabbed pause screen with stats, loadout, bestiary, options, and achievements; a diegetic HUD displays crosshair, floating damage numbers, pickup prompts, and framerate.

## Controls

- Click the canvas to lock the pointer.
- **WASD** to move, **Space** to rise, **Shift** to descend, and move the mouse to look around.
- **Esc** opens the pause menu; click outside the menu to resume.
- Interact with pickups and chests when prompts appear.

## Running locally

WebGPU requires a secure context (HTTPS or `http://localhost`). Serve the files with any static web server, e.g.:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in a recent Chromium-based browser with WebGPU enabled. The game initializes from `src/main.js` and dynamically constructs the world at runtime.

## Project structure

- `index.html` – page shell, HUD layers, and pause menu markup.
- `styles/` – HUD, pause menu, and general UI styling.
- `src/main.js` – bootstraps WebGPU, controllers, HUD, experience, inventory, and the pause menu.
- `src/webgpu/` – WebGPU initialization, pipeline creation, and shaders.
- `src/world/procedural/` – procedural room system, geometry, decorations, storage chests, and wall generation helpers.
- `src/game/` – gameplay systems: enemies, projectiles, pickups, doors, collisions, player weapons, HUD overlays, and experience tracking.
