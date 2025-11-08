import { mat4LookAt, mat4Multiply, mat4Perspective } from './math.js';
import { FirstPersonController } from './fpsController.js';

async function initWebGPU(canvas) {
  if (!('gpu' in navigator)) {
    throw new Error('WebGPU is not supported in this browser.');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to acquire GPU adapter.');
  }

  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();

  let configured = false;

  function resize() {
    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));
    if (!configured || canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      context.configure({
        device,
        format,
        alphaMode: 'opaque',
        width,
        height
      });
      configured = true;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return { device, context, format, resize };
}

function createRoomGeometry(device) {
  const minX = -5;
  const maxX = 5;
  const minY = 0;
  const maxY = 4;
  const minZ = -5;
  const maxZ = 5;

  const faces = [
    // Floor
    {
      color: [0.45, 0.45, 0.5],
      corners: [
        [minX, minY, minZ],
        [maxX, minY, minZ],
        [maxX, minY, maxZ],
        [minX, minY, maxZ]
      ]
    },
    // Ceiling
    {
      color: [0.35, 0.35, 0.4],
      corners: [
        [minX, maxY, maxZ],
        [maxX, maxY, maxZ],
        [maxX, maxY, minZ],
        [minX, maxY, minZ]
      ]
    },
    // Back wall (-Z)
    {
      color: [0.4, 0.4, 0.55],
      corners: [
        [maxX, minY, minZ],
        [minX, minY, minZ],
        [minX, maxY, minZ],
        [maxX, maxY, minZ]
      ]
    },
    // Front wall (+Z)
    {
      color: [0.4, 0.45, 0.6],
      corners: [
        [minX, minY, maxZ],
        [maxX, minY, maxZ],
        [maxX, maxY, maxZ],
        [minX, maxY, maxZ]
      ]
    },
    // Left wall (-X)
    {
      color: [0.5, 0.45, 0.4],
      corners: [
        [minX, minY, minZ],
        [minX, minY, maxZ],
        [minX, maxY, maxZ],
        [minX, maxY, minZ]
      ]
    },
    // Right wall (+X)
    {
      color: [0.45, 0.5, 0.4],
      corners: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ]
      ]
    }
  ];

  const vertexStride = 6;
  const vertices = new Float32Array(faces.length * 6 * vertexStride);
  let offset = 0;

  const pushVertex = (corner, color) => {
    vertices[offset++] = corner[0];
    vertices[offset++] = corner[1];
    vertices[offset++] = corner[2];
    vertices[offset++] = color[0];
    vertices[offset++] = color[1];
    vertices[offset++] = color[2];
  };

  for (const face of faces) {
    const [a, b, c, d] = face.corners;
    pushVertex(a, face.color);
    pushVertex(b, face.color);
    pushVertex(c, face.color);
    pushVertex(a, face.color);
    pushVertex(c, face.color);
    pushVertex(d, face.color);
  }

  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
  vertexBuffer.unmap();

  return {
    vertexBuffer,
    vertexCount: vertices.length / vertexStride,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ }
  };
}

function createPipeline(device, format) {
  const shaderModule = device.createShaderModule({
    code: `
struct Uniforms {
  viewProj : mat4x4<f32>,
};

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec3<f32>,
};

@vertex
fn vs_main(@location(0) position : vec3<f32>, @location(1) color : vec3<f32>) -> VertexOutput {
  var output : VertexOutput;
  output.position = uniforms.viewProj * vec4<f32>(position, 1.0);
  output.color = color;
  return output;
}

@fragment
fn fs_main(@location(0) color : vec3<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(color, 1.0);
}
    `
  });

  const pipeline = device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 24,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' }
          ]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format }]
    },
    primitive: {
      topology: 'triangle-list',
      cullMode: 'front'
    },
    depthStencil: undefined
  });

  return pipeline;
}

