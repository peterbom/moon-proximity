import type { Vector2, Vector3, Vector4 } from "../../common/numeric-types";
import { replacePlaceholders } from "../../common/text-utils";
import { createVertexAttribsInfo } from "../attributes";
import type { SourceAttribsInfo, VertexAttribsInfo } from "../attributes-types";
import type { AttribSetters, ProgramInfo } from "../program-types";
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
  in vec3 a_normal;
  // Example: in vec4 a_color; in vec2 a_texcoord;
  {{${extraAttributesPlaceholder}}}

  uniform mat4 u_worldMatrix;
  uniform mat4 u_matrix;
  uniform mat4 u_normalMatrix;
  uniform vec3 u_lightPosition;
  uniform vec3 u_cameraPosition;
  // Example: uniform vec4 u_color;
  {{${extraVertexUniformsPlaceholder}}}

  out vec3 v_normal;
  out vec3 v_surfaceToLight;
  out vec3 v_surfaceToCamera;
  // Example: out vec4 v_color; out vec2 v_texcoord;
  {{${extraVertexOutVarsPlaceholder}}}
  
  void main() {
    gl_Position = u_matrix * a_position;
    v_normal = mat3(u_normalMatrix) * a_normal;

    vec3 surfaceWorldPosition = (u_worldMatrix * a_position).xyz;
    v_surfaceToLight = u_lightPosition - surfaceWorldPosition;
    v_surfaceToCamera = u_cameraPosition - surfaceWorldPosition;

    // Example: v_color = a_color; v_texcoord = a_texcoord;
    {{${vertexSetOutVarsPlaceholder}}}
  }
`;

const fragmentShaderSrcTemplate = /*glsl*/ `#version 300 es
  // Fragment shaders don't have default precision so need to specify
  precision highp float;

  in vec3 v_normal;
  in vec3 v_surfaceToLight;
  in vec3 v_surfaceToCamera;
  // Example: in vec4 v_color; in vec2 v_texcoord;
  {{${extraFragmentInVarsPlaceholder}}}

  uniform vec3 u_ambientColor;
  uniform float u_shininess;
  uniform vec3 u_lightColor;
  // Example: uniform sampler2D u_texture;
  {{${extraFragmentUniformsPlaceholder}}}

  out vec4 outColor;

  void main() {
    vec3 normal = normalize(v_normal);
    vec3 surfaceToLight = normalize(v_surfaceToLight);
    vec3 surfaceToCamera = normalize(v_surfaceToCamera);
    vec3 maxReflectionNormal = normalize(surfaceToCamera + surfaceToLight);

    float diffuseAlignment = clamp(dot(normal, surfaceToLight), 0.0, 1.0);
    float specularAlignment = clamp(dot(normal, maxReflectionNormal), 0.0, 1.0);
    specularAlignment = pow(specularAlignment, u_shininess);

    // Example: texture(u_texture, v_texcoord)
    vec4 calcColor = {{${fragmentCalcColorExpressionPlaceholder}}};

    vec3 ambientRgb = calcColor.rgb * u_ambientColor;
    vec3 diffuseRgb = calcColor.rgb * u_lightColor * diffuseAlignment;
    vec3 specularRgb = (1.0 - specularAlignment) * diffuseRgb + specularAlignment * u_lightColor;

    outColor = vec4(ambientRgb + diffuseRgb + specularRgb, calcColor.a);
  }
`;

type SharedAttribValues = {
  a_position: (Vector2 | Vector3 | Vector4)[];
  a_normal: Vector3[];
};

export type ColorAttributeLitObjectAttribValues = SharedAttribValues & {
  a_color: (Vector3 | Vector4)[];
};

export type TextureAttributeLitObjectAttribValues = SharedAttribValues & {
  a_texcoord: Vector2[];
};

export type UniformColorLitObjectAttribValues = SharedAttribValues;

type SharedUniformValues = {
  u_worldMatrix: number[];
  u_matrix: number[];
  u_normalMatrix: number[];
  u_lightPosition: Vector3;
  u_cameraPosition: Vector3;
  u_ambientColor: Vector3;
  u_lightColor: Vector3;
  u_shininess: number;
};

export type ColorAttributeLitObjectUniformValues = SharedUniformValues;

export type TextureAttributeLitObjectUniformValues = SharedUniformValues & {
  u_texture: WebGLTexture;
};

export type UniformColorLitObjectUniformValues = SharedUniformValues & {
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

export function createColorAttributeLitObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<ColorAttributeLitObjectAttribValues, ColorAttributeLitObjectUniformValues> {
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

export function createTextureAttributeLitObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<TextureAttributeLitObjectAttribValues, TextureAttributeLitObjectUniformValues> {
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

export function createUniformColorLitObjectProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<UniformColorLitObjectAttribValues, UniformColorLitObjectUniformValues> {
  const vertexShaderSrc = replacePlaceholders(vertexShaderSrcTemplate, vertexShaderSubstitutions[ColorSource.Uniform]);
  const fragmentShaderSrc = replacePlaceholders(
    fragmentShaderSrcTemplate,
    fragmentShaderSubstitutions[ColorSource.Uniform]
  );
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createColorAttributeLitObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<ColorAttributeLitObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<ColorAttributeLitObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<ColorAttributeLitObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
    a_normal: { type: gl.FLOAT, data: shapeData.normals },
    a_color: { type: gl.FLOAT, data: shapeData.colors },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}

export function createTextureAttributeLitObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<TextureAttributeLitObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<TextureAttributeLitObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<TextureAttributeLitObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
    a_normal: { type: gl.FLOAT, data: shapeData.normals },
    a_texcoord: { type: gl.FLOAT, data: shapeData.texCoords },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}

export function createUniformColorLitObjectVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<UniformColorLitObjectAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<UniformColorLitObjectAttribValues> {
  const attribsInfo: SourceAttribsInfo<UniformColorLitObjectAttribValues> = {
    a_position: { type: gl.FLOAT, data: shapeData.positions },
    a_normal: { type: gl.FLOAT, data: shapeData.normals },
  };

  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo,
    drawMode: shapeData.drawMode,
    indices: shapeData.indices,
  });
}
