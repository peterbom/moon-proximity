import { createCombinedCanvas, createDivInRelativeContainer, getElementByIdOrError } from "./common/html-utils";
import { Ephemeris } from "./ephemeris";
import type { DateDistance, DatePosition, Perigee, State } from "./state-types";
import { getWebGLContext, MultiViewContext } from "./webgl/context";
import { MultiSceneDrawer } from "./webgl/multi-scene-drawer";
import { run as runDistanceTimeView } from "./views/distance-time-view";
import { run as runPerigeeTimeView } from "./views/perigee-time-view";
import { run as runPerigeeAngleView } from "./views/perigee-angle-view";
import { run as runEarthView } from "./views/earth-view";
import { run as runProximityMapView } from "./views/proximity-map-view";
import { run as runSummaryView } from "./views/summary-view";
import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { graphicRect, graphicSquare } from "./styles/graphics.module.css";
import { hidden } from "./styles/site.module.css";
import { getSavedPoints } from "./storage";

document.addEventListener("DOMContentLoaded", function () {
  const tldrCheckbox = getElementByIdOrError<HTMLInputElement>("tldr-checkbox");
  tldrCheckbox.addEventListener("change", () => state.tldrView.setValue(tldrCheckbox.checked));

  const elementsByView = getElementsByView();
  const combinedCanvas = createCombinedCanvas();
  const gl = getWebGLContext(combinedCanvas);
  const multiSceneDrawer = new MultiSceneDrawer(gl);

  state.savedPoints.setValue(getSavedPoints()); // From local storage

  state.tldrView.subscribe(() => showHideElements(elementsByView));
  state.selectedPerigee.subscribe(() => showHideElements(elementsByView));
  state.proximityShapeData.subscribe(() => showHideElements(elementsByView));
  state.terrainLocationData.subscribe(() => showHideElements(elementsByView));
  showHideElements(elementsByView);

  const newElemViewLookup: ElementFunctionLookup = {
    "distance-time-view": { run: runDistanceTimeView, classList: [graphicRect] },
    "perigee-time-view": { run: runPerigeeTimeView, classList: [graphicRect] },
    "perigee-angle-view": { run: runPerigeeAngleView, classList: [graphicRect] },
  };

  const virtualCanvasViewLookup: VirtualCanvasFunctionLookup = {
    "earth-view": { run: runEarthView, classList: [graphicSquare] },
    "proximity-map-view": { run: runProximityMapView, classList: [graphicRect] },
  };

  const existingElemViewLookup: ElementFunctionLookup = {
    "summary-view": { run: runSummaryView, classList: [] },
  };

  Object.keys(newElemViewLookup).forEach((containerId) => {
    const { run, classList } = newElemViewLookup[containerId];
    const elem = createDivInRelativeContainer(containerId, ...classList);
    run(elem, state);
  });

  Object.keys(virtualCanvasViewLookup).forEach((containerId) => {
    const { run, classList } = virtualCanvasViewLookup[containerId];
    const virtualCanvas = createDivInRelativeContainer(containerId, ...classList);
    run({ combinedCanvas, virtualCanvas, gl, multiSceneDrawer }, state);
  });

  Object.keys(existingElemViewLookup).forEach((elemId) => {
    const { run, classList } = existingElemViewLookup[elemId];
    const elem = getElementByIdOrError(elemId);
    classList.forEach((c) => elem.classList.add(c));
    run(elem, state);
  });
});

async function getEphemeris(): Promise<Ephemeris> {
  const response = await fetch("./resources/moon_eph.dat");
  if (!response.ok) {
    throw new Error(`Failed to fetch ephemeris data: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  return new Ephemeris(buffer);
}

const state: State = {
  tldrView: new NotifiableProperty<boolean>(false),
  ephPromise: getEphemeris(),
  datePositions: new DelayedProperty<DatePosition[]>(),
  dateDistances: new DelayedProperty<DateDistance[]>(),
  perigees: new DelayedProperty<Perigee[]>(),
  selectedPerigee: new NotifiableProperty(null),
  proximityShapeData: new NotifiableProperty(null),
  terrainLocationData: new NotifiableProperty(null),
  savedPoints: new NotifiableProperty([]),
};

type ElementFunctionLookup = {
  [containerId: string]: {
    run: (element: HTMLElement, state: State) => void;
    classList: string[];
  };
};
type VirtualCanvasFunctionLookup = {
  [containerId: string]: {
    run: (context: MultiViewContext, state: State) => void;
    classList: string[];
  };
};

type ElementsByView = {
  tldrElems: NodeListOf<HTMLElement>;
  longElems: NodeListOf<HTMLElement>;
  perigeeDependentElems: NodeListOf<HTMLElement>;
  locationDependentElems: NodeListOf<HTMLElement>;
};

function getElementsByView(): ElementsByView {
  const contentElem = document.querySelector(".content");
  if (!contentElem) {
    throw new Error("Content element not found.");
  }

  return {
    tldrElems: contentElem.querySelectorAll("[data-mode='tldr']"),
    longElems: contentElem.querySelectorAll("[data-mode='long']"),
    perigeeDependentElems: contentElem.querySelectorAll("[data-selection='perigee']"),
    locationDependentElems: contentElem.querySelectorAll("[data-selection='location']"),
  };
}

function showHideElements(elementsByView: ElementsByView) {
  const hiddenElems = new Set<HTMLElement>();

  const isTldrView = state.tldrView.getValue();
  const isPerigeeSelected = state.selectedPerigee.getValue() !== null;
  const isLocationSelected = isPerigeeSelected && state.terrainLocationData.getValue() !== null;

  elementsByView.tldrElems.forEach((elem) => !isTldrView && hiddenElems.add(elem));
  elementsByView.longElems.forEach((elem) => isTldrView && hiddenElems.add(elem));
  elementsByView.perigeeDependentElems.forEach((elem) => !isPerigeeSelected && hiddenElems.add(elem));
  elementsByView.locationDependentElems.forEach((elem) => !isLocationSelected && hiddenElems.add(elem));

  const allElems = [
    ...elementsByView.tldrElems,
    ...elementsByView.longElems,
    ...elementsByView.perigeeDependentElems,
    ...elementsByView.locationDependentElems,
  ];

  allElems.forEach((elem) => (hiddenElems.has(elem) ? elem.classList.add(hidden) : elem.classList.remove(hidden)));
}
