import type { Vector1, Vector2, Vector3, Vector4 } from "../common/numeric-types";

export type ProgramInfo<TAttribValues extends AttribValues, TUniformValues extends UniformValues> = {
  program: WebGLProgram;
  attribSetters: AttribSetters<TAttribValues>;
  uniformSetters: UniformSetters<TUniformValues>;
};

export type AttribValue = number | Vector1 | Vector2 | Vector3 | Vector4;
export type AttribValues = {
  [name: string]: AttribValue[];
};
export type AttribName<TAttribValues extends AttribValues> = Extract<keyof TAttribValues, string>;

export type UniformValue = number | Iterable<number> | WebGLTexture | WebGLTexture[];
export type UniformValues = {
  [name: string]: UniformValue;
};
export type UniformName<TUniformValues extends UniformValues> = Extract<keyof TUniformValues, string>;

export type AttribSetters<T extends AttribValues> = {
  [name in AttribName<T>]: AttribSetter;
};

export type AttribSetter = (v: BufferAttribValue) => void;

export type BufferAttribValue = {
  buffer: WebGLBuffer;
  numComponents: GLint;
  numEntries: GLsizei;
  type: GLenum;
  normalize: GLboolean;
  stride?: GLsizei;
  offset?: GLintptr;
};

export type BufferAttribValues<T extends AttribValues> = {
  [name in AttribName<T>]: BufferAttribValue;
};

export type UniformSetter =
  | ((v: number) => void)
  | ((v: Iterable<number>) => void)
  | ((v: WebGLTexture) => void)
  | ((v: WebGLTexture[]) => void);
export type UniformSetters<T extends UniformValues> = {
  [name in UniformName<T>]: UniformSetter;
};
