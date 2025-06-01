import { createCombinedCanvas, createDivInRelativeContainer, getElementByIdOrError } from "./common/html-utils";
import { Ephemeris, SeriesMetadata, SeriesType } from "./ephemeris";
import type { DateDistance, DatePosition, State } from "./state-types";
import { getWebGLContext, MultiViewContext } from "./webgl/context";
import { MultiSceneDrawer } from "./webgl/multi-scene-drawer";
import { run as runTimeRangeView } from "./views/time-range-view";
import { run as runDistanceTimeView } from "./views/distance-time-view";
import { run as runPerigeeTimeView } from "./views/perigee-time-view";
import { run as runPerigeeAngleView } from "./views/perigee-angle-view";
import { run as runEarthView } from "./views/earth-view";
import { run as runProximityMapView } from "./views/proximity-map-view";
import { run as runSummaryView } from "./views/summary-view";
import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { graphicLine, graphicRect, graphicSquare } from "./styles/graphics.module.css";
import { hidden } from "./styles/site.module.css";
import { getIndexedDb, getSavedPoints, getSavedTldr, readEphemeris, saveTldr, storeEphemeris } from "./storage";

document.addEventListener("DOMContentLoaded", function () {
  // Load initial data from local storage
  state.tldrView.setValue(getSavedTldr());
  state.savedPoints.setValue(getSavedPoints());

  const tldrCheckbox = getElementByIdOrError<HTMLInputElement>("tldr-checkbox");
  tldrCheckbox.checked = state.tldrView.getValue();
  tldrCheckbox.addEventListener("change", () => {
    state.tldrView.setValue(tldrCheckbox.checked);
    saveTldr(tldrCheckbox.checked);
  });

  const elementsByView = getElementsByView();
  const combinedCanvas = createCombinedCanvas();
  const gl = getWebGLContext(combinedCanvas);
  const multiSceneDrawer = new MultiSceneDrawer(gl);

  state.tldrView.subscribe(() => showHideElements(elementsByView));
  state.selectedPerigee.subscribe(() => showHideElements(elementsByView));
  state.proximityShapeData.subscribe(() => showHideElements(elementsByView));
  state.terrainLocationData.subscribe(() => showHideElements(elementsByView));
  showHideElements(elementsByView);

  const newElemViewLookup: ElementFunctionLookup = {
    "time-range-view": { run: runTimeRangeView, classList: [graphicLine] },
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
  const db = await getIndexedDb();
  if (db === null) {
    const response = await fetchEphemeris();
    const buffer = await response.arrayBuffer();
    return new Ephemeris(new DataView(buffer), ephemerisMetadata, ephemerisStartDate);
  }

  let ephemerisBlob = await readEphemeris(db);
  if (ephemerisBlob === null) {
    const response = await fetchEphemeris();
    ephemerisBlob = await response.blob();
    await storeEphemeris(db, ephemerisBlob);
  }

  const buffer = await ephemerisBlob.arrayBuffer();
  return new Ephemeris(new DataView(buffer), ephemerisMetadata, ephemerisStartDate);
}

async function fetchEphemeris(): Promise<Response> {
  const response = await fetch("./resources/ephemeris.dat");
  if (!response.ok) {
    throw new Error(`Failed to fetch ephemeris data: ${response.status}`);
  }

  return response;
}

const nowDate = new Date();
const initialStartDate = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()));
const initialEndDate = new Date(Date.UTC(nowDate.getUTCFullYear() + 5, nowDate.getUTCMonth(), nowDate.getUTCDate()));

const state: State = {
  tldrView: new NotifiableProperty<boolean>(false),
  ephPromise: getEphemeris(),
  timeRange: new NotifiableProperty({
    startDate: initialStartDate,
    endDate: initialEndDate,
  }),
  datePositions: new DelayedProperty<DatePosition[]>(),
  dateDistances: new DelayedProperty<DateDistance[]>(),
  perigees: new NotifiableProperty([]),
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
  collationDependentElems: NodeListOf<HTMLElement>;
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
    collationDependentElems: contentElem.querySelectorAll("[data-selection='collation']"),
  };
}

function showHideElements(elementsByView: ElementsByView) {
  const hiddenElems = new Set<HTMLElement>();

  const isTldrView = state.tldrView.getValue();
  const isPerigeeSelected = state.selectedPerigee.getValue() !== null;
  const hasCollationData = state.terrainLocationData.getValue() !== null || state.savedPoints.getValue().length > 0;

  elementsByView.tldrElems.forEach((elem) => !isTldrView && hiddenElems.add(elem));
  elementsByView.longElems.forEach((elem) => isTldrView && hiddenElems.add(elem));
  elementsByView.perigeeDependentElems.forEach((elem) => !isPerigeeSelected && hiddenElems.add(elem));
  elementsByView.collationDependentElems.forEach((elem) => !hasCollationData && hiddenElems.add(elem));

  const allElems = [
    ...elementsByView.tldrElems,
    ...elementsByView.longElems,
    ...elementsByView.perigeeDependentElems,
    ...elementsByView.collationDependentElems,
  ];

  allElems.forEach((elem) => (hiddenElems.has(elem) ? elem.classList.add(hidden) : elem.classList.remove(hidden)));
}

const ephemerisStartDate = 2451536.5; // 1999-12-24T00:00:00.000Z
const ephemerisMetadata = new Map<SeriesType, SeriesMetadata>([
  [
    SeriesType.SsbToEmb,
    {
      seriesType: 0,
      intervalDurationDays: 16,
      propertyCount: 3,
      coeffCount: 13,
      offset: 0,
      sizeInBytes: 712608,
    },
  ],
  [
    SeriesType.EarthToMoon,
    {
      seriesType: 1,
      intervalDurationDays: 4,
      propertyCount: 3,
      coeffCount: 13,
      offset: 712608,
      sizeInBytes: 2850432,
    },
  ],
  [
    SeriesType.SsbToSun,
    {
      seriesType: 2,
      intervalDurationDays: 16,
      propertyCount: 3,
      coeffCount: 4,
      offset: 3563040,
      sizeInBytes: 219264,
    },
  ],
]);
