import type { Vector4 } from "../common/numeric-types";
import type { ScreenRect } from "./dimension-types";
import { TextureDefinition, TextureReadBufferInfo } from "./texture-definition";

export type ReadableTexture = {
  framebuffer: WebGLFramebuffer;
  textureDefinition: TextureDefinition;
  attachmentIndex: number;
  texture: WebGLTexture;
};

export function createReadableTexture(
  gl: WebGL2RenderingContext,
  textureDefinition: TextureDefinition,
  texture: WebGLTexture
): ReadableTexture {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    framebuffer,
    textureDefinition,
    texture,
    attachmentIndex: 0,
  };
}

export function createDownloadingTexture(
  gl: WebGL2RenderingContext,
  imageSrc: string,
  textureDefinition: TextureDefinition,
  initialColor: Vector4,
  downloaded: (texture: WebGLTexture) => void = () => {}
): WebGLTexture {
  const texture = textureDefinition.createMutable(gl, initialColor);

  (async function () {
    const imageElem = await loadImage(imageSrc);
    textureDefinition.updateFromImage(gl, texture, imageElem);
    downloaded(texture);
  })();

  return texture;
}

export function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = imageSrc;
  return new Promise((resolve) => image.addEventListener("load", () => resolve(image)));
}

export function readTexture(
  gl: WebGL2RenderingContext,
  readableTexture: ReadableTexture,
  rect: ScreenRect
): TextureReadBufferInfo {
  const definition = readableTexture.textureDefinition;
  const renderProperties = definition.getRenderProperties();
  const readBufferInfo = definition.createReadBuffer(rect);

  gl.bindFramebuffer(gl.FRAMEBUFFER, readableTexture.framebuffer);
  gl.readBuffer(gl.COLOR_ATTACHMENT0 + readableTexture.attachmentIndex);

  const requiredFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT);
  if (requiredFormat !== readBufferInfo.format) {
    throw new Error(
      `${renderProperties.internalFormat}: Has format ${readBufferInfo.format} but requires ${requiredFormat}`
    );
  }

  const requiredType = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE);
  if (requiredType !== readBufferInfo.type) {
    throw new Error(`${renderProperties.internalFormat}: Has type ${readBufferInfo.type} but requires ${requiredType}`);
  }

  gl.readPixels(
    rect.xOffset,
    rect.yOffset,
    rect.width,
    rect.height,
    readBufferInfo.format,
    readBufferInfo.type,
    readBufferInfo.buffer
  );

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return readBufferInfo;
}

export function drawToCanvas(
  canvasElem: HTMLCanvasElement,
  readInfo: TextureReadBufferInfo,
  flipY: boolean,
  adjustment: (inputColor: Vector4) => Vector4 = ([r, g, b]) => [r, g, b, 255]
) {
  const { width, height } = readInfo.dimensions;
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
