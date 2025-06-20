import { Vector4 } from "../common/numeric-types";
import type { RenderDimensions, ScreenRect } from "./dimension-types";
import {
  InternalFormat,
  TextureDefinition,
  TextureReadBufferInfo,
  TextureRenderProperties,
} from "./texture-definition";
import { drawToCanvas, readTexture } from "./texture-utils";

export enum SizeType {
  FitToViewport,
  FixedSize,
}

export type ProgramOutputTextureInfo = {
  attachmentIndex: number;
  numComponents: number;
};

export type ProgramOutputTextureInfos = {
  [name: string]: ProgramOutputTextureInfo;
};

export type TextureName<TTextures extends ProgramOutputTextureInfos> = Extract<keyof TTextures, string>;

export type ProgramOutputTextureDefinitions<TTextures extends ProgramOutputTextureInfos> = {
  [name in TextureName<TTextures>]: {
    attachmentIndex: TTextures[name]["attachmentIndex"];
    definition: TextureDefinition;
    clearColor?: Vector4;
  };
};

type ColorTextureInfos<TTextures extends ProgramOutputTextureInfos> = {
  [name in TextureName<TTextures>]: TextureInfo;
};

const defaultClearColor: Vector4 = [0, 0, 0, 0];

export interface RenderTarget {
  get framebuffer(): WebGLFramebuffer | null;

  getDrawingRect(viewportRect: ScreenRect): ScreenRect;

  clear(): void;
}

export class ScreenRenderTarget implements RenderTarget {
  private clearColor: Vector4 = defaultClearColor;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  public withClearColor(clearColor: Vector4): ScreenRenderTarget {
    this.clearColor = clearColor;
    return this;
  }

  public get framebuffer(): WebGLFramebuffer | null {
    return null;
  }

  public getDrawingRect(viewportRect: ScreenRect): ScreenRect {
    return viewportRect;
  }

  public clear() {
    this.gl.clearColor(...this.clearColor);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }
}

export enum DrawingRectBehavior {
  UseSuppliedViewport,
  UseTextureDimensions,
}

export const FitToViewportInitialSize: RenderDimensions = {
  width: 1,
  height: 1,
};

