import type { GLViewportDimensions, ScreenRect } from "./dimension-types";

export type StillSceneDrawer = (pixelRect: ScreenRect) => void;
export type AnimatedSceneDrawer = (pixelRect: ScreenRect, deltaSeconds: number) => void;

export type AnimateOptions = {
  cumulativeTime: boolean;
};

const defaultAnimateOptions: AnimateOptions = {
  cumulativeTime: false,
};

export class MultiSceneDrawer {
  private readonly combinedCanvas: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly stillDrawers = new Map<HTMLElement, StillSceneDrawer>();
  private readonly animatedDrawers = new Map<
    HTMLElement,
    {
      drawer: AnimatedSceneDrawer;
      options: AnimateOptions;
      prevFrameTime: number | null;
    }
  >();
  private readonly visibleElements = {
    still: new Map<HTMLElement, GLViewportDimensions>(),
    animated: new Map<HTMLElement, GLViewportDimensions>(),
  };
  private readonly scrollListener: () => void;
  private animationFrameRequest: number | null = null;
  private sizeChanged = true;
  private scrollChanged = false;
  private redrawRequested = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.combinedCanvas = gl.canvas as HTMLCanvasElement;
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.combinedCanvas);
    resizeCanvasToDisplaySize(this.combinedCanvas);
    this.scrollListener = () => this.handleScroll();
    window.addEventListener("scroll", this.scrollListener);
    this.animationFrameRequest = requestAnimationFrame((now) => this.drawVisibleScenes(now));
  }

  public registerStillDrawer(virtualCanvas: HTMLElement, drawer: StillSceneDrawer) {
    this.stillDrawers.set(virtualCanvas, drawer);
    this.refreshVisibleElements();
  }

  public registerAnimatedDrawer(
    virtualCanvas: HTMLElement,
    drawer: AnimatedSceneDrawer,
    suppliedOptions: Partial<AnimateOptions> = {}
  ) {
    const options = { ...defaultAnimateOptions, ...suppliedOptions };
    this.animatedDrawers.set(virtualCanvas, {
      drawer,
      options,
      prevFrameTime: null,
    });
    this.refreshVisibleElements();
  }

  public clean() {
    window.removeEventListener("scroll", this.scrollListener);
    if (this.animationFrameRequest !== null) {
      cancelAnimationFrame(this.animationFrameRequest);
      this.animationFrameRequest = null;
    }
    this.stillDrawers.clear();
    this.animatedDrawers.clear();
    this.visibleElements.still.clear();
    this.visibleElements.animated.clear();
  }

  public requestRedraw(virtualCanvas: HTMLElement) {
    // Requesting a redraw only makes sense for still scenes (animated ones will get
    // redrawn on the next animation frame anyway).
    // It is also only necessary to perform a redraw if the element is visible. If it
    // is not, it will get redrawn next time it is scrolled or resized into view.
    this.redrawRequested = this.visibleElements.still.has(virtualCanvas);
  }

  private handleResize() {
    this.sizeChanged = true;
    resizeCanvasToDisplaySize(this.combinedCanvas);
    this.refreshVisibleElements();
  }

  private handleScroll() {
    this.combinedCanvas.style.transform = `translateY(${window.scrollY}px)`;
    this.scrollChanged = true;
    this.refreshVisibleElements();
  }

  private refreshVisibleElements() {
    this.visibleElements.still.clear();
    this.stillDrawers.forEach((_drawer, elem) => {
      const viewportDimensions = getGLViewportDimensions(this.combinedCanvas, elem);
      if (isVisible(viewportDimensions.pixelRect, this.combinedCanvas)) {
        this.visibleElements.still.set(elem, viewportDimensions);
      }
    });

    this.visibleElements.animated.clear();
    this.animatedDrawers.forEach((_drawer, elem) => {
      const viewportDimensions = getGLViewportDimensions(this.combinedCanvas, elem);
      if (isVisible(viewportDimensions.pixelRect, this.combinedCanvas)) {
        this.visibleElements.animated.set(elem, viewportDimensions);
      }
    });
  }

  private drawVisibleScenes(now: number) {
    // We need to redraw if:
    // - the canvas has been resized
    // - the scroll position is changed
    // - a consumer has requested a redraw
    // - any animated scenes are visible (still scenes can remain if there has been no scrolling or resize)
    const needsRedraw =
      this.sizeChanged || this.scrollChanged || this.redrawRequested || this.visibleElements.animated.size > 0;

    this.sizeChanged = false;
    this.scrollChanged = false;
    this.redrawRequested = false;
    requestAnimationFrame((now) => this.drawVisibleScenes(now));

    if (needsRedraw) {
      // Note that drawing any scene necessitates clearing the canvas and drawing all visible scenes,
      // since we are not preserving the drawing buffer. We might only be needing to redraw because
      // we have some animated scene in view, but we have to redraw still scenes too.
      this.gl.clearColor(0, 0, 0, 0);
      this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

      this.visibleElements.still.forEach((viewportDimensions, elem) => {
        const drawer = this.stillDrawers.get(elem)!;
        drawer(viewportDimensions.pixelRect);
      });

      this.visibleElements.animated.forEach((viewportDimensions, elem) => {
        const drawInfo = this.animatedDrawers.get(elem)!;
        if (drawInfo.prevFrameTime === null) {
          drawInfo.prevFrameTime = now;
        }

        const deltaSeconds = (now - drawInfo.prevFrameTime) / 1000;
        drawInfo.drawer(viewportDimensions.pixelRect, deltaSeconds);

        if (!drawInfo.options.cumulativeTime) {
          drawInfo.prevFrameTime = now;
        }
      });
    }
  }
}

