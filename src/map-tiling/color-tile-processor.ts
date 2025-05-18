import { makeIdentity4 } from "../common/matrices";
import { MultiViewContext } from "../webgl/context";
import type { ScreenRect } from "../webgl/dimension-types";
import { DrawOptions } from "../webgl/draw-options";
import {
  createTextureAttributeFullViewportVao,
  TextureAttributeSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import { RenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import type { ColorTilePrograms } from "./tile-types";

export class ColorTileProcessor {
  constructor(
    private readonly context: MultiViewContext,
    private readonly programs: ColorTilePrograms,
    private readonly targetPixelRect: ScreenRect
  ) {}

  public updateTargetColorTexture(sourceColorTexture: WebGLTexture, renderTarget: RenderTarget) {
    const gl = this.context.gl;
    const fullViewportVao = createTextureAttributeFullViewportVao(
      gl,
      this.programs.textureAttributeSimpleObjectProgramInfo.attribSetters
    );

    const uniformValues: TextureAttributeSimpleObjectUniformValues = {
      u_matrix: makeIdentity4(),
      u_texture: sourceColorTexture,
    };

    const sceneRenderer = new SceneRenderer(gl);
    sceneRenderer.addSceneObject(
      uniformValues,
      this.programs.textureAttributeSimpleObjectProgramInfo,
      fullViewportVao,
      renderTarget,
      DrawOptions.default().depthTest(false).depthMask(false).cullFace(false)
    );

    sceneRenderer.render(this.targetPixelRect);

    gl.deleteVertexArray(fullViewportVao.vao);
  }
}
