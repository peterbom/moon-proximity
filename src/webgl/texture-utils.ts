import { Vector4 } from "../common/numeric-types";
import { InternalFormat, TextureDefinition } from "./texture-definition";

export function createDownloadingTexture(
  gl: WebGL2RenderingContext,
  imageSrc: string,
  internalFormat: InternalFormat,
  initialColor: Vector4
): WebGLTexture {
  const textureDefinition = new TextureDefinition(internalFormat);
  const texture = textureDefinition.createMutable(gl, initialColor);

  (async function () {
    const imageElem = await loadImage(imageSrc);
    textureDefinition.updateFromImage(gl, texture, imageElem);
  })();

  return texture;
}

export function loadImage(imageSrc: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = imageSrc;
  return new Promise((resolve) => image.addEventListener("load", () => resolve(image)));
}
