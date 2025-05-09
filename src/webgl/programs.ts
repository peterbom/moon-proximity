import { seq } from "../common/iteration";
import type {
  AttribSetters,
  AttribValues,
  BufferAttribValue,
  ProgramInfo,
  UniformSetter,
  UniformSetters,
  UniformValues,
} from "./program-types";

export function createProgramInfo<TAttribValues extends AttribValues, TUniformValues extends UniformValues>(
  gl: WebGL2RenderingContext,
  vertexShaderOrSrc: WebGLShader | string,
  fragmentShaderOrSrc: WebGLShader | string
): ProgramInfo<TAttribValues, TUniformValues> {
  const program = createProgram(gl, vertexShaderOrSrc, fragmentShaderOrSrc);

  return {
    program,
    attribSetters: createAttributeSetters(gl, program),
    uniformSetters: createUniformSetters(gl, program),
  };
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexShaderOrSrc: WebGLShader | string,
  fragmentShaderOrSrc: WebGLShader | string
): WebGLProgram {
  const program = gl.createProgram();

  const vertexShader = asShader(gl, gl.VERTEX_SHADER, vertexShaderOrSrc);
  const fragmentShader = asShader(gl, gl.FRAGMENT_SHADER, fragmentShaderOrSrc);
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);

  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (!success) {
    console.log(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    throw new Error("program linking error");
  }

  return program;

  function asShader(gl: WebGL2RenderingContext, type: GLenum, shaderOrSrc: WebGLShader | string): WebGLShader {
    return typeof shaderOrSrc === "string" ? createShader(gl, type, shaderOrSrc) : shaderOrSrc;
  }
}

function createShader(gl: WebGL2RenderingContext, type: GLenum, source: string) {
  const shader = gl.createShader(type);
  if (shader === null) {
    throw new Error("null shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (!success) {
    console.log(gl.getShaderInfoLog(shader));
    console.log(
      source
        .split("\n")
        .map((l, i) => `${(i + 1).toString().padEnd(5)}|${l}`)
        .join("\n")
    );
    gl.deleteShader(shader);
    throw new Error("shader compilation error");
  }

  return shader;
}

function createAttributeSetters<T extends AttribValues>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): AttribSetters<T> {
  const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  const entries = seq(numAttribs)
    .map((i) => gl.getActiveAttrib(program, i)!)
    // The zero based index used by getActiveAttrib is not (necessarily) the same as the numeric location
    // returned by getAttribLocation.
    .map((info) => [info.name, createAttribSetter(gl, gl.getAttribLocation(program, info.name))]);

  return Object.fromEntries(entries);
}

function createAttribSetter(gl: WebGL2RenderingContext, index: GLuint) {
  return function (b: BufferAttribValue) {
    gl.bindBuffer(gl.ARRAY_BUFFER, b.buffer);
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(index, b.numComponents, b.type, b.normalize, b.stride || 0, b.offset || 0);
  };
}

function createUniformSetters<T extends UniformValues>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): UniformSetters<T> {
  let textureUnitCount = 0;

  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  const entries = seq(numUniforms)
    .map((i) => gl.getActiveUniform(program, i)!)
    .map((info) => ({ info, location: gl.getUniformLocation(program, info.name)! }))
    .map((x) => [trimArraySuffix(x.info.name), createUniformSetter(gl, x.location, x.info, () => textureUnitCount++)]);

  return Object.fromEntries(entries);

  function trimArraySuffix(name: string) {
    return hasArraySuffix(name) ? name.substring(0, name.length - 3) : name;
  }
}

function hasArraySuffix(name: string) {
  return name.substring(name.length - 3) === "[0]";
}

function createUniformSetter(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  uniformInfo: WebGLActiveInfo,
  getTextureUnit: () => number
): UniformSetter {
  const type = uniformInfo.type;
  // Check if this uniform is an array
  const isArray = uniformInfo.size > 1 && hasArraySuffix(uniformInfo.name);
  if (type === gl.FLOAT && isArray) {
    return (v: Iterable<number>) => gl.uniform1fv(location, v);
  }
  if (type === gl.FLOAT) {
    return (v: number) => gl.uniform1f(location, v);
  }
  if (type === gl.FLOAT_VEC2) {
    return (v: Iterable<number>) => gl.uniform2fv(location, v);
  }
  if (type === gl.FLOAT_VEC3) {
    return (v: Iterable<number>) => gl.uniform3fv(location, v);
  }
  if (type === gl.FLOAT_VEC4) {
    return (v: Iterable<number>) => gl.uniform4fv(location, v);
  }
  if (type === gl.INT && isArray) {
    return (v: Iterable<number>) => gl.uniform1iv(location, v);
  }
  if (type === gl.INT) {
    return (v: number) => gl.uniform1i(location, v);
  }
  if (type === gl.UNSIGNED_INT) {
    return (v: number) => gl.uniform1ui(location, v);
  }
  if (type === gl.UNSIGNED_INT && isArray) {
    return (v: Iterable<number>) => gl.uniform1uiv(location, v);
  }
  if (type === gl.INT_VEC2) {
    return (v: Iterable<number>) => gl.uniform2iv(location, v);
  }
  if (type === gl.INT_VEC3) {
    return (v: Iterable<number>) => gl.uniform3iv(location, v);
  }
  if (type === gl.INT_VEC4) {
    return (v: Iterable<number>) => gl.uniform4iv(location, v);
  }
  if (type === gl.BOOL) {
    return (v: Iterable<number>) => gl.uniform1iv(location, v);
  }
  if (type === gl.BOOL_VEC2) {
    return (v: Iterable<number>) => gl.uniform2iv(location, v);
  }
  if (type === gl.BOOL_VEC3) {
    return (v: Iterable<number>) => gl.uniform3iv(location, v);
  }
  if (type === gl.BOOL_VEC4) {
    return (v: Iterable<number>) => gl.uniform4iv(location, v);
  }
  if (type === gl.FLOAT_MAT2) {
    return (v: Iterable<number>) => gl.uniformMatrix2fv(location, false, v);
  }
  if (type === gl.FLOAT_MAT3) {
    return (v: Iterable<number>) => gl.uniformMatrix3fv(location, false, v);
  }
  if (type === gl.FLOAT_MAT4) {
    return (v: Iterable<number>) => gl.uniformMatrix4fv(location, false, v);
  }
  if ((type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE) && isArray) {
    const units = Array.from({ length: uniformInfo.size }, getTextureUnit);
    const bindPoint = getBindPointForSamplerType(gl, type);

    return (textures: WebGLTexture[]) => {
      gl.uniform1iv(location, units);
      textures.forEach((texture, i) => {
        gl.activeTexture(gl.TEXTURE0 + units[i]);
        gl.bindTexture(bindPoint, texture);
      });
    };
  }
  if (type === gl.SAMPLER_2D || type === gl.SAMPLER_CUBE) {
    const bindPoint = getBindPointForSamplerType(gl, type);
    const unit = getTextureUnit();

    return (texture: WebGLTexture) => {
      gl.uniform1i(location, unit);
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(bindPoint, texture);
    };
  }

  throw "unknown type: 0x" + type.toString(16); // we should never get here.
}

function getBindPointForSamplerType(gl: WebGL2RenderingContext, type: GLenum) {
  if (type === gl.SAMPLER_2D) return gl.TEXTURE_2D; // eslint-disable-line
  if (type === gl.SAMPLER_CUBE) return gl.TEXTURE_CUBE_MAP; // eslint-disable-line
  throw new Error(`unknown sampler type: ${type}`);
}
