export function createBasicPipeline(device, format) {
  const shaderModule = device.createShaderModule({
    code: `
struct Light {
  position : vec4<f32>,
  color : vec4<f32>,
};

struct Uniforms {
  viewProj : mat4x4<f32>,
  model : mat4x4<f32>,
  ambientAndCount : vec4<f32>,
  lights : array<Light, 2>,
};

@binding(0) @group(0) var<uniform> uniforms : Uniforms;

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) color : vec3<f32>,
};

@vertex
fn vs_main(
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) color : vec3<f32>
) -> VertexOutput {
  var output : VertexOutput;
  let worldPosition = uniforms.model * vec4<f32>(position, 1.0);
  let worldNormal = (uniforms.model * vec4<f32>(normal, 0.0)).xyz;
  output.position = uniforms.viewProj * worldPosition;
  output.worldPos = worldPosition.xyz;
  output.normal = normalize(worldNormal);
  output.color = color;
  return output;
}

fn evaluateLight(light : Light, normal : vec3<f32>, worldPos : vec3<f32>) -> vec3<f32> {
  let direction = light.position.xyz - worldPos;
  let distSq = max(dot(direction, direction), 1e-4);
  let invDist = inverseSqrt(distSq);
  direction = direction * invDist;
  let attenuation = 1.0 / (1.0 + sqrt(distSq) * 0.35 + distSq * 0.1);
  let nDotL = max(dot(normal, direction), 0.0);
  return light.color.rgb * light.color.a * nDotL * attenuation;
}

@fragment
fn fs_main(
  @location(0) worldPos : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) color : vec3<f32>
) -> @location(0) vec4<f32> {
  let lightCount = u32(uniforms.ambientAndCount.w + 0.5);
  var litColor = uniforms.ambientAndCount.rgb;
  let n = normalize(normal);
  for (var i = 0u; i < min(lightCount, 2u); i = i + 1u) {
    litColor = litColor + evaluateLight(uniforms.lights[i], n, worldPos);
  }
  return vec4<f32>(color * litColor, 1.0);
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
          arrayStride: 36,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x3' },
            { shaderLocation: 2, offset: 24, format: 'float32x3' }
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
      cullMode: 'none'
    },
    depthStencil: undefined
  });
}
