import type { Vector2, Vector3, Vector4 } from "../../common/numeric-types";
import { PlaceholderReplacements, replacePlaceholders } from "../../common/text-utils";
import { createVertexAttribsInfo } from "../attributes";
import type { AttribSetters, ProgramInfo, VertexAttribsInfo } from "../program-types";
import { createProgramInfo } from "../programs";
import type { ShapeData } from "../shape-types";

const flatValuePlaceholder = "FLAT_VALUE";

const vertexShaderSrcTemplate = /*glsl*/ `#version 300 es
in vec4 a_position;
in vec4 a_values;

uniform mat4 u_matrix;

{{${flatValuePlaceholder}}} out vec4 v_values;

void main() {
  gl_Position = u_matrix * a_position;
  v_values = a_values;
}
`;

const fragmentShaderSrc = /*glsl*/ `#version 300 es
precision highp float;

in vec4 v_values;

uniform uint u_id;

layout(location=0) out uint outId;
layout(location=1) out vec4 outValues;

void main() {
  outId = u_id;
  outValues = v_values;
}
`;

export type PickingOutputTextureInfos = {
  id: { attachmentIndex: 0; numComponents: 1 };
  values: { attachmentIndex: 1; numComponents: 4 };
};

export type PickingAttribValues = {
  a_position: (Vector2 | Vector3 | Vector4)[];
  a_values: (number | Vector2 | Vector3 | Vector4)[];
};

export type PickingUniformValues = {
  u_matrix: number[];
  u_id: number;
};

export function createPickingProgramInfo(
  gl: WebGL2RenderingContext,
  interpolateValues: boolean
): ProgramInfo<PickingAttribValues, PickingUniformValues> {
  const substitutions: PlaceholderReplacements = {
    [flatValuePlaceholder]: interpolateValues ? "" : "flat ",
  };

  const vertexShaderSrc = replacePlaceholders(vertexShaderSrcTemplate, substitutions);
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createPositionValuePickingVao<TShapeData extends ShapeData>(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<PickingAttribValues>,
  shapeData: TShapeData
): VertexAttribsInfo<PickingAttribValues> {
  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo: {
      a_position: { type: gl.FLOAT, data: shapeData.positions },
      a_values: { type: gl.FLOAT, data: shapeData.positions },
    },
    indices: shapeData.indices,
  });
}
