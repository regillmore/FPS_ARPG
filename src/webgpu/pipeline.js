export function createBasicPipeline(device, format) {
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

  return device.createRenderPipeline({
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
}
