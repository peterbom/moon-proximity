import { highlightClosestKmCount } from "../constants";
import { ProximityShapeData } from "../geo-shape-data";
import { MultiViewContext } from "../webgl/context";
import { createCombineHeightDistanceProgramInfo } from "../webgl/programs/combine-height-distance";
import { createProximityHeightMapProgramInfo } from "../webgl/programs/proximity-height-map";
import { createTextureAttributeSimpleObjectProgramInfo } from "../webgl/programs/simple-object";
import { TextureDefinition } from "../webgl/texture-definition";
import { createReadableTexture } from "../webgl/texture-utils";
import { ColorTileProcessor, createColorTileRenderTarget } from "./color-tile-processor";
import {
  colorFileOriginalDimensions,
  elevationFileOriginalDimensions,
  getEarthResourceTile,
  ImageElementTileDownloader,
} from "./earth-resource-tiles";
import { ElevationTileProcessor } from "./elevation-tile-processor";
import type {
  ColorTilePrograms,
  EarthResourceTile,
  LongitudeTileProcessors,
  ProximityTilePrograms,
  SingleTileProcessors,
  StructuredTileProcessors,
} from "./tile-types";

const colorResourceDownloader = new ImageElementTileDownloader(
  "/images/moon-proximity/earth-texture/",
  "jpg",
  new TextureDefinition("RGB8").withMipmap(true),
  colorFileOriginalDimensions
);

const elevationResourceDownloader = new ImageElementTileDownloader(
  "/images/moon-proximity/earth-height/",
  "png",
  new TextureDefinition("R8"),
  elevationFileOriginalDimensions
);

export class ProximityTileCollection {
  private readonly proximityPrograms: ProximityTilePrograms;
  private readonly colorPrograms: ColorTilePrograms;

  constructor(private readonly context: MultiViewContext) {
    this.proximityPrograms = {
      proximityHeightMapProgramInfo: createProximityHeightMapProgramInfo(context.gl),
      combineHeightDistanceProgramInfo: createCombineHeightDistanceProgramInfo(context.gl),
    };

    this.colorPrograms = {
      textureAttributeSimpleObjectProgramInfo: createTextureAttributeSimpleObjectProgramInfo(context.gl),
    };
  }

  public async createStructuredTileProcessors(
    proximityShapeData: ProximityShapeData
  ): Promise<StructuredTileProcessors> {
    const structuredTileProcessors = getStructuredTileProcessors(
      this.context,
      this.proximityPrograms,
      this.colorPrograms,
      proximityShapeData
    );

    const singleTileProcessors = structuredTileProcessors.longitudeTileProcessors.flatMap(
      (t) => t.singleTileProcessors
    );
    const tiles = singleTileProcessors.map((p) => p.tile);

    const gl = this.context.gl;

    // Start downloading tile data but continue processing.
    const colorTilesPromise = colorResourceDownloader.download(gl, tiles, (tile, texture) => {
      const processor = structuredTileProcessors.tileProcessorLookup.get(tile);
      if (!processor) {
        console.warn("Color texture data downloaded after tiles cleared.");
        return;
      }

      processor.color.setSourceColorTexture(texture);
    });

    // Download and store the elevation data.
    const elevationTilesPromise = elevationResourceDownloader.download(gl, tiles, (tile, texture, definition) => {
      const processor = structuredTileProcessors.tileProcessorLookup.get(tile);
      if (!processor) {
        console.warn("Elevation data downloaded after tiles cleared.");
        return;
      }

      const readableTexture = createReadableTexture(gl, definition, texture);
      processor.elevation.setElevationTexture(readableTexture);
      processor.elevation.combineProximityAndElevation();
    });

    // While resources are downloading, update buffer data that depends on the proximity shape
    singleTileProcessors.forEach((p) => p.elevation.updateProximityHeightMapTexture());

    await Promise.all([colorTilesPromise, elevationTilesPromise]);

    // By now all resources should be downloaded and processed.
    return structuredTileProcessors;
  }
}

function getStructuredTileProcessors(
  context: MultiViewContext,
  proximityPrograms: ProximityTilePrograms,
  colorPrograms: ColorTilePrograms,
  shapeData: ProximityShapeData
): StructuredTileProcessors {
  const tiles = new Map<number, { tile: EarthResourceTile; time: number }>();
  shapeData.distancesAboveMin.forEach((distanceAboveMin, i) => {
    if (distanceAboveMin < highlightClosestKmCount) {
      const coords = shapeData.geodeticCoords[i];
      const time = shapeData.unixSeconds[i];
      const tile = getEarthResourceTile(coords);
      if (!tiles.has(tile.index)) {
        tiles.set(tile.index, { tile, time });
      }
    }
  });

  // Sort by descending time. The path goes from East to West by time; we want to order tiles
  // from West to East.
  const orderedTiles = [...tiles.values()].sort((a, b) => b.time - a.time).map((x) => x.tile);

  const colorTileRenderTarget = createColorTileRenderTarget(context.gl);

  const firstTile = orderedTiles[0];
  const firstTileProcessors: SingleTileProcessors = {
    tile: firstTile,
    elevation: new ElevationTileProcessor(context, proximityPrograms, firstTile, shapeData),
    color: new ColorTileProcessor(context, colorPrograms, colorTileRenderTarget, orderedTiles.length, 0),
  };

  const longitudeTileProcessors: LongitudeTileProcessors[] = [
    { singleTileProcessors: [firstTileProcessors], startLon: firstTile.startLon },
  ];

  for (let i = 1; i < orderedTiles.length; i++) {
    const tile = orderedTiles[i];
    const tileProcessors: SingleTileProcessors = {
      tile,
      elevation: new ElevationTileProcessor(context, proximityPrograms, tile, shapeData),
      color: new ColorTileProcessor(context, colorPrograms, colorTileRenderTarget, orderedTiles.length, i),
    };

    const lastLongitudeProcessors = longitudeTileProcessors[longitudeTileProcessors.length - 1];
    if (tile.startLon === lastLongitudeProcessors.startLon) {
      lastLongitudeProcessors.singleTileProcessors.push(tileProcessors);
    } else {
      longitudeTileProcessors.push({ singleTileProcessors: [tileProcessors], startLon: tile.startLon });
    }
  }

  // Sort each set of tiles at the same longitude by latitude, North to South. I.e. descending
  // latitude.
  longitudeTileProcessors.forEach((p) => p.singleTileProcessors.sort((a, b) => b.tile.startLat - a.tile.startLat));

  const combinedColorTexture = colorTileRenderTarget.getColorTextureInfo("color").texture;

  // Rearrange the tile processor structure to allow easy color processor lookup by tile.
  const singleTileProcessors = longitudeTileProcessors.flatMap((p) => p.singleTileProcessors);
  const tileProcessorLookup = new Map(singleTileProcessors.map((p) => [p.tile, p]));

  return { orderedTiles, longitudeTileProcessors, combinedColorTexture, tileProcessorLookup };
}
