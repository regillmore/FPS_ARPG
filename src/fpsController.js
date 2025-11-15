const KEY_BINDINGS = {
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'jump',
  KeyE: 'use'
};

export class FirstPersonController {
  #onMouseMove;
  constructor(canvas) {
    this.canvas = canvas;
    this.position = new Float32Array([0, 2.0, 0]);
    this.yaw = 0;
    this.pitch = 0;
    this.moveSpeed = 4.5;
    this.gravity = -9.81;
    this.jumpSpeed = 5.5;
    this.verticalVelocity = 0;
    this.isGrounded = false;
    this.jumpQueued = false;
    this.jumpButtonDown = false;
    this.mouseSensitivity = 0.0025;
    this.movement = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };
    this.triggers = {
      primary: false,
      use: false
    };
    this.triggerPresses = {
      use: false
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
        this.#resetTriggers();
      }
    });

    this.#onMouseMove = this.#handleMouseMove.bind(this);
    window.addEventListener('keydown', (event) => this.#handleKey(event, true));
    window.addEventListener('keyup', (event) => this.#handleKey(event, false));
    window.addEventListener('mousedown', (event) => this.#handleMouseButton(event, true));
    window.addEventListener('mouseup', (event) => this.#handleMouseButton(event, false));
    window.addEventListener('blur', () => {
      this.#resetMovement();
      this.#resetTriggers();
    });
  }

  #handleMouseMove(event) {
    this.yaw -= event.movementX * this.mouseSensitivity;
    this.pitch -= event.movementY * this.mouseSensitivity;
    const limit = Math.PI / 2 - 0.01;
    if (this.pitch > limit) this.pitch = limit;
    if (this.pitch < -limit) this.pitch = -limit;
  }

  #handleMouseButton(event, pressed) {
    if (event.button !== 0) {
      return;
    }

    if (pressed && document.pointerLockElement !== this.canvas) {
      return;
    }

    this.triggers.primary = pressed;
    event.preventDefault();
  }

  #handleKey(event, pressed) {
    if (event.code in KEY_BINDINGS) {
      const action = KEY_BINDINGS[event.code];
      if (action === 'use') {
        if (pressed && document.pointerLockElement !== this.canvas) {
          return;
        }
        if (pressed) {
          this.triggerPresses.use = true;
        }
        this.triggers.use = pressed;
        event.preventDefault();
        return;
      }
      if (action === 'jump') {
        if (pressed && document.pointerLockElement !== this.canvas) {
          return;
        }
        if (pressed) {
          if (!this.jumpButtonDown) {
            this.jumpQueued = true;
          }
          this.jumpButtonDown = true;
        } else {
          this.jumpQueued = false;
          this.jumpButtonDown = false;
        }
        event.preventDefault();
        return;
      }
      this.movement[action] = pressed;
      event.preventDefault();
    }
  }

  #resetMovement() {
    for (const key of Object.keys(this.movement)) {
      this.movement[key] = false;
    }
    this.jumpQueued = false;
    this.jumpButtonDown = false;
  }

  #resetTriggers() {
    this.triggers.primary = false;
    this.triggers.use = false;
    this.triggerPresses.use = false;
  }

  resetMovement() {
    this.#resetMovement();
  }

  resetTriggers() {
    this.#resetTriggers();
  }

  update(deltaTime) {
    const cosYaw = Math.cos(this.yaw);
    const sinYaw = Math.sin(this.yaw);
    const forward = [sinYaw, 0, cosYaw];
    const right = [cosYaw, 0, -sinYaw];

    let vx = 0;
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
    const horizontalLength = Math.hypot(vx, vz);
    if (horizontalLength > 0) {
      vx /= horizontalLength;
      vz /= horizontalLength;
    }

    this.position[0] += vx * this.moveSpeed * deltaTime;
    this.position[2] += vz * this.moveSpeed * deltaTime;

    if (this.jumpQueued && this.isGrounded) {
      this.verticalVelocity = this.jumpSpeed;
      this.isGrounded = false;
      this.jumpQueued = false;
    }

    if (this.isGrounded) {
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = 0;
      }
    } else {
      this.verticalVelocity += this.gravity * deltaTime;
    }

    this.position[1] += this.verticalVelocity * deltaTime;
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

  isPrimaryFireActive() {
    return this.triggers.primary;
  }

  isUseActive() {
    return this.triggers.use;
  }

  consumeUsePress() {
    const wasPressed = this.triggerPresses.use;
    this.triggerPresses.use = false;
    return wasPressed;
  }

  applyCollisionResult(result) {
    if (!result) {
      return;
    }
    if (result.grounded) {
      if (this.verticalVelocity < 0) {
        this.verticalVelocity = 0;
      }
      this.isGrounded = true;
      return;
    }

    this.isGrounded = false;
    if (result.hitCeiling && this.verticalVelocity > 0) {
      this.verticalVelocity = 0;
    }
  }
}
