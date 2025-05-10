import type { VertexAttribsInfo } from "./attributes-types";
import type { ScreenRect } from "./dimension-types";
import { DrawOptions } from "./draw-options";
import type { AttribValues, ProgramInfo, UniformValues } from "./program-types";
import { RenderTarget } from "./render-target";
import type { DrawMode } from "./shape-types";
import { setUniforms, UniformCollector } from "./uniforms";

export class SceneRenderer {
  private readonly sceneObjectGroups: SceneObjectGroup[] = [];

  private lastUsedProgram: WebGLProgram | null = null;
  private lastUsedVao: WebGLVertexArrayObject | null = null;
  private lastSceneContext: object | null = null;
  private lastSceneUniforms: object | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  public render(viewportRect: ScreenRect) {
    const clearedRenderTargets = new Set<RenderTarget>();
    this.reset();
    this.sceneObjectGroups.forEach((group) => {
      const renderTarget = group.renderTarget;
      const drawingRect = renderTarget.getDrawingRect(viewportRect);

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, renderTarget.framebuffer);
      group.setProgram();
      group.setSceneContext(drawingRect);
      group.setSceneUniforms();

      this.gl.enable(this.gl.SCISSOR_TEST);
      this.gl.viewport(drawingRect.xOffset, drawingRect.yOffset, drawingRect.width, drawingRect.height);
      this.gl.scissor(drawingRect.xOffset, drawingRect.yOffset, drawingRect.width, drawingRect.height);
      if (!clearedRenderTargets.has(renderTarget)) {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        clearedRenderTargets.add(renderTarget);
      }

      group.drawOptions.setOptions(this.gl);
      group.sceneObjects.forEach((obj) => {
        obj.setObjectUniforms();
        obj.setVao();
        obj.drawVertices();
      });

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    });
  }

  public addSceneObjects<
    TObj,
    TContext extends object,
    TAttribValues extends AttribValues,
    TUniformValues extends UniformValues
  >(
    objects: TObj[],
    uniformCollector: UniformCollector<TUniformValues, Extract<keyof TUniformValues, string>, TContext, TObj>,
    programInfo: ProgramInfo<TAttribValues, TUniformValues>,
    vaoInfo: VertexAttribsInfo<TAttribValues>,
    renderTarget: RenderTarget,
    drawOptions: DrawOptions
  ) {
    const renderer = this;
    const sceneObjects = objects.map<ObjectRenderInfo>((obj) => ({
      setVao: () => renderer.setVao(vaoInfo),
      setObjectUniforms: () => renderer.setObjectUniforms(programInfo, uniformCollector, obj),
      drawVertices: () => drawVertices(renderer.gl, vaoInfo),
    }));

    this.sceneObjectGroups.push({
      sceneObjects,
      renderTarget,
      drawOptions,
      setProgram: () => renderer.setProgramInfo(programInfo),
      setSceneContext: (drawingRect: ScreenRect) =>
        renderer.setSceneContext((rect) => uniformCollector.getContext(rect), drawingRect),
      setSceneUniforms: () => renderer.setSceneUniforms(programInfo, uniformCollector),
    });
  }

  private reset() {
    this.lastUsedProgram = null;
    this.lastUsedVao = null;
    this.lastSceneContext = null;
    this.lastSceneUniforms = null;
  }

  private setProgramInfo<TAttribValues extends AttribValues, TUniformValues extends UniformValues>(
    programInfo: ProgramInfo<TAttribValues, TUniformValues>
  ) {
    if (this.lastUsedProgram !== programInfo.program) {
      this.gl.useProgram(programInfo.program);
      this.lastUsedProgram = programInfo.program;
      this.lastUsedVao = null;
      this.lastSceneContext = null;
      this.lastSceneUniforms = null;
    }
  }

  private setSceneContext<TContext extends object>(
    getSceneContext: (drawingRect: ScreenRect) => TContext,
    drawingRect: ScreenRect
  ) {
    if (this.lastSceneContext === null) {
      this.lastSceneContext = getSceneContext(drawingRect);
      this.lastSceneUniforms = null;
    }
  }

  private setSceneUniforms<
    TObj,
    TContext extends object,
    TAttribValues extends AttribValues,
    TUniformValues extends UniformValues
  >(
    programInfo: ProgramInfo<TAttribValues, TUniformValues>,
    uniformCollector: UniformCollector<TUniformValues, Extract<keyof TUniformValues, string>, TContext, TObj>
  ) {
    const context = this.lastSceneContext as TContext;
    if (context === null) {
      throw new Error("Cached scene context is not expected to be null when setting scene uniforms");
    }

    if (this.lastSceneUniforms === null) {
      const sceneUniformValues = uniformCollector.getPerSceneUniforms(context);
      setUniforms(programInfo.uniformSetters, sceneUniformValues);
      this.lastSceneUniforms = sceneUniformValues;
    }
  }

  private setObjectUniforms<
    TObj,
    TContext extends object,
    TAttribValues extends AttribValues,
    TUniformValues extends UniformValues
  >(
    programInfo: ProgramInfo<TAttribValues, TUniformValues>,
    uniformCollector: UniformCollector<TUniformValues, Extract<keyof TUniformValues, string>, TContext, TObj>,
    obj: TObj
  ) {
    const context = this.lastSceneContext as TContext;
    if (context === null) {
      throw new Error("Cached scene context is not expected to be null when setting object uniforms");
    }

    const objectUniformValues = uniformCollector.getPerObjectUniforms(context, obj);
    setUniforms(programInfo.uniformSetters, objectUniformValues);
  }

  private setVao<TAttribValues extends AttribValues>(vertexAttribsInfo: VertexAttribsInfo<TAttribValues>) {
    if (this.lastUsedVao !== vertexAttribsInfo.vao) {
      this.gl.bindVertexArray(vertexAttribsInfo.vao);
      this.lastUsedVao = vertexAttribsInfo.vao;
    }
  }
}

type SceneObjectGroup = {
  sceneObjects: ObjectRenderInfo[];
  renderTarget: RenderTarget;
  drawOptions: DrawOptions;
  setProgram: () => void;
  setSceneContext: (drawingRect: ScreenRect) => void;
  setSceneUniforms: () => void;
};

type ObjectRenderInfo = {
  setVao: () => void;
  setObjectUniforms: () => void;
  drawVertices: () => void;
};

const drawModeLookup: { [mode in DrawMode]: (gl: WebGL2RenderingContext) => GLenum } = {
  Triangles: (gl) => gl.TRIANGLES,
  Lines: (gl) => gl.LINES,
};

function drawVertices<T extends AttribValues>(gl: WebGL2RenderingContext, vertexAttribsInfo: VertexAttribsInfo<T>) {
  const mode = drawModeLookup[vertexAttribsInfo.mode](gl);
  if (vertexAttribsInfo.indicesValue !== null) {
    gl.drawElements(mode, vertexAttribsInfo.indicesValue.length, gl.UNSIGNED_SHORT, 0);
  } else {
    gl.drawArrays(mode, 0, vertexAttribsInfo.entryCount);
  }
}
