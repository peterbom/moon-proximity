import type { Vector2 } from "../../common/numeric-types";
import { createVertexAttribsInfo } from "../attributes";
import type { AttribSetters, ProgramInfo, VertexAttribsInfo } from "../program-types";
import { createProgramInfo } from "../programs";

const vertexShaderSrc = /*glsl*/ `#version 300 es
in vec4 a_position;

void main() {
  gl_Position = a_position;
}
`;

const fragmentShaderSrc = /*glsl*/ `#version 300 es
precision highp float;

uniform sampler2D u_distanceAboveMinTexture;
uniform sampler2D u_elevationTexture;
uniform float u_elevationScaleFactor;

out float outProximity;

void main() {
  ivec2 fragCoord = ivec2(gl_FragCoord.xy);
  float distanceAboveMin = texelFetch(u_distanceAboveMinTexture, fragCoord, 0).r * 1000.0; // km -> m
  float topoHeight = texelFetch(u_elevationTexture, fragCoord, 0).r;
  float height = topoHeight * u_elevationScaleFactor;

  // Larger values = closer to moon. Most values will be negative.
  outProximity = height - distanceAboveMin;
}
`;

export type CombineHeightOutputTextureInfos = {
  proximity: { attachmentIndex: 0; numComponents: 1 };
};

export type CombineHeightDistanceAttribValues = { a_position: Vector2[] };

export type CombineHeightDistanceUniformValues = {
  u_distanceAboveMinTexture: WebGLTexture;
  u_elevationTexture: WebGLTexture;
  u_elevationScaleFactor: number;
};

export function createCombineHeightDistanceProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<CombineHeightDistanceAttribValues, CombineHeightDistanceUniformValues> {
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createCombineHeightDistanceVao(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<CombineHeightDistanceAttribValues>
): VertexAttribsInfo<CombineHeightDistanceAttribValues> {
  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo: {
      a_position: {
        type: gl.FLOAT,
        data: [
          [-1, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ],
      },
    },
    indices: null,
  });
}
