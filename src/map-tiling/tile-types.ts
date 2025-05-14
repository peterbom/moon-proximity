import type { ProgramInfo } from "../webgl/program-types";
import {
  CombineHeightDistanceAttribValues,
  CombineHeightDistanceUniformValues,
} from "../webgl/programs/combine-height-distance";
import {
  ProximityHeightMapAttribValues,
  ProximityHeightMapUniformValues,
} from "../webgl/programs/proximity-height-map";
import {
  TextureAttributeSimpleObjectAttribValues,
  TextureAttributeSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import type { ColorTileProcessor } from "./color-tile-processor";
import type { ElevationTileProcessor } from "./elevation-tile-processor";

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

export type StructuredTileProcessors = {
  orderedTiles: EarthResourceTile[];
  combinedColorTexture: WebGLTexture;
  tileProcessorLookup: Map<EarthResourceTile, SingleTileProcessors>;
  longitudeTileProcessors: LongitudeTileProcessors[];
};

export type LongitudeTileProcessors = {
  startLon: number;
  singleTileProcessors: SingleTileProcessors[];
};

export type SingleTileProcessors = {
  tile: EarthResourceTile;
  elevation: ElevationTileProcessor;
  color: ColorTileProcessor;
};

export type ProximityTilePrograms = {
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
