type DrawOptionProperties = {
  cullFace: boolean;
  depthMask: boolean;
  depthTest: boolean;
  blendConfig: (gl: WebGL2RenderingContext) => void;
};

export class DrawOptions {
  private constructor(private readonly properties: DrawOptionProperties) {}

  public static default(): DrawOptions {
    return new DrawOptions({
      cullFace: true,
      depthMask: true,
      depthTest: true,
      blendConfig: (gl) => {
        gl.disable(gl.BLEND);
      },
    });
  }

  public cullFace(cullFace: boolean): DrawOptions {
    this.properties.cullFace = cullFace;
    return this;
  }

  public depthMask(depthMask: boolean): DrawOptions {
    this.properties.depthMask = depthMask;
    return this;
  }

  public depthTest(depthTest: boolean): DrawOptions {
    this.properties.depthTest = depthTest;
    return this;
  }

  public blend(blend: boolean): DrawOptions {
    this.properties.blendConfig = blend ? defaultBlend : noBlend;
    return this;
  }

  public setOptions(gl: WebGL2RenderingContext) {
    this.properties.cullFace ? gl.enable(gl.CULL_FACE) : gl.disable(gl.CULL_FACE);
    this.properties.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
    gl.depthMask(this.properties.depthMask);
    this.properties.blendConfig(gl);
  }
}

function noBlend(gl: WebGL2RenderingContext) {
  gl.disable(gl.BLEND);
}

function defaultBlend(gl: WebGL2RenderingContext) {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
