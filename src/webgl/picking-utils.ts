import type { Vector4 } from "../common/numeric-types";
import { addMouseListeners, MouseEventListeners } from "./canvas-interaction";
import type { CanvasCoordinates, ScreenRect } from "./dimension-types";
import { uint16ToFloat } from "./format-conversion";
import { PickingOutputTextureInfos } from "./programs/picking";
import { FramebufferRenderTarget } from "./render-target";
import { InternalFormat, TextureDefinition } from "./texture-definition";

export function createPickingRenderTarget(
  gl: WebGL2RenderingContext,
  internalFormat: InternalFormat
): FramebufferRenderTarget<PickingOutputTextureInfos> {
  return FramebufferRenderTarget.createFitToViewport<PickingOutputTextureInfos>(gl, {
    id: { attachmentIndex: 0, definition: new TextureDefinition("R16UI") },
    values: { attachmentIndex: 1, definition: new TextureDefinition(internalFormat) },
  }).withDepthTexture("DEPTH_COMPONENT24");
}

export type MousePickResult = { id: number; values: Vector4 };
export type MousePickCallback = (coords: CanvasCoordinates, result: MousePickResult) => void;

export interface MouseMovePickingHandlers {
  clean(): void;
}

export function createMouseMovePicking(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  pickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>,
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

      const idData = pickingRenderTarget.readColorTexture("id", rect);
      const valueData = pickingRenderTarget.readColorTexture("values", rect);
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
