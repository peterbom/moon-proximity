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
