import type { Vector2 } from "../../common/numeric-types";
import { ProximityShapeData } from "../../geo-shape-data";
import { createVertexAttribsInfo } from "../attributes";
import type { AttribSetters, ProgramInfo, VertexAttribsInfo } from "../program-types";
import { createProgramInfo } from "../programs";

const vertexShaderSrc = /*glsl*/ `#version 300 es
in vec2 a_geodeticCoord;
in float a_distanceAboveMin;
in float a_unixSeconds;

uniform vec2 u_tileCenterGeodeticCoord;
uniform vec2 u_scale;

out float v_distanceAboveMin;
out float v_unixSeconds;

void main() {
  // Position this vertex on (or off) a 2D map (equirectangular projection) on the x-y plane.
  // The extent of the map is defined by its center (u_tileCenterGeodeticCoord) and its scale
  // (u_scale), so that points outside the map region fall outside clip space.
  // We will be combining this with textures from image files that start at the top left, so
  // invert the y-axis here.
  vec2 xy = (a_geodeticCoord - u_tileCenterGeodeticCoord) * vec2(1, -1) * u_scale;
  gl_Position = vec4(xy, 0.0, 1.0);
  v_distanceAboveMin = a_distanceAboveMin;
  v_unixSeconds = a_unixSeconds;
}
`;

const fragmentShaderSrc = /*glsl*/ `#version 300 es
precision highp float;

in float v_distanceAboveMin;
in float v_unixSeconds;

// I thought it might be possible to combine these in an RG texture,
// but that is not a valid format for readPixels. There is no error,
// but also no data.
layout(location=0) out float distanceAboveMin;
layout(location=1) out float unixSeconds;

void main() {
  distanceAboveMin = v_distanceAboveMin;
  unixSeconds = v_unixSeconds;
}
`;

export type ProximityHeightMapOutputTextureInfos = {
  distanceAboveMin: { attachmentIndex: 0; numComponents: 1 };
  unixSeconds: { attachmentIndex: 1; numComponents: 1 };
};

export type ProximityHeightMapAttribValues = {
  a_geodeticCoord: Vector2[];
  a_distanceAboveMin: number[];
  a_unixSeconds: number[];
};

export type ProximityHeightMapUniformValues = {
  u_tileCenterGeodeticCoord: Vector2;
  u_scale: Vector2;
};

export function createProximityHeightMapProgramInfo(
  gl: WebGL2RenderingContext
): ProgramInfo<ProximityHeightMapAttribValues, ProximityHeightMapUniformValues> {
  return createProgramInfo(gl, vertexShaderSrc, fragmentShaderSrc);
}

export function createProximityHeightMapVao(
  gl: WebGL2RenderingContext,
  attribSetters: AttribSetters<ProximityHeightMapAttribValues>,
  proximityShapeData: ProximityShapeData
): VertexAttribsInfo<ProximityHeightMapAttribValues> {
  return createVertexAttribsInfo(gl, attribSetters, {
    attribsInfo: {
      a_geodeticCoord: { type: gl.FLOAT, data: proximityShapeData.geodeticCoords },
      a_distanceAboveMin: { type: gl.FLOAT, data: proximityShapeData.distancesAboveMin },
      a_unixSeconds: { type: gl.FLOAT, data: proximityShapeData.unixSeconds },
    },
    indices: proximityShapeData.indices,
  });
}
