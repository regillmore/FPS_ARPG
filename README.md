# WebGPU FPS Prototype

This project is a starting point for a first-person single-player game built with vanilla WebGPU. It renders a simple box-shaped room and provides a mouse-look camera with WASD controls so you can explore the space.

## Running locally

A secure context (HTTPS or `http://localhost`) is required for WebGPU. Serve the project with any static file server; for example, using Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/` in a browser with WebGPU enabled (currently recent versions of Chromium-based browsers).

Click the canvas to lock the pointer, look around with the mouse, and move with **WASD**. Use **Space** and **Shift** for vertical movement.
