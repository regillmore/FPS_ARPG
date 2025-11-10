export async function initWebGPU(canvas) {
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
  const depthFormat = 'depth24plus';

  let configured = false;
  let depthTexture = null;
  let depthTextureView = null;

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
      depthTexture?.destroy?.();
      depthTexture = device.createTexture({
        size: { width, height },
        format: depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      depthTextureView = depthTexture.createView();
      configured = true;
    }
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    device,
    context,
    format,
    depthFormat,
    resize,
    getDepthTextureView: () => depthTextureView
  };
}
