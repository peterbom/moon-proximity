import { Cleaner } from "../common/cleanup";
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

export interface PickingEventListeners {
  hover?: MousePickCallback;
  click?: MousePickCallback;
}

export function createMouseMovePicking(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  pickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>,
  pickingListeners: PickingEventListeners
): Cleaner {
  const listeners: MouseEventListeners = {
    move(coords) {
      if (pickingListeners.hover) {
        const pickingResult = getMousePickResult(coords, pickingRenderTarget);
        if (pickingResult === null) {
          return;
        }

        pickingListeners.hover(coords, pickingResult);
      }
    },
    click(coords) {
      if (pickingListeners.click) {
        const pickingResult = getMousePickResult(coords, pickingRenderTarget);
        if (pickingResult === null) {
          return;
        }
        pickingListeners.click(coords, pickingResult);
      }
    },
  };

  return addMouseListeners(combinedCanvas, virtualCanvas, listeners);
}

function getMousePickResult(
  coords: CanvasCoordinates,
  pickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>
): MousePickResult | null {
  if (!pickingRenderTarget.checkFramebufferStatus(false)) {
    return null;
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

  return { id: idData.buffer[0], values };
}