function isVisible(pixelRect: ScreenRect, combinedCanvas: HTMLCanvasElement) {
  return (
    pixelRect.xOffset + pixelRect.width > 0 &&
    pixelRect.xOffset < combinedCanvas.width &&
    pixelRect.yOffset + pixelRect.height > 0 &&
    pixelRect.yOffset < combinedCanvas.height
  );
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
  // https://webgl2fundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
  const dpr = window.devicePixelRatio;
  const boundingRect = canvas.getBoundingClientRect();
  const displayWidth = Math.round(boundingRect.width * dpr);
  const displayHeight = Math.round(boundingRect.height * dpr);

  const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;

  if (!needResize) {
    return;
  }

  canvas.width = displayWidth;
  canvas.height = displayHeight;
}

function getGLViewportDimensions(combinedCanvas: HTMLCanvasElement, virtualCanvas: HTMLElement): GLViewportDimensions {
  // Use getBoundingClientRect instead of clientWidth/clientHeight, as it more accurately represents
  // what is displayed on the screen (e.g. respecting CSS transforms) and its dimensions are not
  // required to be integers.
  // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
  const combined = combinedCanvas.getBoundingClientRect();
  const virtual = virtualCanvas.getBoundingClientRect();

  // Get the position of the virtual canvas relative to the combined canvas in CSS pixels
  const cssYOffsetFromBottom = combined.bottom - virtual.bottom;
  const cssRect: ScreenRect = {
    xOffset: virtual.left - combined.left,
    yOffset: virtual.top - combined.top,
    width: virtual.width,
    height: virtual.height,
  };

  // The number of canvas pixels per CSS pixel is determined by the width/height properties
  // of the canvas. These are assumed to have been set intentionally, considering device pixel
  // ratio and desired pixellation. Here, we only care about the results of those choices.
  const widthPerCssPixel = combinedCanvas.width / combined.width;
  const heightPerCssPixel = combinedCanvas.height / combined.height;

  // If a measurement is 3 CSS pixels and widthPerCssPixel is 2 (canvas pixels per CSS pixel),
  // the pixel measurement is 3x2.
  const pixelRect: ScreenRect = {
    xOffset: cssRect.xOffset * widthPerCssPixel,
    yOffset: cssYOffsetFromBottom * heightPerCssPixel,
    width: cssRect.width * widthPerCssPixel,
    height: cssRect.height * heightPerCssPixel,
  };
  return {
    cssRect,
    pixelRect,
    scaling: { widthPerCssPixel, heightPerCssPixel },
  };
}
