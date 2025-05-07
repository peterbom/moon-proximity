import { MultiSceneDrawer } from "./multi-scene-drawer";

export function getWebGLContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("no webgl");
  }

  return gl;
}

export type MultiViewContext = {
  combinedCanvas: HTMLCanvasElement;
  virtualCanvas: HTMLElement;
  gl: WebGL2RenderingContext;
  multiSceneDrawer: MultiSceneDrawer;
};