async function main() {
  const canvas = document.getElementById('gfx');
  const overlay = document.getElementById('overlay');
  const pauseMenu = document.getElementById('pause-menu');
  const tabButtons = Array.from(pauseMenu.querySelectorAll('[role="tab"]'));
  const tabPanels = Array.from(pauseMenu.querySelectorAll('[role="tabpanel"]'));
  const tablist = pauseMenu.querySelector('[role="tablist"]');
  const itemSlots = Array.from(pauseMenu.querySelectorAll('.item-slot'));
  const itemDetail = pauseMenu.querySelector('#item-detail');
  let activeTab = 'stats';
  let paused = false;
  let controller;
  let clearItemDetail;

  function setActiveTab(tabId, { focus = false } = {}) {
    activeTab = tabId;
    if (clearItemDetail && tabId !== 'inventory') {
      clearItemDetail();
    }
    for (const button of tabButtons) {
      const isActive = button.dataset.tab === tabId;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive && focus) {
        button.focus({ preventScroll: true });
      }
    }
    for (const panel of tabPanels) {
      const isActive = panel.dataset.tab === tabId;
      panel.toggleAttribute('hidden', !isActive);
    }
  }

  setActiveTab(activeTab);

  if (itemDetail) {
    const detailContent = itemDetail.querySelector('.item-detail__content');
    const detailPlaceholder = itemDetail.querySelector('.item-detail__placeholder');
    const detailTag = itemDetail.querySelector('.item-detail__tag');
    const detailName = itemDetail.querySelector('.item-detail__name');
    const detailDescription = itemDetail.querySelector('.item-detail__description');

    const showItemDetail = (slot) => {
      if (!detailContent || !detailPlaceholder || !detailTag || !detailName || !detailDescription) {
        return;
      }

      const tagText = slot.querySelector('.item-slot__tag')?.textContent?.trim();
      const itemName = slot.querySelector('strong')?.textContent?.trim();
      const isEmpty = slot.dataset.slot === 'empty';
      const description = slot.dataset.description;
      const rarity = slot.dataset.rarity;
      const fallbackName = isEmpty ? slot.textContent.trim() : '';

      detailPlaceholder.hidden = true;

      if (rarity) {
        itemDetail.setAttribute('data-rarity', rarity);
      } else {
        itemDetail.removeAttribute('data-rarity');
      }

      if (tagText) {
        detailTag.textContent = tagText;
        detailTag.hidden = false;
      } else {
        detailTag.hidden = true;
        detailTag.textContent = '';
      }

      const nameText = itemName || fallbackName;
      if (nameText) {
        detailName.textContent = nameText;
        detailName.hidden = false;
      } else {
        detailName.hidden = true;
        detailName.textContent = '';
      }

      if (description) {
        detailDescription.textContent = description;
        detailDescription.hidden = false;
      } else if (isEmpty) {
        detailDescription.textContent = 'This slot is currently empty.';
        detailDescription.hidden = false;
      } else {
        detailDescription.textContent = '';
        detailDescription.hidden = true;
      }

      detailContent.dataset.state = 'active';
    };

    const clearDetail = () => {
      if (!detailContent || !detailPlaceholder || !detailTag || !detailName || !detailDescription) {
        return;
      }

      detailContent.dataset.state = 'idle';
      detailPlaceholder.hidden = false;
      itemDetail.removeAttribute('data-rarity');
      detailTag.hidden = true;
      detailTag.textContent = '';
      detailName.hidden = true;
      detailName.textContent = '';
      detailDescription.hidden = true;
      detailDescription.textContent = '';
    };

    clearItemDetail = clearDetail;

    for (const slot of itemSlots) {
      slot.setAttribute('tabindex', '0');
      slot.addEventListener('mouseenter', () => showItemDetail(slot));
      slot.addEventListener('focus', () => showItemDetail(slot));
      slot.addEventListener('mouseleave', clearDetail);
      slot.addEventListener('blur', clearDetail);
    }
  }

  function setPaused(next) {
    if (paused === next) return;
    paused = next;
    if (!next && clearItemDetail) {
      clearItemDetail();
    }
    pauseMenu.classList.toggle('is-open', paused);
    pauseMenu.setAttribute('aria-hidden', String(!paused));
    overlay.style.display = paused ? 'none' : '';
    if (paused) {
      setActiveTab(activeTab, { focus: true });
      if (controller) {
        controller.resetMovement();
      }
      if (document.pointerLockElement === canvas) {
        document.exitPointerLock();
      }
    } else if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock().catch(() => {
        // Ignore failures (for example, if the browser rejects the request).
      });
    }
  }

  for (const button of tabButtons) {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.tab, { focus: true });
    });
  }

  if (tablist) {
    tablist.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const currentIndex = tabButtons.findIndex((btn) => btn.dataset.tab === activeTab);
      if (event.key === 'Home') {
        setActiveTab(tabButtons[0].dataset.tab, { focus: true });
        return;
      }
      if (event.key === 'End') {
        setActiveTab(tabButtons[tabButtons.length - 1].dataset.tab, { focus: true });
        return;
      }

      const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const nextIndex = (currentIndex + direction + tabButtons.length) % tabButtons.length;
      setActiveTab(tabButtons[nextIndex].dataset.tab, { focus: true });
    });
  }

  pauseMenu.addEventListener('click', (event) => {
    if (event.target === pauseMenu) {
      setPaused(false);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      setPaused(true);
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas && controller && !paused) {
      setPaused(true);
    }
  });

  try {
    const { device, context, format, resize } = await initWebGPU(canvas);
    const pipeline = createPipeline(device, format);
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

    controller = new FirstPersonController(canvas);
    let lastTime = performance.now();

    function frame(now) {
      const deltaTime = Math.min((now - lastTime) / 1000, 0.2);
      lastTime = now;

      if (!paused) {
        controller.update(deltaTime);
      }

      const padding = 0.25;
      controller.position[0] = Math.min(Math.max(controller.position[0], bounds.minX + padding), bounds.maxX - padding);
      controller.position[1] = Math.min(Math.max(controller.position[1], bounds.minY + padding), bounds.maxY - padding);
      controller.position[2] = Math.min(Math.max(controller.position[2], bounds.minZ + padding), bounds.maxZ - padding);

      resize();

      const aspect = canvas.width / canvas.height;
      mat4Perspective(projection, Math.PI / 3, aspect, 0.1, 100.0);
      const eye = controller.position;
      const center = controller.getViewTarget();
      mat4LookAt(view, eye, center, [0, 1, 0]);
      mat4Multiply(viewProj, projection, view);

      device.queue.writeBuffer(uniformBuffer, 0, viewProj.buffer, viewProj.byteOffset, viewProj.byteLength);

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
    overlay.innerHTML = `
      <div><strong>WebGPU FPS Prototype</strong></div>
      <div>Click to capture the mouse, then use WASD to move, Space/Shift for vertical movement. Press Esc to open the pause menu.</div>
    `;
  } catch (error) {
    console.error(error);
    overlay.textContent = error.message;
    overlay.style.display = '';
  }
}

main();
