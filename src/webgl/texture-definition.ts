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

type Format = Extract<keyof typeof formatValues, string>;

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

  public createTexture(gl: WebGL2RenderingContext, dimensions: RenderDimensions): WebGLTexture {
    if (internalFormatValues[this.properties.internalFormat].type === typeValues.FLOAT) {
      // Needed to render floats to the color buffer.
      gl.getExtension("EXT_color_buffer_float");
    }

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilterValues[this.properties.magFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilterValues[this.properties.minFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // TODO: Make configurable
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // TODO: Make configurable
    gl.texStorage2D(
      gl.TEXTURE_2D,
      1,
      internalFormatValues[this.properties.internalFormat].value,
      dimensions.width,
      dimensions.height
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
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
