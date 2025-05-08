import { createCombinedCanvas, createDivInRelativeContainer, getScrollYLimit } from "./common/html-utils";
import { Ephemeris } from "./ephemeris";
import type { DateDistance, DatePosition, Perigee, State } from "./state-types";
import { getWebGLContext, MultiViewContext } from "./webgl/context";
import { MultiSceneDrawer } from "./webgl/multi-scene-drawer";
import { run as runDistanceTimeView } from "./views/distance-time-view";
import { run as runPerigeeTimeView } from "./views/perigee-time-view";
import { run as runPerigeeAngleView } from "./views/perigee-angle-view";
import { run as runEarthView } from "./views/earth-view";
import { run as runProximityMapView } from "./views/proximity-map-view";
import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { graphicRect, graphicSquare } from "./styles/graphics.module.css";

onbeforeunload = function (e) {
  localStorage.setItem("mp-scrollpos", window.scrollY.toString());
};

document.addEventListener("DOMContentLoaded", function () {
  const storedScrollpos = localStorage.getItem("mp-scrollpos");
  if (storedScrollpos) {
    const scrollPos = Math.min(parseInt(storedScrollpos), getScrollYLimit());
    window.scrollTo(0, scrollPos);
  }

  const combinedCanvas = createCombinedCanvas();
  const gl = getWebGLContext(combinedCanvas);
  const multiSceneDrawer = new MultiSceneDrawer(gl);

  const elemViewLookup: ElementFunctionLookup = {
    "distance-time-view": { run: runDistanceTimeView, classList: [graphicRect] },
    "perigee-time-view": { run: runPerigeeTimeView, classList: [graphicRect] },
    "perigee-angle-view": { run: runPerigeeAngleView, classList: [graphicRect] },
  };

  const virtualCanvasViewLookup: VirtualCanvasFunctionLookup = {
    "earth-view": { run: runEarthView, classList: [graphicSquare] },
    "proximity-map-view": { run: runProximityMapView, classList: [graphicRect] },
  };

  Object.keys(elemViewLookup).forEach((containerId) => {
    const { run, classList } = elemViewLookup[containerId];
    const elem = createDivInRelativeContainer(containerId, ...classList);
    run(elem, state);
  });

  Object.keys(virtualCanvasViewLookup).forEach((containerId) => {
    const { run, classList } = virtualCanvasViewLookup[containerId];
    const virtualCanvas = createDivInRelativeContainer(containerId, ...classList);
    run({ combinedCanvas, virtualCanvas, gl, multiSceneDrawer }, state);
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
  ephPromise: getEphemeris(),
  datePositions: new DelayedProperty<DatePosition[]>(),
  dateDistances: new DelayedProperty<DateDistance[]>(),
  perigees: new DelayedProperty<Perigee[]>(),
  selectedPerigee: new NotifiableProperty(null),
  proximityShapeData: new NotifiableProperty(null),
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
