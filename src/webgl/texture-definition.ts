import type { Vector4 } from "../common/numeric-types";
import type { RenderDimensions, ScreenRect } from "./dimension-types";

const typeValues = {
  UNSIGNED_BYTE: 5121,
  UNSIGNED_SHORT: 5123,
  FLOAT: 5126,
} as const;

const formatValues = {
  RED: 6403,
  RG: 33319,
  RGB: 6407,
  RGBA: 6408,
  RED_INTEGER: 36244,
  DEPTH_COMPONENT: 6402,
} as const;

// https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glTexImage2D.xhtml
const internalFormatValues = {
  R8: {
    value: 33321,
    arrayBufferCtor: Uint8Array,
    format: formatValues.RED,
    type: typeValues.UNSIGNED_BYTE,
    valuesPerPixel: 1,
  },
  R32F: {
    value: 33326,
    arrayBufferCtor: Float32Array,
    format: formatValues.RED,
    type: typeValues.FLOAT,
    valuesPerPixel: 1,
  },
  RG32F: {
    value: 33328,
    arrayBufferCtor: Float32Array,
    format: formatValues.RG,
    type: typeValues.FLOAT,
    valuesPerPixel: 2,
  },
  R16UI: {
    value: 33332,
    arrayBufferCtor: Uint16Array,
    format: formatValues.RED_INTEGER,
    type: typeValues.UNSIGNED_SHORT,
    valuesPerPixel: 1,
  },
  RGB8: {
    value: 32849,
    arrayBufferCtor: Uint8Array,
    format: formatValues.RED_INTEGER,
    type: typeValues.UNSIGNED_BYTE,
    valuesPerPixel: 3,
  },
  RGBA8: {
    value: 32856,
    arrayBufferCtor: Uint8Array,
    format: formatValues.RGBA,
    type: typeValues.UNSIGNED_BYTE,
    valuesPerPixel: 4,
  },
  DEPTH_COMPONENT16: {
    value: 33189,
    arrayBufferCtor: Uint16Array,
    format: formatValues.DEPTH_COMPONENT,
    type: typeValues.UNSIGNED_SHORT,
    valuesPerPixel: 1,
  },
} as const;

export type InternalFormat = Extract<keyof typeof internalFormatValues, string>;

export type ReadPixelInfo = {};

const magFilterValues = {
  NEAREST: 9728,
  LINEAR: 9729,
} as const;

export type MagFilter = Extract<keyof typeof magFilterValues, string>;

const minFilterValues = {
  NEAREST: 9728,
  LINEAR: 9729,
  NEAREST_MIPMAP_NEAREST: 9984,
  NEAREST_MIPMAP_LINEAR: 9986,
  LINEAR_MIPMAP_NEAREST: 9985,
  LINEAR_MIPMAP_LINEAR: 9987,
};

export type MinFilter = Extract<keyof typeof minFilterValues, string>;

type TextureProperties = {
  internalFormat: InternalFormat;
  magFilter: MagFilter;
  minFilter: MinFilter;
};

export class TextureDefinition {
  private properties: TextureProperties;
  private mutableTexture: WebGLTexture | null = null;

  constructor(internalFormat: InternalFormat) {
    this.properties = {
      internalFormat,
      minFilter: "LINEAR",
      magFilter: "LINEAR",
    };
  }

  public withMagFilter(magFilter: MagFilter): TextureDefinition {
    this.properties.magFilter = magFilter;
    return this;
  }

  public withMinFilter(minFilter: MinFilter): TextureDefinition {
    this.properties.minFilter = minFilter;
    return this;
  }

  public updateFromImage(gl: WebGL2RenderingContext, texture: WebGLTexture, image: TexImageSource) {
    const internalFormatValue = internalFormatValues[this.properties.internalFormat].value;
    const formatValue = internalFormatValues[this.properties.internalFormat].format;
    const type = internalFormatValues[this.properties.internalFormat].type;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormatValue, formatValue, type, image);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  public createMutable(gl: WebGL2RenderingContext, initialColor: Vector4): WebGLTexture {
    const internalFormatValue = internalFormatValues[this.properties.internalFormat].value;
    const formatValue = internalFormatValues[this.properties.internalFormat].format;
    const type = internalFormatValues[this.properties.internalFormat].type;
    const valuesPerPixel = internalFormatValues[this.properties.internalFormat].valuesPerPixel;
    const initialData = initialColor.slice(0, valuesPerPixel);
    const arrayBufferCtor = internalFormatValues[this.properties.internalFormat].arrayBufferCtor;
    const initialBufferData = new arrayBufferCtor(initialData);

    this.getExtensions(gl);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.setParameters(gl, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormatValue, 1, 1, 0, formatValue, type, initialBufferData);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  public createImmutable(gl: WebGL2RenderingContext, dimensions: RenderDimensions): WebGLTexture {
    const internalFormatValue = internalFormatValues[this.properties.internalFormat].value;

    this.getExtensions(gl);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.setParameters(gl, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormatValue, dimensions.width, dimensions.height);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  private getExtensions(gl: WebGL2RenderingContext) {
    const type = internalFormatValues[this.properties.internalFormat].type;
    if (type === typeValues.FLOAT) {
      // Needed to render floats to the color buffer.
      gl.getExtension("EXT_color_buffer_float");
    }
  }

  private setParameters(gl: WebGL2RenderingContext, texture: WebGLTexture) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilterValues[this.properties.magFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilterValues[this.properties.minFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // TODO: Make configurable
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // TODO: Make configurable
  }

  public createReadBuffer(rect: ScreenRect): TextureReadBufferInfo {
    const formatInfo = internalFormatValues[this.properties.internalFormat];
    const dataLength = rect.width * rect.height * formatInfo.valuesPerPixel;
    return {
      buffer: new formatInfo.arrayBufferCtor(dataLength),
      format: formatInfo.format,
      type: formatInfo.type,
      valuesPerPixel: formatInfo.valuesPerPixel,
    };
  }
}

export type TextureReadBuffer = Uint8Array | Float32Array | Uint16Array;

export type TextureReadBufferInfo = {
  buffer: TextureReadBuffer;
  format: number;
  type: number;
  valuesPerPixel: number;
};

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
