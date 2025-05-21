import type { Cleaner } from "../common/cleanup";
import type { Vector2 } from "../common/numeric-types";
import { getMagnitude, subtractVectors } from "../common/vectors";
import type { CanvasCoordinates, CanvasViewportDimensions, ScreenRect } from "./dimension-types";

export type ZoomHandler = (coords: CanvasCoordinates, distanceScaleFactor: number) => void;

export function addZoomHandler(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  handler: ZoomHandler
): Cleaner {
  // See: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
  const cachedEvents = new Map<number, PointerEvent>();
  let prevPointerDistance = 0;

  virtualCanvas.addEventListener("wheel", wheelHandler);
  virtualCanvas.addEventListener("pointerdown", pointerdownHandler);
  virtualCanvas.addEventListener("pointermove", pointermoveHandler);
  virtualCanvas.addEventListener("pointerup", pointerupHandler);
  virtualCanvas.addEventListener("pointercancel", pointerupHandler);
  virtualCanvas.addEventListener("pointerout", pointerupHandler);
  virtualCanvas.addEventListener("pointerleave", pointerupHandler);

  return {
    clean() {
      virtualCanvas.removeEventListener("wheel", wheelHandler);
      virtualCanvas.removeEventListener("pointerdown", pointerdownHandler);
      virtualCanvas.removeEventListener("pointermove", pointermoveHandler);
      virtualCanvas.removeEventListener("pointerup", pointerupHandler);
      virtualCanvas.removeEventListener("pointercancel", pointerupHandler);
      virtualCanvas.removeEventListener("pointerout", pointerupHandler);
      virtualCanvas.removeEventListener("pointerleave", pointerupHandler);
    },
  };

  function wheelHandler(e: WheelEvent) {
    e.preventDefault(); // prevent scrolling
    const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    const distanceScaleFactor = 1 + Math.sign(e.deltaY) * 0.1; // +ve delta = scroll down = -ve zoom = increased distance
    handler(coordinates, distanceScaleFactor);
  }

  function pointerdownHandler(e: PointerEvent) {
    cachedEvents.set(e.pointerId, e);
  }

  function pointermoveHandler(e: PointerEvent) {
    // Find this event in the cache and update its record with this event
    cachedEvents.set(e.pointerId, e);

    // If two pointers are down, check for pinch gestures
    const events = [...cachedEvents.values()];
    if (events.length === 2) {
      // Calculate the distance between the two pointers
      const pos0: Vector2 = [events[0].clientX, events[0].clientY];
      const pos1: Vector2 = [events[1].clientX, events[1].clientY];
      const pointerDistance = getMagnitude(subtractVectors(pos1, pos0));

      if (prevPointerDistance > 0 && pointerDistance !== prevPointerDistance) {
        const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
        const zoomIncrease = (pointerDistance - prevPointerDistance) / prevPointerDistance;
        // Zoom 'distance' decreases with increasing zoom.
        const distanceScaleFactor = 1 - zoomIncrease;
        handler(coordinates, distanceScaleFactor);
      }

      // Cache the distance for the next move event
      prevPointerDistance = pointerDistance;
    }
  }

  function pointerupHandler(e: PointerEvent) {
    // Remove this pointer from the cache
    cachedEvents.delete(e.pointerId);

    // If the number of pointers down is less than two then reset diff tracker
    if (cachedEvents.size < 2) {
      prevPointerDistance = 0;
    }
  }
}

export type MoveHandler = (coords: CanvasCoordinates) => void;
export type ClickHandler = (coords: CanvasCoordinates) => void;

export interface MouseEventListeners {
  move?: MoveHandler;
  click?: ClickHandler;
}

export function addMouseListeners(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  listeners: MouseEventListeners
): Cleaner {
  const moveHandler = listeners.move;
  const clickHandler = listeners.click;

  const cleaners: (() => void)[] = [];
  if (moveHandler) {
    const listener = (e: MouseEvent) => handleMouseMove(e, combinedCanvas, virtualCanvas, moveHandler);
    virtualCanvas.addEventListener("mousemove", listener, false);
    cleaners.push(() => virtualCanvas.removeEventListener("mousemove", listener, false));
  }

  if (clickHandler) {
    const listener = (e: MouseEvent) => handleMouseClick(e, combinedCanvas, virtualCanvas, clickHandler);
    virtualCanvas.addEventListener("pointerdown", listener, false);
    cleaners.push(() => virtualCanvas.removeEventListener("pointerdown", listener, false));
  }

  return {
    clean() {
      cleaners.forEach((c) => c());
    },
  };

  function handleMouseMove(
    e: MouseEvent,
    combinedCanvas: HTMLCanvasElement,
    virtualCanvas: HTMLElement,
    handler: MoveHandler
  ) {
    const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    if (coordinates.withinGLViewport) {
      handler(coordinates);
    }
  }

  function handleMouseClick(
    e: MouseEvent,
    combinedCanvas: HTMLCanvasElement,
    virtualCanvas: HTMLElement,
    handler: ClickHandler
  ) {
    const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    if (coordinates.withinGLViewport) {
      handler(coordinates);
    }
  }
}

export interface TouchEventListeners {
  begin: (coords: CanvasCoordinates, timestamp: number) => boolean;
  move: (coords: CanvasCoordinates, timestamp: number) => boolean;
  end: (timestamp: number) => boolean;
}

