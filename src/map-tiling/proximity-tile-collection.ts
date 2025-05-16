import { highlightClosestKmCount } from "../constants";
import { ProximityShapeData } from "../geo-shape-data";
import { ProximityTerrainData } from "../proximity-terrain-data";
import { MultiViewContext } from "../webgl/context";
import { createCombineHeightDistanceProgramInfo } from "../webgl/programs/combine-height-distance";
import { createProximityHeightMapProgramInfo } from "../webgl/programs/proximity-height-map";
import {
  createTextureAttributeSimpleObjectProgramInfo,
  SimpleObjectOutputTextureInfos,
} from "../webgl/programs/simple-object";
import { DrawingRectBehavior, FramebufferRenderTarget } from "../webgl/render-target";
import { TextureDefinition } from "../webgl/texture-definition";
import { createReadableTexture, ReadableTexture } from "../webgl/texture-utils";
import { ColorTileProcessor } from "./color-tile-processor";
import {
  colorFileOriginalDimensions,
  elevationFileOriginalDimensions,
  getGroupedOrderedTiles,
  getRectangularTileLayout,
  getTileDimensions,
  ImageElementTileDownloader,
} from "./earth-resource-tiles";
import { ElevationTileProcessor } from "./elevation-tile-processor";
import type { ColorTilePrograms, EarthResourceTile, ElevationTilePrograms, TileOutputTextures } from "./tile-types";
import { TiledTextureDimensions } from "./tiled-texture-dimensions";

const colorResourceDownloader = new ImageElementTileDownloader(
  "./resources/earth-texture/",
  "jpg",
  new TextureDefinition("RGB8").withMipmap(true),
  colorFileOriginalDimensions
);

const elevationResourceDownloader = new ImageElementTileDownloader(
  "./resources/earth-height/",
  "png",
  new TextureDefinition("R8"),
  elevationFileOriginalDimensions
);

const colorTileDimensions = getTileDimensions(colorFileOriginalDimensions);
const elevationTileDimensions = getTileDimensions(elevationFileOriginalDimensions);

export class ProximityTileCollection {
  private readonly elevationPrograms: ElevationTilePrograms;
  private readonly colorPrograms: ColorTilePrograms;

  constructor(private readonly context: MultiViewContext) {
    this.elevationPrograms = {
      proximityHeightMapProgramInfo: createProximityHeightMapProgramInfo(context.gl),
      combineHeightDistanceProgramInfo: createCombineHeightDistanceProgramInfo(context.gl),
    };

    this.colorPrograms = {
      textureAttributeSimpleObjectProgramInfo: createTextureAttributeSimpleObjectProgramInfo(context.gl),
    };
  }

  public async createTerrainData(proximityShapeData: ProximityShapeData): Promise<ProximityTerrainData> {
    const gl = this.context.gl;

    const groupedOrderedTiles = getGroupedOrderedTiles(proximityShapeData, highlightClosestKmCount);
    const rectangularTileLayout = getRectangularTileLayout(groupedOrderedTiles);

    // Create a single render target for the color texture. Each tile's texture will be rendered to
    // the appropriate portion of this shared texture.
    const colorTiledTextureDimensions = new TiledTextureDimensions(gl, colorTileDimensions, rectangularTileLayout);
    const colorTileRenderTarget = createColorTileRenderTarget(gl, colorTiledTextureDimensions);

    const tiles = groupedOrderedTiles.flat();

    const colorTileProcessors = new Map<EarthResourceTile, ColorTileProcessor>();
    const elevationTileProcessors = new Map<EarthResourceTile, ElevationTileProcessor>();
    const colorTextures = new Map<EarthResourceTile, WebGLTexture>();
    const elevationTextures = new Map<EarthResourceTile, ReadableTexture>();

    tiles.forEach((tile) => {
      colorTileProcessors.set(
        tile,
        new ColorTileProcessor(this.context, this.colorPrograms, colorTiledTextureDimensions, tile, colorTileDimensions)
      );
      elevationTileProcessors.set(
        tile,
        new ElevationTileProcessor(
          this.context,
          this.elevationPrograms,
          tile,
          proximityShapeData,
          elevationTileDimensions
        )
      );
    });

    // Start downloading tile data but continue processing.
    const colorTilesPromise = colorResourceDownloader.download(gl, tiles, (tile, texture) => {
      colorTextures.set(tile, texture);
      const processor = colorTileProcessors.get(tile)!;
      processor.updateTargetColorTexture(texture, colorTileRenderTarget);
    });

    // Download and store the elevation data.
    const elevationTilesPromise = elevationResourceDownloader.download(gl, tiles, (tile, texture, definition) => {
      elevationTextures.set(tile, createReadableTexture(gl, definition, texture));
      const processor = elevationTileProcessors.get(tile)!;
      processor.combineProximityAndElevation(texture);
    });

    // While resources are downloading, update buffer data that depends on the proximity shape
    [...elevationTileProcessors.values()].forEach((p) => p.updateProximityHeightMapTexture());

    // Wait for all downloading and processing to complete to ensure output textures are ready.
    await Promise.all([colorTilesPromise, elevationTilesPromise]);

    const tileOutputTextures = new Map<EarthResourceTile, TileOutputTextures>();
    tiles.forEach((tile) => {
      const elevations = elevationTextures.get(tile)!;
      const elevationProcessor = elevationTileProcessors.get(tile)!;
      const proximities = elevationProcessor.createProximityReadableTexture();
      const distancesAboveMin = elevationProcessor.createDistanceAboveMinReadableTexture();
      const unixSeconds = elevationProcessor.createUnixSecondsReadableTexture();
      tileOutputTextures.set(tile, {
        proximities,
        elevations,
        distancesAboveMin,
        unixSeconds,
      });
    });

    // The source color textures are no longer being used, so dispose of them.
    colorTextures.forEach((texture) => gl.deleteTexture(texture));

    const colorTextureInfo = colorTileRenderTarget.getColorTextureInfo("color");
    const colorTexture = createReadableTexture(gl, colorTextureInfo.definition, colorTextureInfo.texture);

    return new ProximityTerrainData(
      gl,
      elevationTileDimensions,
      colorTexture,
      colorTiledTextureDimensions,
      tileOutputTextures,
      groupedOrderedTiles
    );
  }
}

function createColorTileRenderTarget(
  gl: WebGL2RenderingContext,
  tiledTextureDimensions: TiledTextureDimensions
): FramebufferRenderTarget<SimpleObjectOutputTextureInfos> {
  return FramebufferRenderTarget.createFixedSize<SimpleObjectOutputTextureInfos>(
    gl,
    tiledTextureDimensions.targetTextureDimensions,
    {
      color: {
        attachmentIndex: 0,
        definition: new TextureDefinition("RGB8").withMagFilter("LINEAR").withMinFilter("LINEAR").withMipmap(true),
      },
    }
  ).withDrawingRectBehavior(DrawingRectBehavior.UseSuppliedViewport);
}
