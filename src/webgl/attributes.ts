import type {
  AttribName,
  AttribSetters,
  AttribValues,
  BufferAttribValue,
  BufferAttribValues,
  IndicesValue,
  SourceAttribInfo,
  SourceVertexInfo,
  VertexAttribsInfo,
} from "./program-types";

export function createVertexAttribsInfo<T extends AttribValues>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<T>,
  data: SourceVertexInfo<T>
): VertexAttribsInfo<T> {
  // Ensure subsequent binding of buffers is done in the context of the VAO.
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Create and populate the attribute buffers.
  const attribEntries = Object.entries(data.attribsInfo).map(([name, info]) => [
    name,
    createBufferAttribValue(gl, info as SourceAttribInfo<T, Extract<keyof T, string>>),
  ]);

  const attribValues = Object.fromEntries(attribEntries) as BufferAttribValues<T>;
  const entryCount = getEntryCount(attribValues);

  let indicesValue: IndicesValue | null = null;
  if (data.indices) {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(data.indices), gl.STATIC_DRAW);
    indicesValue = { buffer, length: data.indices.length };
  }

  // Enable each vertex attribute and point it to the new buffers.
  setAttributes(attribSetters, attribValues);

  // Unbind the VAO to protect it if/when later changes are made to ELEMENT_ARRAY_BUFFER
  gl.bindVertexArray(null);
  return {
    attribValues,
    entryCount,
    mode: data.drawMode || "Triangles",
    indicesValue,
    vao,
    sourceData: data,
  };
}

function createBufferAttribValue<T extends AttribValues, P extends AttribName<T>>(
  gl: WebGL2RenderingContext,
  attribInfo: SourceAttribInfo<T, P>
): BufferAttribValue {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, createTypedArray(gl, attribInfo.type, attribInfo.data), gl.STATIC_DRAW);

  return {
    buffer,
    numComponents:
      attribInfo.data.length > 0 ? (typeof attribInfo.data[0] === "number" ? 1 : attribInfo.data[0].length) : 1,
    numEntries: attribInfo.data.length,
    type: attribInfo.type,
    normalize: attribInfo.normalize !== undefined ? attribInfo.normalize : false,
  };
}

function createTypedArray<T extends AttribValues, P extends AttribName<T>>(
  gl: WebGL2RenderingContext,
  type: GLenum,
  data: T[P]
): ArrayBuffer {
  switch (type) {
    case gl.FLOAT:
      return new Float32Array(data.flat());
    case gl.UNSIGNED_BYTE:
      return new Uint8Array(data.flat());
    default:
      throw new Error(`ArrayBuffer type not defined for type ${type}`);
  }
}

function getEntryCount<T extends AttribValues>(bufferAttribValues: BufferAttribValues<T>) {
  const vals = Object.values<BufferAttribValue>(bufferAttribValues);
  if (vals.length === 0) {
    return 0;
  }

  const numEntries = vals[0].numEntries;
  if (vals.some((v) => v.numEntries !== numEntries)) {
    throw new Error(`Not all attribs have ${numEntries} entries.`);
  }

  return numEntries;
}

function setAttributes<T extends AttribValues>(setters: AttribSetters<T>, attribs: BufferAttribValues<T>) {
  Object.entries(attribs).forEach(([name, value]) => {
    const setter = setters[name];
    if (setter) {
      setter(value);
    } else {
      // Not an error. It's okay to specify values for attributes that don't exist, such as when we use
      // more than one program, or unused attributes within a program have been optimized out.
      console.info(`Missing setter for attribute: ${name}`);
    }
  });
}
