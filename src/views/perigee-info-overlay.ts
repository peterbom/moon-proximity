import { createTextOverlay, OverlayElement, setAbsoluteStyleRect } from "../common/html-utils";
import { toFriendlyUTC } from "../common/text-utils";
import type { Perigee } from "../state-types";
import { overlay } from "../styles/site.module.css";

const perigeeDisplayHtml = `
<div>date: <span data-var="date"></span></div>
<div>distance: <span data-var="distance"></span>km</div>
<div>∠ from full moon: <span data-var="angle"></span>°</div>
<div><span data-var="angle-info"></span></div>
`;

type PerigeeElems = {
  date: Element;
  distance: Element;
  angle: Element;
  angleInfo: Element;
};

function getPerigeeElems(parent: Element): PerigeeElems {
  return {
    date: parent.querySelector("span[data-var='date']")!,
    distance: parent.querySelector("span[data-var='distance']")!,
    angle: parent.querySelector("span[data-var='angle']")!,
    angleInfo: parent.querySelector("span[data-var='angle-info']")!,
  };
}

export function createPerigeeOverlay(placementElement: Element) {
  return createTextOverlay(placementElement, perigeeDisplayHtml, getPerigeeElems, overlay);
}

export function handlePerigeeMouseout(overlayElement: OverlayElement<PerigeeElems>) {
  setAbsoluteStyleRect(overlayElement.overlay, false, {});
}

export function handlePerigeeMouseover(
  overlayElement: OverlayElement<PerigeeElems>,
  perigee: Perigee,
  cssX: number,
  cssY: number
) {
  setAbsoluteStyleRect(overlayElement.overlay, true, {
    left: cssX,
    top: cssY,
  });

  const angleExtraInfo = perigee.isSuperMoon
    ? `${perigee.hoursFromFullMoon.toFixed(1)} hours from Super Moon`
    : perigee.isSuperNewMoon
    ? `${perigee.hoursFromNewMoon.toFixed(1)} hours from Super New Moon`
    : "";

  overlayElement.content.date.textContent = toFriendlyUTC(perigee.date);
  overlayElement.content.distance.textContent = perigee.distance.toFixed(2);
  overlayElement.content.angle.textContent = perigee.angleFromFullMoonDegrees.toFixed(1);
  overlayElement.content.angleInfo.textContent = angleExtraInfo;
}
