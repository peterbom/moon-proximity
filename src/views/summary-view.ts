import type { State, TerrainLocationData } from "../state-types";
import { hidden } from "../styles/site.module.css";

export function run(container: HTMLElement, state: State) {
  const earthElem: HTMLElement = container.querySelector("[data-var='earth']")!;
  const resources: ViewResources = {
    container,
    distElem: container.querySelector("[data-var='dist']")!,
    latElem: container.querySelector("[data-var='lat']")!,
    lonElem: container.querySelector("[data-var='lon']")!,
    elevElem: container.querySelector("[data-var='elev']")!,
    dateElem: container.querySelector("[data-var='date']")!,
    earthElem,
    earthLink: earthElem.querySelector("a")!,
  };

  state.terrainLocationData.subscribe((data) => runWithData(resources, data));
  runWithData(resources, state.terrainLocationData.getValue());
}

function runWithData(resources: ViewResources, data: TerrainLocationData | null) {
  if (data === null) {
    resources.container.classList.add(hidden);
    return;
  }

  resources.container.classList.remove(hidden);

  resources.distElem.innerText = (Math.round(data.distanceToMoonInKm * 1000) / 1000).toLocaleString() + " km";
  resources.latElem.innerText = data.latitudeDegrees.toFixed(3) + "°";
  resources.lonElem.innerText = data.longitudeDegrees.toFixed(3) + "°";
  resources.elevElem.innerText = Math.round(data.altitudeInM).toLocaleString() + " m";
  resources.dateElem.innerText = data.optimalDate.toISOString();

  const lat = data.latitudeDegrees.toFixed(6);
  const lon = data.longitudeDegrees.toFixed(6);
  const alt = data.altitudeInM.toFixed();
  const camDist = 50000;
  const tilt = 70;
  resources.earthLink.href = `https://earth.google.com/web/@${lat},${lon},${alt}a,${camDist}d,${tilt}t`;
}

type ViewResources = {
  container: HTMLElement;
  distElem: HTMLElement;
  latElem: HTMLElement;
  lonElem: HTMLElement;
  elevElem: HTMLElement;
  dateElem: HTMLElement;
  earthElem: HTMLElement;
  earthLink: HTMLAnchorElement;
};
