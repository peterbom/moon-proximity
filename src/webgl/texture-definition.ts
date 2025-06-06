import type { Vector4 } from "../common/numeric-types";
import type { RenderDimensions, ScreenRect } from "./dimension-types";

// https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glTexImage2D.xhtml
// Includes floating point formats enabled by the EXT_color_buffer_float extension
// (https://developer.mozilla.org/en-US/docs/Web/API/EXT_color_buffer_float)
const internalFormatValues = {
  R8: {
    value: WebGL2RenderingContext.R8,
    arrayBufferCtor: Uint8Array,
    format: WebGL2RenderingContext.RED,
    type: WebGL2RenderingContext.UNSIGNED_BYTE,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.RED,
    readValuesPerPixel: 1,
  },
  R16F: {
    value: WebGL2RenderingContext.R16F,
    arrayBufferCtor: Uint16Array,
    format: WebGL2RenderingContext.RED,
    type: WebGL2RenderingContext.HALF_FLOAT,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.RED,
    readValuesPerPixel: 1,
  },
  R16UI: {
    value: WebGL2RenderingContext.R16UI,
    arrayBufferCtor: Uint16Array,
    format: WebGL2RenderingContext.RED_INTEGER,
    type: WebGL2RenderingContext.UNSIGNED_SHORT,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.RED_INTEGER,
    readValuesPerPixel: 1,
  },
  R32F: {
    value: WebGL2RenderingContext.R32F,
    arrayBufferCtor: Float32Array,
    format: WebGL2RenderingContext.RED,
    type: WebGL2RenderingContext.FLOAT,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.RED,
    readValuesPerPixel: 1,
  },
  RG16F: {
    value: WebGL2RenderingContext.RG16F,
    arrayBufferCtor: Uint16Array,
    format: WebGL2RenderingContext.RG,
    type: WebGL2RenderingContext.HALF_FLOAT,
    valuesPerPixel: 2,
    readFormat: WebGL2RenderingContext.RG,
    readValuesPerPixel: 2,
  },
  RG32F: {
    value: WebGL2RenderingContext.RG32F,
    arrayBufferCtor: Float32Array,
    format: WebGL2RenderingContext.RG,
    type: WebGL2RenderingContext.FLOAT,
    valuesPerPixel: 2,
    readFormat: WebGL2RenderingContext.RG,
    readValuesPerPixel: 2,
  },
  RGB8: {
    value: WebGL2RenderingContext.RGB8,
    arrayBufferCtor: Uint8Array,
    format: WebGL2RenderingContext.RGB,
    type: WebGL2RenderingContext.UNSIGNED_BYTE,
    valuesPerPixel: 3,
    readFormat: WebGL2RenderingContext.RGBA,
    readValuesPerPixel: 4,
  },
  RGBA8: {
    value: WebGL2RenderingContext.RGBA8,
    arrayBufferCtor: Uint8Array,
    format: WebGL2RenderingContext.RGBA,
    type: WebGL2RenderingContext.UNSIGNED_BYTE,
    valuesPerPixel: 4,
    readFormat: WebGL2RenderingContext.RGBA,
    readValuesPerPixel: 4,
  },
  RGBA16F: {
    value: WebGL2RenderingContext.RGBA16F,
    arrayBufferCtor: Uint16Array,
    format: WebGL2RenderingContext.RGBA,
    type: WebGL2RenderingContext.HALF_FLOAT,
    valuesPerPixel: 4,
    readFormat: WebGL2RenderingContext.RGBA,
    readValuesPerPixel: 4,
  },
  RGBA32F: {
    value: WebGL2RenderingContext.RGBA32F,
    arrayBufferCtor: Float32Array,
    format: WebGL2RenderingContext.RGBA,
    type: WebGL2RenderingContext.FLOAT,
    valuesPerPixel: 4,
    readFormat: WebGL2RenderingContext.RGBA,
    readValuesPerPixel: 4,
  },
  DEPTH_COMPONENT16: {
    value: WebGL2RenderingContext.DEPTH_COMPONENT16,
    arrayBufferCtor: Uint16Array,
    format: WebGL2RenderingContext.DEPTH_COMPONENT,
    type: WebGL2RenderingContext.UNSIGNED_SHORT,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.DEPTH_COMPONENT,
    readValuesPerPixel: 1,
  },
  DEPTH_COMPONENT24: {
    value: WebGL2RenderingContext.DEPTH_COMPONENT24,
    arrayBufferCtor: Uint32Array,
    format: WebGL2RenderingContext.DEPTH_COMPONENT,
    type: WebGL2RenderingContext.UNSIGNED_INT,
    valuesPerPixel: 1,
    readFormat: WebGL2RenderingContext.DEPTH_COMPONENT,
    readValuesPerPixel: 1,
  },
} as const;

export type InternalFormat = Extract<keyof typeof internalFormatValues, string>;

