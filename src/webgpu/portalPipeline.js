export function createPortalPipeline(device, colorFormat, depthFormat = 'depth24plus') {
  const shaderModule = device.createShaderModule({
    code: `
struct PortalUniforms {
  viewProj : mat4x4<f32>,
  model : mat4x4<f32>,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@group(0) @binding(0) var<uniform> uniforms : PortalUniforms;
@group(1) @binding(0) var portalSampler : sampler;
@group(1) @binding(1) var portalTexture : texture_2d<f32>;

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) uv : vec2<f32>
) -> VertexOutput {
  var output : VertexOutput;
  let world = uniforms.model * vec4<f32>(position, 1.0);
  output.position = uniforms.viewProj * world;
  output.uv = uv;
  return output;
}

@fragment
fn fs_main(
  @location(0) uv : vec2<f32>
) -> @location(0) vec4<f32> {
  return textureSample(portalTexture, portalSampler, uv);
}
    `
  });

  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module: shaderModule,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 20,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x2' }
          ]
        }
      ]
    },
    fragment: {
      module: shaderModule,
      entryPoint: 'fs_main',
      targets: [{ format: colorFormat }]
    },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
    depthStencil: {
      format: depthFormat,
      depthWriteEnabled: true,
      depthCompare: 'less'
    }
  });
}
