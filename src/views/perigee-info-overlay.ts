import { asCssColor, createTextOverlay, OverlayElement, setAbsoluteStyleRect } from "../common/html-utils";
import { radToDeg } from "../common/math";
import { toFriendlyUTC } from "../common/text-utils";
import { scaleVector } from "../common/vectors";
import { highlightColor, moonlightColor } from "../constants";
import type { Perigee } from "../state-types";
import { overlay } from "../styles/site.module.css";
import { Selection as D3Selection } from "d3";

const perigeeDisplayHtml = `
<div>date: <span data-var="date"></span></div>
<div>distance: <span data-var="distance"></span>km</div>
<div>∠ from full moon: <span data-var="angle"></span>°</div>
<div><span data-var="angle-info"></span></div>
`;

export type PerigeeElems = {
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
  overlayElement.content.distance.textContent = perigee.moonDistance.toFixed(2);
  overlayElement.content.angle.textContent = (180 - radToDeg(perigee.angleBetweenMoonAndSun)).toFixed(1);
  overlayElement.content.angleInfo.textContent = angleExtraInfo;
}

const moonCircleColor = asCssColor([...moonlightColor, 1]);
const pointColor = asCssColor([...highlightColor, 1]);

const deselectedMoonCircleColor = asCssColor([...scaleVector(moonlightColor, 0.4), 1]);
const deselectedPointColor = asCssColor([...scaleVector(highlightColor, 0.4), 1]);

export function setPointsAppearance(
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>,
  selectedPerigee: Perigee | null
): D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined> {
  return points
    .attr("stroke", getCircleOutlineColor)
    .attr("stroke-width", (p) => (p.isSuperMoon || p.isSuperNewMoon ? 2 : 0))
    .attr("fill", getCircleColor)
    .attr("r", getRadius);

  function getRadius(perigee: Perigee): number {
    return perigee === selectedPerigee ? 9 : 6;
  }

  function getCircleOutlineColor(perigee: Perigee): string {
    if (selectedPerigee === null || selectedPerigee === perigee) {
      return moonCircleColor;
    }

    return deselectedMoonCircleColor;
  }

  function getCircleColor(perigee: Perigee): string {
    if (selectedPerigee === null || selectedPerigee === perigee) {
      return perigee.isSuperMoon ? moonCircleColor : perigee.isSuperNewMoon ? "#000" : pointColor;
    }

    return perigee.isSuperMoon ? deselectedMoonCircleColor : perigee.isSuperNewMoon ? "#000" : deselectedPointColor;
  }
}
