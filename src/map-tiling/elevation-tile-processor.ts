import type { Vector2 } from "../common/numeric-types";
import { ProximityShapeData } from "../geo-shape-data";
import { MultiViewContext } from "../webgl/context";
import type { ScreenRect } from "../webgl/dimension-types";
import { DrawOptions } from "../webgl/draw-options";
import {
  CombineHeightDistanceUniformValues,
  CombineHeightOutputTextureInfos,
  createCombineHeightDistanceVao,
} from "../webgl/programs/combine-height-distance";
import {
  createProximityHeightMapVao,
  ProximityHeightMapOutputTextureInfos,
  ProximityHeightMapUniformValues,
} from "../webgl/programs/proximity-height-map";
import { FramebufferRenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import { TextureDefinition } from "../webgl/texture-definition";
import { ReadableTexture, readTexture } from "../webgl/texture-utils";
import {
  elevationFileOriginalDimensions,
  getTileDimensions,
  latitudeRadiansPerTile,
  longitudeRadiansPerTile,
} from "./earth-resource-tiles";
import type { EarthResourceTile, ProximityTilePrograms, TileProximityValues } from "./tile-types";

const elevationTileDimensions = getTileDimensions(elevationFileOriginalDimensions);
const elevationTilePixelRect: ScreenRect = {
  xOffset: 0,
  yOffset: 0,
  width: elevationTileDimensions.width,
  height: elevationTileDimensions.height,
};

// https://visibleearth.nasa.gov/images/73934/topography
// "Data in these images were scaled 0-6400 meters"
const elevationScaleFactor = 6400.0;

export class ElevationTileProcessor {
  private readonly renderTargets: TileTerrainRenderTargets;
  private elevationTexture: ReadableTexture | null = null;

  constructor(
    private readonly context: MultiViewContext,
    private readonly programs: ProximityTilePrograms,
    private readonly tile: EarthResourceTile,
    private readonly proximityShapeData: ProximityShapeData
  ) {
    const gl = context.gl;
    this.renderTargets = createTileTerrainRenderTargets(gl);
  }

  public updateProximityHeightMapTexture() {
    const gl = this.context.gl;
    const proximityHeightMapVao = createProximityHeightMapVao(
      gl,
      this.programs.proximityHeightMapProgramInfo.attribSetters,
      this.proximityShapeData
    );

    const uniformValues: ProximityHeightMapUniformValues = {
      u_tileCenterGeodeticCoord: [
        this.tile.startLon + longitudeRadiansPerTile / 2,
        this.tile.startLat - latitudeRadiansPerTile / 2,
      ],
      u_scale: [2 / longitudeRadiansPerTile, 2 / latitudeRadiansPerTile],
    };

    const sceneRenderer = new SceneRenderer(gl);
    sceneRenderer.addSceneObject(
      uniformValues,
      this.programs.proximityHeightMapProgramInfo,
      proximityHeightMapVao,
      this.renderTargets.proximityHeightMapRenderTarget,
      DrawOptions.default().depthTest(false).depthMask(false).cullFace(false)
    );

    sceneRenderer.render(elevationTilePixelRect);
  }

  public setElevationTexture(texture: ReadableTexture) {
    this.elevationTexture = texture;
  }

  public combineProximityAndElevation() {
    if (this.elevationTexture === null) {
      throw new Error("Elevation texture must be set before combining with proximity data.");
    }

    const gl = this.context.gl;

    const combineHeightDistanceVao = createCombineHeightDistanceVao(
      gl,
      this.programs.combineHeightDistanceProgramInfo.attribSetters
    );

    const uniformValues: CombineHeightDistanceUniformValues = {
      u_distanceAboveMinTexture:
        this.renderTargets.proximityHeightMapRenderTarget.getColorTextureInfo("distanceAboveMin").texture,
      u_elevationTexture: this.elevationTexture,
      u_elevationScaleFactor: elevationScaleFactor,
    };

    const sceneRenderer = new SceneRenderer(gl);
    sceneRenderer.addSceneObject(
      uniformValues,
      this.programs.combineHeightDistanceProgramInfo,
      combineHeightDistanceVao,
      this.renderTargets.combineHeightRenderTarget,
      DrawOptions.default().depthTest(false).depthMask(false).cullFace(false)
    );

    sceneRenderer.render(elevationTilePixelRect);
  }

  public getProximityValues(): TileProximityValues {
    const { width, height } = elevationTileDimensions;
    const rect: ScreenRect = { xOffset: 0, yOffset: 0, width, height };

    const bufferInfo = this.renderTargets.combineHeightRenderTarget.readColorTexture("proximity", rect);
    const data = bufferInfo.buffer as Float32Array; // TODO: Pull type from texture definition?

    return { data, width, height };
  }

  public getElevation(dataTexCoords: Vector2): number {
    if (this.elevationTexture === null) {
      throw new Error("Elevation texture must be set before reading it.");
    }

    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = readTexture(this.context.gl, this.elevationTexture, rect);

    return (bufferInfo.buffer[0] / 255) * elevationScaleFactor;
  }

  public getLatLong(dataTexCoords: Vector2): { long: number; lat: number } {
    const [x, y] = dataTexCoords;
    const long = this.tile.startLon + (x / elevationTileDimensions.width) * longitudeRadiansPerTile;
    const lat = this.tile.startLat - (y / elevationTileDimensions.height) * latitudeRadiansPerTile;
    return { long, lat };
  }

  public getDistanceAboveMin(dataTexCoords: Vector2): number {
    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = this.renderTargets.proximityHeightMapRenderTarget.readColorTexture("distanceAboveMin", rect);

    return bufferInfo.buffer[0];
  }

  public getUnixSeconds(dataTexCoords: Vector2): number {
    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = this.renderTargets.proximityHeightMapRenderTarget.readColorTexture("unixSeconds", rect);

    return bufferInfo.buffer[0];
  }
}

function createTileTerrainRenderTargets(gl: WebGL2RenderingContext): TileTerrainRenderTargets {
  const proximityHeightMapRenderTarget = FramebufferRenderTarget.createFixedSize<ProximityHeightMapOutputTextureInfos>(
    gl,
    elevationTileDimensions,
    {
      distanceAboveMin: {
        attachmentIndex: 0,
        definition: new TextureDefinition("R32F").withMagFilter("NEAREST").withMinFilter("NEAREST"),
      },
      unixSeconds: {
        attachmentIndex: 1,
        definition: new TextureDefinition("R32F").withMagFilter("NEAREST").withMinFilter("NEAREST"),
      },
    }
  );

  const combineHeightRenderTarget = FramebufferRenderTarget.createFixedSize<CombineHeightOutputTextureInfos>(
    gl,
    elevationTileDimensions,
    {
      proximity: {
        attachmentIndex: 0,
        definition: new TextureDefinition("R32F").withMagFilter("NEAREST").withMinFilter("NEAREST"),
      },
    }
  );

  return {
    proximityHeightMapRenderTarget,
    combineHeightRenderTarget,
  };
}

type TileTerrainRenderTargets = {
  proximityHeightMapRenderTarget: FramebufferRenderTarget<ProximityHeightMapOutputTextureInfos>;
  combineHeightRenderTarget: FramebufferRenderTarget<CombineHeightOutputTextureInfos>;
};
