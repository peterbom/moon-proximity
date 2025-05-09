export type ScreenRect = {
  xOffset: number;
  yOffset: number;
  width: number;
  height: number;
};

export type CanvasScaling = {
  widthPerCssPixel: number;
  heightPerCssPixel: number;
};

export type CanvasViewportDimensions = {
  scaling: CanvasScaling;

  /**
   * the position of the virtual canvas relative to the actual canvas in CSS pixels.
   * The Y offset is relative to the top of the canvas.
   */
  cssRect: ScreenRect;

  /**
   * The position of the virtual canvas relative to the actual canvas in canvas pixels.
   * The Y offset is relative to the bottom of the canvas.
   */
  pixelRect: ScreenRect;
};

export type CanvasCssCoordinates = {
  withinGLViewport: boolean;
  canvasCssX: number;
  canvasCssY: number;
};

export type CanvasPixelCoordinates = {
  pixelX: number;
  pixelY: number;
};

export type CanvasClipCoordinates = {
  clipX: number;
  clipY: number;
  clipZ: number;
};

export type CanvasCoordinates = CanvasCssCoordinates & CanvasPixelCoordinates & CanvasClipCoordinates;

export type RenderDimensions = {
  width: number;
  height: number;
};