const integerFormats: number[] = [
  WebGL2RenderingContext.RED_INTEGER,
  WebGL2RenderingContext.RG_INTEGER,
  WebGL2RenderingContext.RGB_INTEGER,
  WebGL2RenderingContext.RGBA_INTEGER,
];

const floatTypes: number[] = [WebGL2RenderingContext.FLOAT, WebGL2RenderingContext.HALF_FLOAT];
const unsignedIntTypes: number[] = [
  WebGL2RenderingContext.UNSIGNED_INT,
  WebGL2RenderingContext.UNSIGNED_SHORT,
  WebGL2RenderingContext.UNSIGNED_BYTE,
];
const intTypes: number[] = [WebGL2RenderingContext.INT, WebGL2RenderingContext.SHORT, WebGL2RenderingContext.BYTE];

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
  createMipmap: boolean;
};

export class TextureDefinition {
  private properties: TextureProperties;

  constructor(internalFormat: InternalFormat) {
    this.properties = {
      internalFormat,
      minFilter: "LINEAR",
      magFilter: "LINEAR",
      createMipmap: false,
    };
  }

  public getRenderProperties(): TextureRenderProperties {
    const values = internalFormatValues[this.properties.internalFormat];
    return {
      internalFormat: this.properties.internalFormat,
      internalFormatValue: values.value,
      format: values.format,
      type: values.type,
      valuesPerPixel: values.valuesPerPixel,
      readFormat: values.readFormat,
      readValuesPerPixel: values.readValuesPerPixel,
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

  public withMipmap(createMipmap: boolean): TextureDefinition {
    this.properties.createMipmap = createMipmap;
    return this;
  }

  public updateFromImage(gl: WebGL2RenderingContext, texture: WebGLTexture, image: TexImageSource) {
    const internalFormatValue = internalFormatValues[this.properties.internalFormat].value;
    const formatValue = internalFormatValues[this.properties.internalFormat].format;
    const type = internalFormatValues[this.properties.internalFormat].type;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormatValue, formatValue, type, image);
    if (this.properties.createMipmap) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }

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
    this.setParameters(gl);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormatValue, 1, 1, 0, formatValue, type, initialBufferData);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  public createImmutable(gl: WebGL2RenderingContext, dimensions: RenderDimensions): WebGLTexture {
    const internalFormatValue = internalFormatValues[this.properties.internalFormat].value;

    this.getExtensions(gl);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    this.setParameters(gl);
    const mipmapLevelCount = this.getMipmapLevelCount(dimensions);
    gl.texStorage2D(gl.TEXTURE_2D, mipmapLevelCount, internalFormatValue, dimensions.width, dimensions.height);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  public getMipmapLevelCount(dimensions: RenderDimensions) {
    return this.properties.createMipmap ? Math.floor(Math.log2(Math.min(dimensions.width, dimensions.height))) + 1 : 1;
  }

  public isIntegerFormat() {
    return integerFormats.includes(internalFormatValues[this.properties.internalFormat].format);
  }

  public isFloatType() {
    return floatTypes.includes(internalFormatValues[this.properties.internalFormat].type);
  }

  public isIntType() {
    return intTypes.includes(internalFormatValues[this.properties.internalFormat].type);
  }

  public isUnsignedIntType() {
    return unsignedIntTypes.includes(internalFormatValues[this.properties.internalFormat].type);
  }

  private getExtensions(gl: WebGL2RenderingContext) {
    if (this.isFloatType()) {
      // Needed to render floats to the color buffer.
      gl.getExtension("EXT_color_buffer_float");
    }
  }

  private setParameters(gl: WebGL2RenderingContext) {
    gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilterValues[this.properties.magFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilterValues[this.properties.minFilter]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // TODO: Make configurable
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); // TODO: Make configurable
  }

  public createReadBuffer(rect: ScreenRect): TextureReadBufferInfo {
    const { width, height } = rect;
    const formatInfo = internalFormatValues[this.properties.internalFormat];
    const dataLength = width * height * formatInfo.readValuesPerPixel;

    return {
      buffer: new formatInfo.arrayBufferCtor(dataLength),
      format: formatInfo.readFormat,
      type: formatInfo.type,
      valuesPerPixel: formatInfo.readValuesPerPixel,
      dimensions: { width, height },
    };
  }
}

export type TextureReadBuffer = Uint8Array | Float32Array | Uint16Array | Uint32Array;

export type TextureReadBufferInfo = {
  buffer: TextureReadBuffer;
  format: number;
  type: number;
  valuesPerPixel: number;
  dimensions: RenderDimensions;
};

export type TextureRenderProperties = {
  internalFormat: InternalFormat;
  internalFormatValue: number;
  format: number;
  type: number;
  valuesPerPixel: number;
  readFormat: number;
  readValuesPerPixel: number;
};
