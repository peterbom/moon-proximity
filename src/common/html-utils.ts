import { splitByProperty } from "./iteration";
import { Vector4 } from "./numeric-types";
import {
  absolute,
  canvasOverlay,
  checkboxControl,
  combinedCanvas,
  controlGroup,
  relativeContainer,
  singleControl,
  singleControlLabel,
  singleControlValue,
  sliderControl,
} from "./styles/common.module.css";

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

export function createCombinedCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.classList.add(combinedCanvas);
  document.body.appendChild(canvas);
  return canvas;
}

export function createDivInRelativeContainer(containerId: string, ...canvasClassNames: string[]): HTMLDivElement {
  const container = getElementByIdOrError(containerId);
  container.classList.add(relativeContainer);
  const div = document.createElement("div");
  canvasClassNames.forEach((className) => div.classList.add(className));
  container.appendChild(div);
  return div;
}

export function getElementByIdOrError<TElem extends HTMLElement>(id: string): TElem {
  const elem = document.getElementById(id);
  if (elem === null) {
    throw new Error(`Element with id ${id} not found`);
  }

  return elem as TElem;
}

export function createNumericInput(
  value: number,
  min: number,
  max: number,
  decimalPlaces: number,
  handleChange?: (value: number) => void
): HTMLInputElement {
  const stepsPerUnit = Math.pow(10, decimalPlaces);
  const input = document.createElement("input");
  input.type = "number";
  input.min = min.toString();
  input.max = max.toString();
  input.step = (1 / stepsPerUnit).toString();
  input.value = (Math.round(value * stepsPerUnit) / stepsPerUnit).toString();

  const parse = decimalPlaces > 0 ? parseFloat : parseInt;

  if (handleChange) {
    input.addEventListener("change", () => handleChange(parse(input.value)));
  }

  return input;
}

export type ElemsWithData<TElems, TData> = {
  elems: TElems;
  data: TData;
};

export function updateElementsFromData<TElems, TData>(
  elemsWithDataItems: ElemsWithData<TElems, TData>[],
  dataItems: TData[],
  parentElem: Element,
  getChild: (elems: TElems) => Element,
  createElem: (rowData: TData) => TElems
): ElemsWithData<TElems, TData>[] {
  // Remove elements not in the data.
  const { matching: toInclude, notMatching: toDelete } = splitByProperty(
    elemsWithDataItems,
    (e) => dataItems.indexOf(e.data) >= 0
  );

  toDelete.forEach((e) => parentElem.removeChild(getChild(e.elems)));

  // Add missing items from the data.
  const result: ElemsWithData<TElems, TData>[] = [];
  for (const data of dataItems) {
    const pair = toInclude.find((e) => e.data === data) || { data, elems: createElem(data) };
    result.push(pair);
    parentElem.appendChild(getChild(pair.elems));
  }

  return result;
}

export function asCssColor(color: Vector4): string {
  return `rgba(${color[0] * 255}, ${color[1] * 255}, ${color[2] * 255}, ${color[3]})`;
}

export type OverlayElement<TElem> = {
  overlay: HTMLDivElement;
  content: TElem;
};

export function createTextOverlay<TElem>(
  canvasPlacementElement: Element,
  innerHTML: string,
  getElem: (parent: Element) => TElem,
  ...classNames: string[]
): OverlayElement<TElem> {
  const relativeContainer = getRelativeContainerOrError(canvasPlacementElement);
  const overlay = document.createElement("div");
  overlay.classList.add(canvasOverlay);
  classNames.forEach((className) => overlay.classList.add(className));
  overlay.style.display = "none";
  overlay.innerHTML = innerHTML;
  relativeContainer.appendChild(overlay);
  return {
    overlay,
    content: getElem(overlay),
  };
}

function getRelativeContainerOrError(element: Element): Element {
  const container = element.closest(`.${relativeContainer}`);
  if (container === null) {
    throw new Error(`Element does not have a parent with class ${relativeContainer}.`);
  }

  return container;
}

export type StyleRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function setAbsoluteStyleRect(elem: HTMLElement, visible: boolean, rect: Partial<StyleRect>) {
  elem.style.display = visible ? "" : "none";
  setPx((style, value) => (style.left = value), rect.left);
  setPx((style, value) => (style.top = value), rect.top);
  setPx((style, value) => (style.width = value), rect.width);
  setPx((style, value) => (style.height = value), rect.height);

  function setPx(setter: (style: CSSStyleDeclaration, value: string) => void, value: number | undefined) {
    if (value !== undefined) {
      setter(elem.style, `${value}px`);
    }
  }
}

export type CheckedChangedHandler = (checked: boolean) => void;

