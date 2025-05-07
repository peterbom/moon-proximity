import { Vector4 } from "./numeric-types";

export function getScrollYLimit(): number {
  // https://stackoverflow.com/q/17688595
  return Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );
}

export function getCanvasByIdOrError(id: string): HTMLCanvasElement {
  return getElementByIdOrError<HTMLCanvasElement>(id);
}

export function getElementByIdOrError<TElem extends HTMLElement>(id: string): TElem {
  const elem = document.getElementById(id);
  if (elem === null) {
    throw new Error(`Element with id ${id} not found`);
  }

  return elem as TElem;
}

export function asCssColor(color: Vector4): string {
  return `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
}
