import type { Vector2, Vector3, Vector4 } from "../../common/numeric-types";
import { replacePlaceholders } from "../../common/text-utils";
import { createVertexAttribsInfo } from "../attributes";
import type { AttribSetters, ProgramInfo, SourceAttribsInfo, VertexAttribsInfo } from "../program-types";
import { createProgramInfo } from "../programs";
import type { ShapeData } from "../shape-types";

enum ColorSource {
  ColorAttribute,
  TextureAttribute,
  Uniform,
}

const extraAttributesPlaceholder = "EXTRA_ATTRIBUTES";
const extraVertexUniformsPlaceholder = "EXTRA_VERTEX_UNIFORMS";
const extraVertexOutVarsPlaceholder = "EXTRA_VERTEX_OUT_VARS";
const vertexSetOutVarsPlaceholder = "VERTEX_SET_OUT_VARS";

const extraFragmentInVarsPlaceholder = "EXTRA_FRAGMENT_IN_VARS";
const extraFragmentUniformsPlaceholder = "EXTRA_FRAGMENT_UNIFORMS";
const fragmentCalcColorExpressionPlaceholder = "FRAGMENT_CALC_COLOR_EXPR";

const vertexShaderSrcTemplate = /*glsl*/ `#version 300 es
  in vec4 a_position;
  // Example: in vec4 a_color; in vec2 a_texcoord;
  {{${extraAttributesPlaceholder}}}

  uniform mat4 u_matrix;
  // Example: uniform vec4 u_color;
  {{${extraVertexUniformsPlaceholder}}}

  // Example: out vec4 v_color; out vec2 v_texcoord;
  {{${extraVertexOutVarsPlaceholder}}}
  
  void main() {
    gl_Position = u_matrix * a_position;
    // Example: v_color = a_color; v_texcoord = a_texcoord;
    {{${vertexSetOutVarsPlaceholder}}}
  }
`;

const fragmentShaderSrcTemplate = /*glsl*/ `#version 300 es
  // Fragment shaders don't have default precision so need to specify
  precision highp float;

  // Example: in vec4 v_color; in vec2 v_texcoord;
  {{${extraFragmentInVarsPlaceholder}}}

  // Example: uniform sampler2D u_texture;
  {{${extraFragmentUniformsPlaceholder}}}

  out vec4 outColor;

  void main() {
    // Example: texture(u_texture, v_texcoord)
    outColor = {{${fragmentCalcColorExpressionPlaceholder}}};
  }
`;

export type CommonSimpleObjectAttribValues = {
  a_position: (Vector2 | Vector3 | Vector4)[];
};

export type ColorAttributeSimpleObjectAttribValues = CommonSimpleObjectAttribValues & {
  a_color: (Vector3 | Vector4)[];
};

export type TextureAttributeSimpleObjectAttribValues = CommonSimpleObjectAttribValues & {
  a_texcoord: Vector2[];
};

export type UniformColorSimpleObjectAttribValues = CommonSimpleObjectAttribValues;

export type CommonSimpleObjectUniformValues = {
  u_matrix: number[];
};

export type ColorAttributeSimpleObjectUniformValues = CommonSimpleObjectUniformValues;

export type TextureAttributeSimpleObjectUniformValues = CommonSimpleObjectUniformValues & {
  u_texture: WebGLTexture;
};

export type UniformColorSimpleObjectUniformValues = CommonSimpleObjectUniformValues & {
  u_color: Vector4;
};

const vertexShaderSubstitutions = {
  [ColorSource.ColorAttribute]: {
    [extraAttributesPlaceholder]: "in vec4 a_color;",
    [extraVertexUniformsPlaceholder]: "",
    [extraVertexOutVarsPlaceholder]: "out vec4 v_color;",
    [vertexSetOutVarsPlaceholder]: "v_color = a_color;",
  },
  [ColorSource.TextureAttribute]: {
    [extraAttributesPlaceholder]: "in vec2 a_texcoord;",
    [extraVertexUniformsPlaceholder]: "",
    [extraVertexOutVarsPlaceholder]: "out vec2 v_texcoord;",
    [vertexSetOutVarsPlaceholder]: "v_texcoord = a_texcoord;",
  },
  [ColorSource.Uniform]: {
    [extraAttributesPlaceholder]: "",
    [extraVertexUniformsPlaceholder]: "",
    [extraVertexOutVarsPlaceholder]: "",
    [vertexSetOutVarsPlaceholder]: "",
  },
};

const fragmentShaderSubstitutions = {
  [ColorSource.ColorAttribute]: {
    [extraFragmentInVarsPlaceholder]: "in vec4 v_color;",
    [extraFragmentUniformsPlaceholder]: "",
    [fragmentCalcColorExpressionPlaceholder]: "v_color",
  },
  [ColorSource.TextureAttribute]: {
    [extraFragmentInVarsPlaceholder]: "in vec2 v_texcoord;",
    [extraFragmentUniformsPlaceholder]: "uniform sampler2D u_texture;",
    [fragmentCalcColorExpressionPlaceholder]: "texture(u_texture, v_texcoord)",
  },
  [ColorSource.Uniform]: {
    [extraFragmentInVarsPlaceholder]: "",
    [extraFragmentUniformsPlaceholder]: "uniform vec4 u_color;",
    [fragmentCalcColorExpressionPlaceholder]: "u_color",
  },
};

export function createColorAttributeSimpleObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<ColorAttributeSimpleObjectAttribValues, ColorAttributeSimpleObjectUniformValues> {
  const vertexShaderSrc = replacePlaceholders(
    vertexShaderSrcTemplate,
    vertexShaderSubstitutions[ColorSource.ColorAttribute]
  );
  const fragmentShaderSrc = replacePlaceholders(
    fragmentShaderSrcTemplate,
    fragmentShaderSubstitutions[ColorSource.ColorAttribute]
  );
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createTextureAttributeSimpleObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<TextureAttributeSimpleObjectAttribValues, TextureAttributeSimpleObjectUniformValues> {
  const vertexShaderSrc = replacePlaceholders(
    vertexShaderSrcTemplate,
    vertexShaderSubstitutions[ColorSource.TextureAttribute]
  );
  const fragmentShaderSrc = replacePlaceholders(
    fragmentShaderSrcTemplate,
    fragmentShaderSubstitutions[ColorSource.TextureAttribute]
  );
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createUniformColorSimpleObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<UniformColorSimpleObjectAttribValues, UniformColorSimpleObjectUniformValues> {
  const vertexShaderSrc = replacePlaceholders(vertexShaderSrcTemplate, vertexShaderSubstitutions[ColorSource.Uniform]);
  const fragmentShaderSrc = replacePlaceholders(
    fragmentShaderSrcTemplate,
    fragmentShaderSubstitutions[ColorSource.Uniform]
  );
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createColorAttributeSimpleObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<ColorAttributeSimpleObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<ColorAttributeSimpleObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<ColorAttributeSimpleObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
    a_color: { type: gl.FLOAT, data: shapeData.colors },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}

export function createTextureAttributeSimpleObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<TextureAttributeSimpleObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<TextureAttributeSimpleObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<TextureAttributeSimpleObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
    a_texcoord: { type: gl.FLOAT, data: shapeData.texCoords },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}

export function createUniformColorSimpleObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<UniformColorSimpleObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<UniformColorSimpleObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<UniformColorSimpleObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}
