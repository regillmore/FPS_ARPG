import { mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';
import { FirstPersonController } from './fpsController.js';
import { initWebGPU } from './webgpu/initWebGPU.js';
import { createBasicPipeline } from './webgpu/pipeline.js';
import { createRoomGeometry } from './world/roomGeometry.js';
import { setupPauseMenu } from './ui/pauseMenu.js';

async function main() {
  const canvas = document.getElementById('gfx');
  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  const itemPopover = document.getElementById('item-detail-popover');

  if (!canvas) {
    throw new Error('Failed to find the rendering canvas.');
  }

  const pauseControls = setupPauseMenu({ canvas, overlay, pauseMenu, itemPopover });

  try {
    const { device, context, format, resize } = await initWebGPU(canvas);
    const pipeline = createBasicPipeline(device, format);
    const { vertexBuffer, vertexCount, bounds } = createRoomGeometry(device);

    const uniformBuffer = device.createBuffer({
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    const uniformBindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer
          }
        }
      ]
    });

    const projection = new Float32Array(16);
    const view = new Float32Array(16);
    const viewProj = new Float32Array(16);

    const controller = new FirstPersonController(canvas);
    pauseControls.setController(controller);

    let lastTime = performance.now();

    function frame(now) {
      const deltaTime = Math.min((now - lastTime) / 1000, 0.2);
      lastTime = now;

      if (!pauseControls.isPaused()) {
        controller.update(deltaTime);
      }

      const padding = 0.25;
      controller.position[0] = Math.min(
        Math.max(controller.position[0], bounds.minX + padding),
        bounds.maxX - padding
      );
      controller.position[1] = Math.min(
        Math.max(controller.position[1], bounds.minY + padding),
        bounds.maxY - padding
      );
      controller.position[2] = Math.min(
        Math.max(controller.position[2], bounds.minZ + padding),
        bounds.maxZ - padding
      );

      resize();

      const aspect = canvas.width / canvas.height;
      mat4Perspective(projection, Math.PI / 3, aspect, 0.1, 100.0);
      const eye = controller.position;
      const center = controller.getViewTarget();
      mat4LookAt(view, eye, center, [0, 1, 0]);
      mat4Multiply(viewProj, projection, view);

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        viewProj.buffer,
        viewProj.byteOffset,
        viewProj.byteLength
      );

      const encoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();

      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: textureView,
            clearValue: { r: 0.05, g: 0.06, b: 0.08, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      });

      pass.setPipeline(pipeline);
      pass.setBindGroup(0, uniformBindGroup);
      pass.setVertexBuffer(0, vertexBuffer);
      pass.draw(vertexCount, 1, 0, 0);
      pass.end();

      device.queue.submit([encoder.finish()]);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);

    if (overlay) {
      overlay.innerHTML = `
        <div><strong>WebGPU FPS Prototype</strong></div>
        <div>Click to capture the mouse, then use WASD to move, Space/Shift for vertical movement. Press Esc to open the pause menu.</div>
      `;
    }
  } catch (error) {
    console.error(error);
    if (overlay) {
      overlay.textContent = error.message;
      overlay.style.display = '';
    }
  }
}

main();
