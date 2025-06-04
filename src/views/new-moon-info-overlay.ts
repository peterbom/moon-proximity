import { createTextOverlay, OverlayElement, setAbsoluteStyleRect } from "../common/html-utils";
import { radToDeg } from "../common/math";
import { toFriendlyUTC } from "../common/text-utils";
import type { NewMoon } from "../state-types";
import { overlay } from "../styles/site.module.css";

const newMoonDisplayHtml = `
<div>date: <span data-var="date"></span></div>
<div>∠ Sun-Moon: <span data-var="angle"></span>°</div>
<div>coverage: <span data-var="coverage"></span>%</div>
`;

export type NewMoonElems = {
  date: Element;
  angle: Element;
  coverage: Element;
};

function getNewMoonElems(parent: Element): NewMoonElems {
  return {
    date: parent.querySelector("span[data-var='date']")!,
    angle: parent.querySelector("span[data-var='angle']")!,
    coverage: parent.querySelector("span[data-var='coverage']")!,
  };
}

export function createNewMoonOverlay(placementElement: Element) {
  return createTextOverlay(placementElement, newMoonDisplayHtml, getNewMoonElems, overlay);
}

export function handleNewMoonMouseout(overlayElement: OverlayElement<NewMoonElems>) {
  setAbsoluteStyleRect(overlayElement.overlay, false, {});
}

export function handleNewMoonMouseover(
  overlayElement: OverlayElement<NewMoonElems>,
  newMoon: NewMoon,
  cssX: number,
  cssY: number
) {
  setAbsoluteStyleRect(overlayElement.overlay, true, {
    left: cssX,
    top: cssY,
  });

  overlayElement.content.date.textContent = toFriendlyUTC(newMoon.date);
  overlayElement.content.angle.textContent = radToDeg(newMoon.angleBetweenMoonAndSun).toFixed(2);
  overlayElement.content.coverage.textContent = ((newMoon.moonVisibleAngle / newMoon.sunVisibleAngle) * 100).toFixed(1);
}
