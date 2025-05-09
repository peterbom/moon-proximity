import { RenderDimensions, ScreenRect } from "./dimension-types";
import { TextureDefinition, TextureReadBuffer, TextureReadBufferInfo } from "./texture-definition";

abstract class RenderTarget {
  public abstract get framebuffer(): WebGLFramebuffer | null;
}

export class ScreenRenderTarget extends RenderTarget {
  public override get framebuffer(): WebGLFramebuffer | null {
    return null;
  }
}

export class FramebufferRenderTarget extends RenderTarget {
  public readonly framebuffer: WebGLFramebuffer;
  private depthTextureInfo: TextureInfo | null = null;
  private colorTextureInfos: TextureInfo[] = [];

  constructor(private readonly gl: WebGL2RenderingContext, private dimensions: RenderDimensions) {
    super();
    this.framebuffer = gl.createFramebuffer();
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

  public setSize(dimensions: RenderDimensions): FramebufferRenderTarget {
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

    return this;
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
      texture: definition.createTexture(this.gl, this.dimensions),
      attachmentIndex,
    };
  }
}

type TextureInfo = {
  definition: TextureDefinition;
  texture: WebGLTexture;
  attachmentIndex: number;
};