export type CheckboxOptions = {
  checked: boolean;
  changed: CheckedChangedHandler;
};

export function setupCheckbox(canvasPlacementElement: Element, label: string, options: CheckboxOptions): Element {
  const relativeContainer = getRelativeContainerOrError(canvasPlacementElement);
  const controlGroupElement = getOrCreateControlGroup(relativeContainer);
  const singleControlElement = getOrCreateSingleControlElement(controlGroupElement, label);

  singleControlElement.innerHTML = `
    <div class="${singleControlLabel}">${label}</div>
    <input class="${checkboxControl}" type="checkbox" />
  `;

  const checkboxElem = singleControlElement.querySelector(`.${checkboxControl}`) as HTMLInputElement;
  checkboxElem.checked = options.checked;

  function handleChange(event: Event) {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    options.changed(event.target.checked);
  }

  checkboxElem.addEventListener("change", handleChange);
  return singleControlElement;
}

export type SlideHandler = (value: number) => void;

export type SliderOptions = {
  updated: SlideHandler;
  precision: number;
  min: number;
  max: number;
  step: number;
  value: number;
  displayVal: (value: number, precision: number) => string;
};

const defaultSliderOptions: SliderOptions = {
  updated: (value) => {
    console.log(value);
  },
  precision: 0,
  min: 0,
  max: 1,
  step: 1,
  value: 0,
  displayVal: (value, precision) => value.toFixed(precision),
};

export function setupSlider(
  canvasPlacementElement: Element,
  label: string,
  options: Partial<SliderOptions> = {}
): Element {
  const { updated, precision, min, max, step, value, displayVal } = { ...defaultSliderOptions, ...options };

  const relativeContainer = getRelativeContainerOrError(canvasPlacementElement);
  const controlGroupElement = getOrCreateControlGroup(relativeContainer);
  const singleControlElement = getOrCreateSingleControlElement(controlGroupElement, label);

  const sliderMin = min / step;
  const sliderMax = max / step;
  const sliderValue = value / step;

  singleControlElement.innerHTML = `
    <div class="${singleControlLabel}">${label}</div>
    <div class="${singleControlValue}"></div>
    <input class="${sliderControl}" type="range" min="${sliderMin}" max="${sliderMax}" value="${sliderValue}" />
  `;

  const valueElem = singleControlElement.querySelector(`.${singleControlValue}`) as HTMLDivElement;
  const sliderElem = singleControlElement.querySelector(`.${sliderControl}`) as HTMLInputElement;

  function updateValue(sliderValue: number) {
    const displayValue = sliderValue * step;
    valueElem.textContent = displayVal(displayValue, precision);
  }

  updateValue(sliderValue);

  function handleChange(event: Event) {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    const value = parseInt(event.target.value);
    updateValue(value);
    updated(value * step);
  }

  sliderElem.addEventListener("input", handleChange);
  sliderElem.addEventListener("change", handleChange);

  return singleControlElement;
}

function getOrCreateControlGroup(relativeContainer: Element): Element {
  const controlGroupElements = relativeContainer.getElementsByClassName(controlGroup);
  if (controlGroupElements.length > 0) {
    return controlGroupElements[0];
  }

  const controlGroupElement = document.createElement("div");
  controlGroupElement.classList.add(controlGroup);
  relativeContainer.appendChild(controlGroupElement);
  return controlGroupElement;
}

function getOrCreateSingleControlElement(controlGroupElem: Element, label: string): Element {
  let singleControlElement = controlGroupElem.querySelector(`[data-label="${label}"]`);
  if (singleControlElement !== null) {
    return singleControlElement;
  }

  singleControlElement = document.createElement("div");
  singleControlElement.setAttribute("data-label", label);
  singleControlElement.classList.add(singleControl);
  controlGroupElem.appendChild(singleControlElement);

  return singleControlElement;
}

export function getOrCreateAbsolutePositionCanvas(
  canvasPlacementElement: Element,
  position: StyleRect,
  id: { name: string; number: number }
): HTMLCanvasElement {
  const relativeContainerElem = getRelativeContainerOrError(canvasPlacementElement);
  const elemId = `${id.name}${id.number}`;
  let canvasElem = relativeContainerElem.querySelector(`canvas#${elemId}`) as HTMLCanvasElement;
  if (canvasElem === null) {
    canvasElem = document.createElement("canvas");
    canvasElem.setAttribute("id", elemId);
    canvasElem.classList.add(absolute);
    relativeContainerElem.appendChild(canvasElem);
  }

  setAbsoluteStyleRect(canvasElem, true, position);
  return canvasElem;
}
