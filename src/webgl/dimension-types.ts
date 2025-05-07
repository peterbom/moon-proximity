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

export type GLViewportDimensions = {
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
