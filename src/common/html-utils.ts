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
