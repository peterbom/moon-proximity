import type { Vector2 } from "../common/numeric-types";
import { elevationScaleFactor } from "../constants";
import { ProximityShapeData } from "../geo-shape-data";
import { MultiViewContext } from "../webgl/context";
import type { ScreenRect } from "../webgl/dimension-types";
import { DrawOptions } from "../webgl/draw-options";
import { VertexAttribsInfo } from "../webgl/program-types";
import {
  CombineHeightDistanceUniformValues,
  CombineHeightOutputTextureInfos,
  createCombineHeightDistanceVao,
} from "../webgl/programs/combine-height-distance";
import {
  createProximityHeightMapVao,
  ProximityHeightMapAttribValues,
  ProximityHeightMapOutputTextureInfos,
  ProximityHeightMapUniformValues,
} from "../webgl/programs/proximity-height-map";
import { FramebufferRenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import { TextureDefinition } from "../webgl/texture-definition";
import { createReadableTexture, ReadableTexture } from "../webgl/texture-utils";
import { latitudeRadiansPerTile, longitudeRadiansPerTile } from "./earth-resource-tiles";
import type { EarthResourceTile, ElevationTilePrograms, ImageDimensions } from "./tile-types";

export class ElevationTileProcessor {
  private readonly renderTargets: TileTerrainRenderTargets;
  private readonly targetPixelRect: ScreenRect;

  constructor(
    private readonly context: MultiViewContext,
    private readonly programs: ElevationTilePrograms,
    private readonly tile: EarthResourceTile,
    private readonly proximityShapeData: ProximityShapeData,
    tileDimensions: ImageDimensions
  ) {
    const gl = context.gl;
    this.targetPixelRect = {
      xOffset: 0,
      yOffset: 0,
      width: tileDimensions.width,
      height: tileDimensions.height,
    };
    this.renderTargets = createTileTerrainRenderTargets(gl, this.targetPixelRect);
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

    sceneRenderer.render(this.targetPixelRect);

    gl.deleteVertexArray(proximityHeightMapVao.vao);
  }

  public combineProximityAndElevation(elevationTexture: WebGLTexture) {
    const gl = this.context.gl;

    const combineHeightDistanceVao = createCombineHeightDistanceVao(
      gl,
      this.programs.combineHeightDistanceProgramInfo.attribSetters
    );

    const uniformValues: CombineHeightDistanceUniformValues = {
      u_distanceAboveMinTexture:
        this.renderTargets.proximityHeightMapRenderTarget.getColorTextureInfo("distanceAboveMin").texture,
      u_elevationTexture: elevationTexture,
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

    sceneRenderer.render(this.targetPixelRect);

    gl.deleteVertexArray(combineHeightDistanceVao.vao);
  }

  public createProximityReadableTexture(): ReadableTexture {
    const textureInfo = this.renderTargets.combineHeightRenderTarget.getColorTextureInfo("proximity");
    return createReadableTexture(this.context.gl, textureInfo.definition, textureInfo.texture);
  }

  public createDistanceAboveMinReadableTexture(): ReadableTexture {
    const textureInfo = this.renderTargets.proximityHeightMapRenderTarget.getColorTextureInfo("distanceAboveMin");
    return createReadableTexture(this.context.gl, textureInfo.definition, textureInfo.texture);
  }

  public createUnixSecondsReadableTexture(): ReadableTexture {
    const textureInfo = this.renderTargets.proximityHeightMapRenderTarget.getColorTextureInfo("unixSeconds");
    return createReadableTexture(this.context.gl, textureInfo.definition, textureInfo.texture);
  }
}

function createTileTerrainRenderTargets(
  gl: WebGL2RenderingContext,
  targetPixelRect: ScreenRect
): TileTerrainRenderTargets {
  const proximityHeightMapRenderTarget = FramebufferRenderTarget.createFixedSize<ProximityHeightMapOutputTextureInfos>(
    gl,
    targetPixelRect,
    {
      distanceAboveMin: {
        attachmentIndex: 0,
        definition: new TextureDefinition("R32F").withMagFilter("NEAREST").withMinFilter("NEAREST"),
        clearColor: [10000, 0, 0, 0],
      },
      unixSeconds: {
        attachmentIndex: 1,
        definition: new TextureDefinition("R32F").withMagFilter("NEAREST").withMinFilter("NEAREST"),
      },
    }
  );

  const combineHeightRenderTarget = FramebufferRenderTarget.createFixedSize<CombineHeightOutputTextureInfos>(
    gl,
    targetPixelRect,
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