export class FramebufferRenderTarget<TTextures extends ProgramOutputTextureInfos> implements RenderTarget {
  private depthTextureInfo: TextureInfo | null = null;
  private drawingRectBehavior = DrawingRectBehavior.UseTextureDimensions;

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    public readonly framebuffer: WebGLFramebuffer,
    private readonly sizeType: SizeType,
    private colorTextureInfos: ColorTextureInfos<TTextures>,
    private dimensions: RenderDimensions
  ) {}

  public get textureDimensions(): RenderDimensions {
    return this.dimensions;
  }

  public static createFixedSize<TColorTextures extends ProgramOutputTextureInfos>(
    gl: WebGL2RenderingContext,
    dimensions: RenderDimensions,
    programOutputs: ProgramOutputTextureDefinitions<TColorTextures>
  ): FramebufferRenderTarget<TColorTextures> {
    return FramebufferRenderTarget.create(gl, SizeType.FixedSize, dimensions, programOutputs);
  }

  public static createFitToViewport<TColorTextures extends ProgramOutputTextureInfos>(
    gl: WebGL2RenderingContext,
    programOutputs: ProgramOutputTextureDefinitions<TColorTextures>
  ): FramebufferRenderTarget<TColorTextures> {
    return FramebufferRenderTarget.create(gl, SizeType.FitToViewport, FitToViewportInitialSize, programOutputs);
  }

  private static create<TColorTextures extends ProgramOutputTextureInfos>(
    gl: WebGL2RenderingContext,
    sizeType: SizeType,
    dimensions: RenderDimensions,
    programOutputs: ProgramOutputTextureDefinitions<TColorTextures>
  ): FramebufferRenderTarget<TColorTextures> {
    const framebuffer = gl.createFramebuffer();
    const infoEntries = Object.entries(programOutputs).map(([name, output]) => {
      const textureInfo = createColorTexture(
        gl,
        framebuffer,
        output.attachmentIndex,
        output.definition,
        dimensions,
        output.clearColor || defaultClearColor
      );
      return [name, textureInfo];
    });

    const colorTextureInfos = Object.fromEntries(infoEntries);
    setDrawBuffers(gl, framebuffer, colorTextureInfos);
    return new FramebufferRenderTarget(gl, framebuffer, sizeType, colorTextureInfos, dimensions);
  }

  public withDepthTexture(
    format: Extract<InternalFormat, "DEPTH_COMPONENT16" | "DEPTH_COMPONENT24">
  ): FramebufferRenderTarget<TTextures> {
    this.depthTextureInfo = createDepthTexture(this.gl, format, this.dimensions);
    attachDepthTexture(this.gl, this.framebuffer, this.depthTextureInfo.texture);
    return this;
  }

  public withExistingDepthTexture(depthTextureInfo: TextureInfo): FramebufferRenderTarget<TTextures> {
    this.depthTextureInfo = depthTextureInfo;
    attachDepthTexture(this.gl, this.framebuffer, this.depthTextureInfo.texture);
    return this;
  }

  public withDrawingRectBehavior(behavior: DrawingRectBehavior): FramebufferRenderTarget<TTextures> {
    this.drawingRectBehavior = behavior;
    return this;
  }

  public getDrawingRect(viewportRect: ScreenRect): ScreenRect {
    if (this.sizeType === SizeType.FixedSize) {
      if (this.drawingRectBehavior === DrawingRectBehavior.UseSuppliedViewport) {
        return viewportRect;
      } else {
        const { width, height } = this.dimensions;
        return { xOffset: 0, yOffset: 0, width, height };
      }
    }

    const { width, height } = viewportRect;
    this.setSize({ width, height });
    return { xOffset: 0, yOffset: 0, width, height };
  }

  private setSize(dimensions: RenderDimensions) {
    if (dimensions.width !== this.dimensions.width || dimensions.height !== this.dimensions.height) {
      this.dimensions = dimensions;

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
      if (this.depthTextureInfo !== null) {
        const definition = this.depthTextureInfo.definition;
        const texture = definition.createImmutable(this.gl, dimensions);
        this.depthTextureInfo = {
          definition,
          texture,
          attachmentIndex: this.depthTextureInfo.attachmentIndex,
          renderProperties: this.depthTextureInfo.renderProperties,
        };

        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.DEPTH_ATTACHMENT,
          this.gl.TEXTURE_2D,
          this.depthTextureInfo.texture,
          0
        );
      }

      const newColorTextureInfoEntries = Object.keys(this.colorTextureInfos).map((name) => {
        const oldTextureInfo = this.colorTextureInfos[name];
        const newTextureInfo = createColorTexture(
          this.gl,
          this.framebuffer,
          oldTextureInfo.attachmentIndex,
          oldTextureInfo.definition,
          dimensions,
          oldTextureInfo.clearColor || defaultClearColor
        );

        return [name, newTextureInfo];
      });

      this.colorTextureInfos = Object.fromEntries(newColorTextureInfoEntries);
      setDrawBuffers(this.gl, this.framebuffer, this.colorTextureInfos);
    }
  }

  public readColorTexture(name: TextureName<TTextures>, rect: ScreenRect): TextureReadBufferInfo {
    const textureInfo = this.colorTextureInfos[name];
    this.checkFramebufferStatus(true);

    return readTexture(
      this.gl,
      {
        framebuffer: this.framebuffer,
        attachmentIndex: textureInfo.attachmentIndex,
        texture: textureInfo.texture,
        textureDefinition: textureInfo.definition,
      },
      rect
    );
  }

  public checkFramebufferStatus(throwIfNotComplete: boolean): boolean {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    const isComplete = status === this.gl.FRAMEBUFFER_COMPLETE;
    if (!isComplete && throwIfNotComplete) {
      // https://james.darpinian.com/decoder/
      throw new Error(`Framebuffer not complete: ${status}`);
    }

    return isComplete;
  }

  public getColorTextureInfo(name: TextureName<TTextures>): TextureInfo {
    const textureInfo = this.colorTextureInfos[name];
    return textureInfo;
  }

  public clear() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);

    // Needs to work for different texture types: https://stackoverflow.com/a/75045836
    // three.js: https://github.com/mrdoob/three.js/blob/4562e8acd4f7cf1f7657630505dc2ac7e9f318d7/src/renderers/WebGLRenderer.js#L882-L929
    if (this.depthTextureInfo !== null) {
      this.gl.clearBufferfv(this.gl.DEPTH, 0, [1]);
    }

    Object.values(this.colorTextureInfos).forEach((info) => {
      const color = info.clearColor || [0, 0, 0, 0];
      if (info.definition.isIntegerFormat()) {
        if (info.definition.isFloatType()) {
          this.gl.clearBufferfv(this.gl.COLOR, info.attachmentIndex, color);
        } else if (info.definition.isIntType()) {
          this.gl.clearBufferiv(this.gl.COLOR, info.attachmentIndex, color);
        } else if (info.definition.isUnsignedIntType()) {
          this.gl.clearBufferuiv(this.gl.COLOR, info.attachmentIndex, color);
        } else {
          throw new Error(`Unexpected texture type: ${info.renderProperties.type}`);
        }
      } else {
        this.gl.drawBuffers([
          ...Array(info.attachmentIndex).fill(this.gl.NONE),
          this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex,
        ]);
        this.gl.clearColor(...color);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
    });

    // Clearing individual textures might have altered our draw buffer setting: restore it.
    setDrawBuffers(this.gl, this.framebuffer, this.colorTextureInfos);

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  public drawToCanvas(
    canvasElem: HTMLCanvasElement,
    textureName: TextureName<TTextures>,
    flipY: boolean,
    adjustment: (inputColor: Vector4) => Vector4 = ([r, g, b]) => [r, g, b, 255]
  ) {
    const { width, height } = this.dimensions;
    const readInfo = this.readColorTexture(textureName, { xOffset: 0, yOffset: 0, width, height });
    drawToCanvas(canvasElem, readInfo, flipY, adjustment);
  }

  public clean() {
    if (this.depthTextureInfo !== null) {
      this.gl.deleteTexture(this.depthTextureInfo.texture);
    }

    Object.values(this.colorTextureInfos).forEach((info) => this.gl.deleteTexture(info.texture));
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}

export type TextureInfo = {
  definition: TextureDefinition;
  texture: WebGLTexture;
  attachmentIndex: number;
  renderProperties: TextureRenderProperties;
  clearColor?: Vector4;
};

export function createDepthTexture(
  gl: WebGL2RenderingContext,
  format: Extract<InternalFormat, "DEPTH_COMPONENT16" | "DEPTH_COMPONENT24">,
  dimensions: RenderDimensions
): TextureInfo {
  const definition = new TextureDefinition(format);
  const texture = definition.createImmutable(gl, dimensions);
  const textureInfo: TextureInfo = {
    definition,
    texture,
    attachmentIndex: 0,
    renderProperties: definition.getRenderProperties(),
  };

  return textureInfo;
}

function attachDepthTexture(gl: WebGL2RenderingContext, framebuffer: WebGLFramebuffer, texture: WebGLTexture) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function createColorTexture(
  gl: WebGL2RenderingContext,
  framebuffer: WebGLFramebuffer,
  attachmentIndex: number,
  definition: TextureDefinition,
  dimensions: RenderDimensions,
  clearColor: Vector4
): TextureInfo {
  const textureInfo: TextureInfo = {
    definition,
    texture: definition.createImmutable(gl, dimensions),
    attachmentIndex,
    renderProperties: definition.getRenderProperties(),
    clearColor,
  };

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0 + attachmentIndex,
    gl.TEXTURE_2D,
    textureInfo.texture,
    0
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return textureInfo;
}

function setDrawBuffers<TTextures extends ProgramOutputTextureInfos>(
  gl: WebGL2RenderingContext,
  framebuffer: WebGLFramebuffer,
  infos: ColorTextureInfos<TTextures>
) {
  const buffers = Object.values(infos).map((info) => gl.COLOR_ATTACHMENT0 + info.attachmentIndex);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.drawBuffers(buffers);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
