import type { Vector2, Vector3, Vector4 } from "../../common/numeric-types";
import { PlaceholderReplacements, replacePlaceholders } from "../../common/text-utils";
import type { ProgramInfo } from "../program-types";
import { createProgramInfo } from "../programs";

const flatValuePlaceholder = "EXTRA_ATTRIBUTES";

const vertexShaderSrcTemplate = /*glsl*/ `#version 300 es
in vec4 a_position;
in vec4 a_value;

uniform mat4 u_matrix;

flat out uint v_id;
{{${flatValuePlaceholder}}} out vec4 v_value;

void main() {
  gl_Position = u_matrix * a_position;
  v_value = a_value;
}
`;

const fragmentShaderSrc = /*glsl*/ `#version 300 es
precision highp float;

in vec4 v_value;

uniform uint u_id;

layout(location=0) out uint outId;
layout(location=1) out vec4 outValue;

void main() {
  outId = u_id;
  outValue = v_value;
}
`;

export type PickingAttribValues = {
  a_position: (Vector2 | Vector3 | Vector4)[];
  a_value: (number | Vector2 | Vector3 | Vector4)[];
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
    flatValuePlaceholder: interpolateValues ? "" : "flat ",
  };

  const vertexShaderSrc = replacePlaceholders(vertexShaderSrcTemplate, substitutions);
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}
