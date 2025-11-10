export function createRoomGeometry(device) {
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
      normal: [0, 1, 0],
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
      normal: [0, -1, 0],
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
      normal: [0, 0, 1],
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
      normal: [0, 0, -1],
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
      normal: [1, 0, 0],
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
      normal: [-1, 0, 0],
      corners: [
        [maxX, minY, maxZ],
        [maxX, minY, minZ],
        [maxX, maxY, minZ],
        [maxX, maxY, maxZ]
      ]
    }
  ];

  const vertexStride = 9;
  const vertices = new Float32Array(faces.length * 6 * vertexStride);
  let offset = 0;

  const pushVertex = (corner, normal, color) => {
    vertices[offset++] = corner[0];
    vertices[offset++] = corner[1];
    vertices[offset++] = corner[2];
    vertices[offset++] = normal[0];
    vertices[offset++] = normal[1];
    vertices[offset++] = normal[2];
    vertices[offset++] = color[0];
    vertices[offset++] = color[1];
    vertices[offset++] = color[2];
  };

  for (const face of faces) {
    const [a, b, c, d] = face.corners;
    pushVertex(a, face.normal, face.color);
    pushVertex(b, face.normal, face.color);
    pushVertex(c, face.normal, face.color);
    pushVertex(a, face.normal, face.color);
    pushVertex(c, face.normal, face.color);
    pushVertex(d, face.normal, face.color);
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
