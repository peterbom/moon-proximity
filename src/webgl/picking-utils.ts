import type { Vector4 } from "../common/numeric-types";
import { addMouseListeners, MouseEventListeners } from "./canvas-interaction";
import type { CanvasCoordinates, ScreenRect } from "./dimension-types";
import { uint16ToFloat } from "./format-conversion";
import { FramebufferRenderTarget } from "./render-target";
import { InternalFormat, TextureDefinition } from "./texture-definition";

export function createPickingRenderTarget(
  gl: WebGL2RenderingContext,
  internalFormat: InternalFormat
): FramebufferRenderTarget {
  const idTextureDef = new TextureDefinition("R16UI");
  const valueTextureDef = new TextureDefinition(internalFormat);
  return FramebufferRenderTarget.createFitToViewport(gl)
    .withDepthTexture("DEPTH_COMPONENT24")
    .withColorTexture(0, idTextureDef)
    .withColorTexture(1, valueTextureDef);
}

export type MousePickResult = { id: number; values: Vector4 };
export type MousePickCallback = (coords: CanvasCoordinates, result: MousePickResult) => void;

export interface MouseMovePickingHandlers {
  clean(): void;
}

export function createMouseMovePicking(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  pickingRenderTarget: FramebufferRenderTarget,
  callback: MousePickCallback
): MouseMovePickingHandlers {
  const listeners: MouseEventListeners = {
    move(coords) {
      if (!pickingRenderTarget.checkFramebufferStatus) {
        return;
      }

      const rect: ScreenRect = {
        xOffset: coords.pixelX,
        yOffset: coords.pixelY,
        width: 1,
        height: 1,
      };

      const idData = pickingRenderTarget.readColorTexture(0, rect);
      const valueData = pickingRenderTarget.readColorTexture(1, rect);
      const values: Vector4 = [0, 0, 0, 0];
      for (let i = 0; i < valueData.valuesPerPixel; i++) {
        let componentValue = valueData.buffer[i];
        if (valueData.type === WebGL2RenderingContext.HALF_FLOAT) {
          componentValue = uint16ToFloat(componentValue);
        }

        values[i] = componentValue;
      }

      callback(coords, { id: idData.buffer[0], values });
    },
  };

  const mouseHandlers = addMouseListeners(combinedCanvas, virtualCanvas, listeners);
  return {
    clean: mouseHandlers.clean,
  };
}
