import { Vector4 } from "../common/numeric-types";
import type { RenderDimensions, ScreenRect } from "./dimension-types";
import {
  InternalFormat,
  TextureDefinition,
  TextureReadBufferInfo,
  TextureRenderProperties,
} from "./texture-definition";

export enum SizeType {
  FitToViewport,
  FixedSize,
}

export interface RenderTarget {
  get framebuffer(): WebGLFramebuffer | null;

  getDrawingRect(viewportRect: ScreenRect): ScreenRect;

  clear(): void;
}

export class ScreenRenderTarget implements RenderTarget {
  constructor(private readonly gl: WebGL2RenderingContext) {}

  public get framebuffer(): WebGLFramebuffer | null {
    return null;
  }

  public getDrawingRect(viewportRect: ScreenRect): ScreenRect {
    return viewportRect;
  }

  public clear() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
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

  public get textureDimensions(): RenderDimensions {
    return this.dimensions;
  }

  public static createFixedSize(gl: WebGL2RenderingContext, dimensions: RenderDimensions): FramebufferRenderTarget {
    return new FramebufferRenderTarget(gl, SizeType.FixedSize, dimensions);
  }

  public static createFitToViewport(gl: WebGL2RenderingContext): FramebufferRenderTarget {
    return new FramebufferRenderTarget(gl, SizeType.FitToViewport, { width: 1, height: 1 });
  }

  public withDepthTexture(
    format: Extract<InternalFormat, "DEPTH_COMPONENT16" | "DEPTH_COMPONENT24">
  ): FramebufferRenderTarget {
    this.depthTextureInfo = createTextureInfo(this.gl, new TextureDefinition(format), 0, this.dimensions);
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
    const textureInfo = createTextureInfo(this.gl, definition, index, this.dimensions);
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
        this.depthTextureInfo = createTextureInfo(this.gl, this.depthTextureInfo.definition, 0, dimensions);
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
        const textureInfo = createTextureInfo(this.gl, info.definition, info.attachmentIndex, dimensions);
        this.colorTextureInfos.push(textureInfo);
        this.gl.framebufferTexture2D(
          this.gl.FRAMEBUFFER,
          this.gl.COLOR_ATTACHMENT0 + info.attachmentIndex,
          this.gl.TEXTURE_2D,
          textureInfo.texture,
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

    this.checkFramebufferStatus(true);

    const readBufferInfo = textureInfo.definition.createReadBuffer(rect);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    this.gl.readBuffer(this.gl.COLOR_ATTACHMENT0 + textureInfo.attachmentIndex);

    const requiredFormat = this.gl.getParameter(this.gl.IMPLEMENTATION_COLOR_READ_FORMAT);
    if (requiredFormat !== readBufferInfo.format) {
      throw new Error(
        `${textureInfo.renderProperties.internalFormat}: Has format ${readBufferInfo.format} but requires ${requiredFormat}`
      );
    }

    const requiredType = this.gl.getParameter(this.gl.IMPLEMENTATION_COLOR_READ_TYPE);
    if (requiredType !== readBufferInfo.type) {
      throw new Error(
        `${textureInfo.renderProperties.internalFormat}: Has type ${readBufferInfo.type} but requires ${requiredType}`
      );
    }

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

  public getColorTextureInfo(attachmentIndex: number): TextureInfo {
    const textureInfo = this.colorTextureInfos.find((t) => t.attachmentIndex === attachmentIndex);
    if (!textureInfo) {
      throw new Error(`No texture found for attachment index ${attachmentIndex}`);
    }

    return textureInfo;
  }

  public clear() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);

    // Needs to work for different texture types: https://stackoverflow.com/a/75045836
    if (this.depthTextureInfo !== null) {
      this.gl.clearBufferfv(this.gl.DEPTH, 0, [1]);
    }

    this.colorTextureInfos.forEach((info) => {
      if (info.definition.isFloat()) {
        this.gl.clearBufferfv(this.gl.COLOR, info.attachmentIndex, [0, 0, 0, 0]);
      } else if (info.definition.isInt()) {
        this.gl.clearBufferiv(this.gl.COLOR, info.attachmentIndex, [0, 0, 0, 0]);
      } else if (info.definition.isUnsignedInt()) {
        info.renderProperties.valuesPerPixel;
        this.gl.clearBufferuiv(this.gl.COLOR, info.attachmentIndex, [0, 0, 0, 0]);
      } else {
        throw new Error(`Unexpected texture type: ${info.renderProperties.type}`);
      }
    });

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  public drawToCanvas(
    canvasElem: HTMLCanvasElement,
    attachmentIndex: number,
    flipY: boolean,
    adjustment: (inputColor: Vector4) => Vector4 = ([r, g, b]) => [r, g, b, 255]
  ) {
    const { width, height } = this.dimensions;
    const readInfo = this.readColorTexture(attachmentIndex, { xOffset: 0, yOffset: 0, width, height });

    const writePixelValueCount = 4; // RGBA
    const writeRowValueCount = width * writePixelValueCount;
    const writeValueCount = height * writeRowValueCount;
    const outData = new Uint8ClampedArray(writeValueCount);

    const readRowValueCount = width * readInfo.valuesPerPixel;
    for (let y = 0; y < height; y++) {
      const readRowStartIndex = y * readRowValueCount;

      const writeY = flipY ? height - 1 - y : y;
      const writeRowStartIndex = writeY * writeRowValueCount;

      for (let x = 0; x < width; x++) {
        const readPixelStartIndex = readRowStartIndex + x * readInfo.valuesPerPixel;
        const writePixelStartIndex = writeRowStartIndex + x * writePixelValueCount;

        const inputColor: Vector4 = [0, 0, 0, 0];
        for (let componentIndex = 0; componentIndex < readInfo.valuesPerPixel; componentIndex++) {
          inputColor[componentIndex] = readInfo.buffer[readPixelStartIndex + componentIndex];
        }

        const outputColor = adjustment(inputColor);
        for (let componentIndex = 0; componentIndex < writePixelValueCount; componentIndex++) {
          outData[writePixelStartIndex + componentIndex] = outputColor[componentIndex];
        }
      }
    }

    const imageData = new ImageData(outData, width);

    canvasElem.width = width;
    canvasElem.height = height;
    const context = canvasElem.getContext("2d");
    if (context === null) {
      throw new Error("Unable to get 2D context for canvas");
    }

    context.putImageData(imageData, 0, 0);
  }

  public clean() {
    if (this.depthTextureInfo !== null) {
      this.gl.deleteTexture(this.depthTextureInfo.texture);
    }

    this.colorTextureInfos.forEach((info) => this.gl.deleteTexture(info.texture));
    this.gl.deleteFramebuffer(this.framebuffer);
  }
}

export type TextureInfo = {
  definition: TextureDefinition;
  texture: WebGLTexture;
  attachmentIndex: number;
  renderProperties: TextureRenderProperties;
};

function createTextureInfo(
  gl: WebGL2RenderingContext,
  definition: TextureDefinition,
  attachmentIndex: number,
  dimensions: RenderDimensions
): TextureInfo {
  return {
    definition,
    texture: definition.createImmutable(gl, dimensions),
    attachmentIndex,
    renderProperties: definition.getRenderProperties(),
  };
}