export function addTouchEventListeners(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  listeners: TouchEventListeners
): Cleaner {
  virtualCanvas.addEventListener("mousedown", mouse_down, false);
  virtualCanvas.addEventListener("touchstart", touch_down, false);
  let touchIdentifier: number | null = null;

  return {
    clean() {
      virtualCanvas.removeEventListener("mousedown", mouse_down, false);
      virtualCanvas.removeEventListener("touchstart", touch_down, false);
    },
  };

  function mouse_down(e: MouseEvent) {
    window.addEventListener("mousemove", mouse_move, false);
    window.addEventListener("mouseup", mouse_up, false);

    const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    const preventDefault = listeners.begin(coordinates, e.timeStamp);

    if (preventDefault) e.preventDefault();
    return preventDefault;
  }

  function mouse_move(e: MouseEvent) {
    const coordinates = makeCanvasCoordinates(e, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    return listeners.move(coordinates, e.timeStamp);
  }

  function mouse_up(e: MouseEvent) {
    window.removeEventListener("mousemove", mouse_move, false);
    window.removeEventListener("mouseup", mouse_up, false);

    return listeners.end(e.timeStamp);
  }

  function touch_down(e: TouchEvent) {
    if (touchIdentifier !== null) {
      // Already handling a touch/move event
      return false;
    }

    window.addEventListener("touchmove", touch_move, false);
    window.addEventListener("touchend", touch_end, false);
    window.addEventListener("touchcancel", touch_end, false);

    // Pick a single touch contact point to continue handling move events on.
    const touch = e.changedTouches[0];
    touchIdentifier = touch.identifier;

    const coordinates = makeCanvasCoordinates(touch, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
    const preventDefault = listeners.begin(coordinates, e.timeStamp);

    if (preventDefault && e.cancelable) e.preventDefault();
    return preventDefault;
  }

  function touch_move(e: TouchEvent) {
    if (touchIdentifier === null) {
      return false;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === touchIdentifier) {
        const coordinates = makeCanvasCoordinates(touch, getCanvasViewportDimensions(combinedCanvas, virtualCanvas));
        return listeners.move(coordinates, e.timeStamp);
      }
    }
  }

  function touch_end(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];

      if (touch.identifier === touchIdentifier) {
        touchIdentifier = null;

        window.removeEventListener("touchmove", touch_move, false);
        window.removeEventListener("touchend", touch_end, false);
        window.removeEventListener("touchcancel", touch_end, false);
        return listeners.end(e.timeStamp);
      }
    }

    return true;
  }
}

export function getCanvasViewportDimensions(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement
): CanvasViewportDimensions {
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
    xOffset: Math.round(cssRect.xOffset * widthPerCssPixel),
    yOffset: Math.round(cssYOffsetFromBottom * heightPerCssPixel),
    width: Math.round(cssRect.width * widthPerCssPixel),
    height: Math.round(cssRect.height * heightPerCssPixel),
  };
  return {
    cssRect,
    pixelRect,
    scaling: { widthPerCssPixel, heightPerCssPixel },
  };
}

function makeCanvasCoordinates(
  clientPosition: { clientX: number; clientY: number },
  canvasViewportDimensions: CanvasViewportDimensions
): CanvasCoordinates {
  const { clientX, clientY } = clientPosition;

  // Get the position relative to the virtual canvas in CSS display space (not necessarily the same as pixel space
  // since the width and height properties of a canvas might differ from the style attributes).
  const canvasCssX = clientX - canvasViewportDimensions.cssRect.xOffset;
  const canvasCssY = clientY - canvasViewportDimensions.cssRect.yOffset;
  const cssYOffsetFromBottom = canvasViewportDimensions.cssRect.height - canvasCssY;

  // Convert the CSS space coordinates to pixel space, relative to the WebGL viewport.
  // Pixel coordinates start at (0,0) at the bottom left of the viewport.
  // https://webgl2fundamentals.org/webgl/lessons/webgl-multiple-views.html#pixel-coords
  const pixelX = Math.round(canvasCssX * canvasViewportDimensions.scaling.widthPerCssPixel);
  const pixelY = Math.round(cssYOffsetFromBottom * canvasViewportDimensions.scaling.heightPerCssPixel);

  const withinGLViewport =
    pixelX >= 0 &&
    pixelX <= canvasViewportDimensions.pixelRect.width &&
    pixelY >= 0 &&
    pixelY <= canvasViewportDimensions.pixelRect.height;

  const viewportSize = Math.min(canvasViewportDimensions.pixelRect.width, canvasViewportDimensions.pixelRect.height);
  const clipX = (pixelX - canvasViewportDimensions.pixelRect.width / 2) / viewportSize;
  const clipY = (pixelY - canvasViewportDimensions.pixelRect.height / 2) / viewportSize;

  const sqLen = clipX * clipX + clipY * clipY;

  // Calculate the z coordinate in clip space by making it inverse to the (x,y) distance from the origin.
  // Avoid values > 1 for this inverse distance.
  const clipZ = sqLen <= 0.5 ? Math.sqrt(1 - sqLen) : 1 / (2 * Math.sqrt(sqLen));

  return {
    withinGLViewport,
    canvasCssX,
    canvasCssY,
    pixelX,
    pixelY,
    clipX,
    clipY,
    clipZ,
  };
}
