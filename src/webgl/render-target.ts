import type { RenderDimensions, ScreenRect } from "./dimension-types";
import { TextureDefinition, TextureReadBufferInfo } from "./texture-definition";

export enum SizeType {
  FitToViewport,
  FixedSize,
}

export interface RenderTarget {
  get framebuffer(): WebGLFramebuffer | null;

  getDrawingRect(viewportRect: ScreenRect): ScreenRect;
}

export class ScreenRenderTarget implements RenderTarget {
  public get framebuffer(): WebGLFramebuffer | null {
    return null;
  }

  public getDrawingRect(viewportRect: ScreenRect): ScreenRect {
    return viewportRect;
  }
}

export class FramebufferRenderTarget implements RenderTarget {
  public readonly framebuffer: WebGLFramebuffer;
  private depthTextureInfo: TextureInfo | null = null;
  private colorTextureInfos: TextureInfo[] = [];

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly sizeType: SizeType,
    private dimensions: RenderDimensions
  ) {
    this.framebuffer = gl.createFramebuffer();
  }

  public static createFixedSize(gl: WebGL2RenderingContext, dimensions: RenderDimensions): FramebufferRenderTarget {
    return new FramebufferRenderTarget(gl, SizeType.FixedSize, dimensions);
  }

  public static createFitToViewport(gl: WebGL2RenderingContext): FramebufferRenderTarget {
    return new FramebufferRenderTarget(gl, SizeType.FitToViewport, { width: 1, height: 1 });
  }

  public withDepthTexture(): FramebufferRenderTarget {
    this.depthTextureInfo = this.createTextureInfo(new TextureDefinition("DEPTH_COMPONENT16"), 0);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.DEPTH_ATTACHMENT,
      this.gl.TEXTURE_2D,
      this.depthTextureInfo.texture,
      0
    );
    return this;
  }

  public withColorTexture(index: number, definition: TextureDefinition): FramebufferRenderTarget {
    const textureInfo = this.createTextureInfo(definition, index);
    this.colorTextureInfos.push(textureInfo);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.colorTextureInfos.forEach((info) => {
      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex,
        this.gl.TEXTURE_2D,
        info.texture,
        0
      );
    });
    this.gl.drawBuffers(this.colorTextureInfos.map((info) => this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex));
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return this;
  }

  public getDrawingRect(viewportRect: ScreenRect): ScreenRect {
    if (this.sizeType === SizeType.FixedSize) {
      const { width, height } = this.dimensions;
      return { xOffset: 0, yOffset: 0, width, height };
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
        this.depthTextureInfo = this.createTextureInfo(this.depthTextureInfo.definition, 0);
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.DEPTH_ATTACHMENT,
          this.gl.TEXTURE_2D,
          this.depthTextureInfo.texture,
          0
        );
      }

      const oldColorTextureInfos = this.colorTextureInfos;
      this.colorTextureInfos = [];
      oldColorTextureInfos.forEach((info) => {
        const textureInfo = this.createTextureInfo(info.definition, info.attachmentIndex);
        this.colorTextureInfos.push(textureInfo);
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex,
          this.gl.TEXTURE_2D,
          info.texture,
          0
        );
      });

      this.gl.drawBuffers(this.colorTextureInfos.map((info) => this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex));
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
  }

  public readColorTexture(attachmentIndex: number, rect: ScreenRect): TextureReadBufferInfo {
    const textureInfo = this.colorTextureInfos.find((info) => info.attachmentIndex === attachmentIndex);
    if (!textureInfo) {
      throw new Error(`Texture with attachment index ${attachmentIndex} not found`);
    }

    const readBufferInfo = textureInfo.definition.createReadBuffer(rect);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0 + textureInfo.attachmentIndex);
    this.gl.readPixels(
      rect.xOffset,
      rect.yOffset,
      rect.width,
      rect.height,
      readBufferInfo.format,
      readBufferInfo.type,
      readBufferInfo.buffer
    );
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    return readBufferInfo;
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

  private createTextureInfo(definition: TextureDefinition, attachmentIndex: number): TextureInfo {
    return {
      definition,
      texture: definition.createImmutable(this.gl, this.dimensions),
      attachmentIndex,
    };
  }
}

type TextureInfo = {
  definition: TextureDefinition;
  texture: WebGLTexture;
  attachmentIndex: number;
};
