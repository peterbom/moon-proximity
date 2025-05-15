import type { Vector2 } from "../common/numeric-types";
import type { ProgramInfo } from "../webgl/program-types";
import type {
  CombineHeightDistanceAttribValues,
  CombineHeightDistanceUniformValues,
} from "../webgl/programs/combine-height-distance";
import type {
  ProximityHeightMapAttribValues,
  ProximityHeightMapUniformValues,
} from "../webgl/programs/proximity-height-map";
import type {
  TextureAttributeSimpleObjectAttribValues,
  TextureAttributeSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import type { ReadableTexture } from "../webgl/texture-utils";

export type ImageDimensions = {
  width: number;
  height: number;
};

export type EarthResourceTile = {
  index: number;
  startLon: number;
  startLat: number;
  filenameBase: string;
};

export type TileSelectionData = {
  distancesAboveMin: number[];
  geodeticCoords: Vector2[];
  unixSeconds: number[];
};

export type RectangularTileLayout = {
  startLongitudes: number[];
  startLatitudes: number[];
};

export type TileToTextureScale = {
  scaleX: (tilePixelX: number) => number;
  scaleY: (tilePixelY: number) => number;
};

export type ElevationTilePrograms = {
  proximityHeightMapProgramInfo: ProgramInfo<ProximityHeightMapAttribValues, ProximityHeightMapUniformValues>;
  combineHeightDistanceProgramInfo: ProgramInfo<CombineHeightDistanceAttribValues, CombineHeightDistanceUniformValues>;
};

export type ColorTilePrograms = {
  textureAttributeSimpleObjectProgramInfo: ProgramInfo<
    TextureAttributeSimpleObjectAttribValues,
    TextureAttributeSimpleObjectUniformValues
  >;
};

export type TileProximityValues = {
  data: Float32Array;
  width: number;
  height: number;
};

export type TileOutputTextures = {
  proximities: ReadableTexture;
  elevations: ReadableTexture;
  distancesAboveMin: ReadableTexture;
  unixSeconds: ReadableTexture;
};
