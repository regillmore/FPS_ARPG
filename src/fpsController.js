const KEY_BINDINGS = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'up',
  ShiftLeft: 'down',
  ShiftRight: 'down'
};

export class FirstPersonController {
  #onMouseMove;
  constructor(canvas) {
    this.canvas = canvas;
    this.position = new Float32Array([0, 1.6, 0]);
    this.yaw = 0;
    this.pitch = 0;
    this.moveSpeed = 4.5;
    this.verticalSpeed = 3.0;
    this.mouseSensitivity = 0.0025;
    this.movement = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false
    };
    this.#bindEvents();
  }

  #bindEvents() {
    this.canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== this.canvas) {
        this.canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas) {
        document.addEventListener('mousemove', this.#onMouseMove);
      } else {
        document.removeEventListener('mousemove', this.#onMouseMove);
      }
    });

    this.#onMouseMove = this.#handleMouseMove.bind(this);
    window.addEventListener('keydown', (event) => this.#handleKey(event, true));
    window.addEventListener('keyup', (event) => this.#handleKey(event, false));
    window.addEventListener('blur', () => this.#resetMovement());
  }

  #handleMouseMove(event) {
    this.yaw -= event.movementX * this.mouseSensitivity;
    this.pitch -= event.movementY * this.mouseSensitivity;
    const limit = Math.PI / 2 - 0.01;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  #handleKey(event, pressed) {
    if (event.code in KEY_BINDINGS) {
      const action = KEY_BINDINGS[event.code];
      this.movement[action] = pressed;
      event.preventDefault();
    }
  }

  #resetMovement() {
    for (const key of Object.keys(this.movement)) {
      this.movement[key] = false;
    }
  }

  update(deltaTime) {
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const forward = [sinYaw, 0, cosYaw];
    const right = [cosYaw, 0, -sinYaw];

    let vx = 0;
    let vy = 0;
    let vz = 0;

    if (this.movement.forward) {
      vx += forward[0];
      vz += forward[2];
    }
    if (this.movement.backward) {
      vx -= forward[0];
      vz -= forward[2];
    }
    if (this.movement.left) {
      vx += right[0];
      vz += right[2];
    }
    if (this.movement.right) {
      vx -= right[0];
      vz -= right[2];
    }
    if (this.movement.up) {
      vy += 1;
    }
    if (this.movement.down) {
      vy -= 1;
    }

    const horizontalLength = Math.hypot(vx, vz);
    if (horizontalLength > 0) {
      vx /= horizontalLength;
      vz /= horizontalLength;
    }

    if (vy !== 0) {
      vy = Math.sign(vy);
    }

    this.position[0] += vx * this.moveSpeed * deltaTime;
    this.position[1] += vy * this.verticalSpeed * deltaTime;
    this.position[2] += vz * this.moveSpeed * deltaTime;
  }

  getViewTarget() {
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);

    const dx = sinYaw * cosPitch;
    const dy = sinPitch;
    const dz = cosYaw * cosPitch;

    return [
      this.position[0] + dx,
      this.position[1] + dy,
      this.position[2] + dz
    ];
  }
}
