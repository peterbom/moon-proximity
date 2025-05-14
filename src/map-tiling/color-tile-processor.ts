import { makeIdentity4 } from "../common/matrices";
import type { Vector2 } from "../common/numeric-types";
import { MultiViewContext } from "../webgl/context";
import type { ScreenRect } from "../webgl/dimension-types";
import { DrawOptions } from "../webgl/draw-options";
import {
  createTextureAttributeFullViewportVao,
  SimpleObjectOutputTextureInfos,
  TextureAttributeSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import { FramebufferRenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import { TextureDefinition } from "../webgl/texture-definition";
import { colorFileOriginalDimensions, getTileDimensions } from "./earth-resource-tiles";
import type { ColorTilePrograms } from "./tile-types";

const maxTextureWidth = 4096; // TODO: Query device limit
const colorTileDimensions = getTileDimensions(colorFileOriginalDimensions);

// We'll be creating a texture in which each tile is lined up horizontally.
// Use as much width as we can to keep within the limit.
const targetTextureWidth = Math.floor(maxTextureWidth / colorTileDimensions.width) * colorTileDimensions.width;
const targetTextureHeight = colorTileDimensions.height;

export class ColorTileProcessor {
  private sourceColorTexture: WebGLTexture | null = null;
  private readonly targetPixelRect: ScreenRect;

  constructor(
    private readonly context: MultiViewContext,
    private readonly programs: ColorTilePrograms,
    private readonly renderTarget: FramebufferRenderTarget<SimpleObjectOutputTextureInfos>,
    private readonly tileCount: number,
    private readonly orderedTileIndex: number
  ) {
    const targetTileWidth = targetTextureWidth / tileCount;
    this.targetPixelRect = {
      xOffset: orderedTileIndex * targetTileWidth,
      yOffset: 0,
      width: targetTileWidth,
      height: targetTextureHeight,
    };
  }

  public setSourceColorTexture(texture: WebGLTexture) {
    this.sourceColorTexture = texture;
    this.updateTargetColorTexture();
  }

  public getTextureCoords(tileX: number, tileY: number): Vector2 {
    const targetWidthPerTile = targetTextureWidth / this.tileCount;
    const [scaleX, scaleY] = [targetWidthPerTile / colorTileDimensions.width, 1];
    const [unscaledX, unscaledY] = [colorTileDimensions.width * this.orderedTileIndex + tileX, tileY];
    const [targetX, targetY] = [scaleX * unscaledX, scaleY * unscaledY];
    const [u, v] = [targetX / targetTextureWidth, targetY / targetTextureHeight];
    return [u, v];
  }

  private updateTargetColorTexture() {
    if (this.sourceColorTexture === null) {
      throw new Error("Source color texture must be set before updating the target color texture.");
    }

    const gl = this.context.gl;
    const fullViewportVao = createTextureAttributeFullViewportVao(
      gl,
      this.programs.textureAttributeSimpleObjectProgramInfo.attribSetters
    );

    const uniformValues: TextureAttributeSimpleObjectUniformValues = {
      u_matrix: makeIdentity4(),
      u_texture: this.sourceColorTexture,
    };

    const sceneRenderer = new SceneRenderer(gl);
    sceneRenderer.addSceneObject(
      uniformValues,
      this.programs.textureAttributeSimpleObjectProgramInfo,
      fullViewportVao,
      this.renderTarget,
      DrawOptions.default().depthTest(false).depthMask(false).cullFace(false)
    );

    sceneRenderer.render(this.targetPixelRect);
  }
}

export function createColorTileRenderTarget(
  gl: WebGL2RenderingContext
): FramebufferRenderTarget<SimpleObjectOutputTextureInfos> {
  const dimensions = { width: targetTextureWidth, height: targetTextureHeight };
  return FramebufferRenderTarget.createFixedSize<SimpleObjectOutputTextureInfos>(gl, dimensions, {
    color: {
      attachmentIndex: 0,
      definition: new TextureDefinition("RGB8").withMagFilter("LINEAR").withMinFilter("LINEAR"),
    },
  });
}
