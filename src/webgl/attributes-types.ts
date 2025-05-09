import { AttribName, AttribValues, BufferAttribValues } from "./program-types";
import { DrawMode } from "./shape-types";

export type VertexAttribsInfo<T extends AttribValues> = {
  indicesValue: IndicesValue | null;
  attribValues: BufferAttribValues<T>;
  entryCount: number;
  mode: DrawMode;
  vao: WebGLVertexArrayObject;
  sourceData: SourceVertexInfo<T>;
};

export type IndicesValue = {
  buffer: WebGLBuffer;
  length: number;
};

export type SourceVertexInfo<T extends AttribValues> = {
  attribsInfo: SourceAttribsInfo<T>;
  drawMode?: DrawMode;
  indices: number[] | null;
};

export type SourceAttribsInfo<T extends AttribValues> = {
  [P in AttribName<T>]: SourceAttribInfo<T, P>;
};

export type SourceAttribInfo<T extends AttribValues, P extends AttribName<T>> = {
  type: GLenum;
  data: T[P];
  normalize?: boolean;
};
