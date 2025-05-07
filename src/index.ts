import { getCanvasByIdOrError, getElementByIdOrError, getScrollYLimit } from "./common/html-utils";
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

onbeforeunload = function (e) {
  localStorage.setItem("mp-scrollpos", window.scrollY.toString());
};

document.addEventListener("DOMContentLoaded", function () {
  const storedScrollpos = localStorage.getItem("mp-scrollpos");
  if (storedScrollpos) {
    const scrollPos = Math.min(parseInt(storedScrollpos), getScrollYLimit());
    window.scrollTo(0, scrollPos);
  }

  const combinedCanvas = getCanvasByIdOrError("combined-canvas");
  const gl = getWebGLContext(combinedCanvas);
  const multiSceneDrawer = new MultiSceneDrawer(gl);

  const elemViewLookup: {
    [elementId: string]: (element: HTMLElement, state: State) => void;
  } = {
    "distance-time-view": runDistanceTimeView,
    "perigee-time-view": runPerigeeTimeView,
    "perigee-angle-view": runPerigeeAngleView,
  };

  const webglViewLookup: {
    [virtualCanvasId: string]: (context: MultiViewContext, state: State) => void;
  } = {
    "earth-view": runEarthView,
    "proximity-map-view": runProximityMapView,
  };

  Object.keys(elemViewLookup).forEach((elementId) => {
    const elem = getElementByIdOrError(elementId);
    elemViewLookup[elementId](elem, state);
  });

  Object.keys(webglViewLookup).forEach((virtualCanvasId) => {
    const virtualCanvas = getElementByIdOrError(virtualCanvasId);
    webglViewLookup[virtualCanvasId]({ combinedCanvas, virtualCanvas, gl, multiSceneDrawer }, state);
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
