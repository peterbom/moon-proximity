import { axisBottom, axisLeft, create, D3ZoomEvent, extent, scaleLinear, zoom } from "d3";
import { asCssColor } from "../common/html-utils";
import { highlightColor, moonlightColor } from "../constants";
import type { Perigee, State } from "../state-types";
import { createPerigeeOverlay, handlePerigeeMouseout, handlePerigeeMouseover } from "./perigee-info-overlay";
import { scaleVector } from "../common/vectors";
import type { D3ScaleLinear } from "./d3-alias-types";

const pointColor = asCssColor([...highlightColor, 1]);
const moonCircleColor = asCssColor([...moonlightColor, 1]);

const deselectedMoonCircleColor = asCssColor([...scaleVector(moonlightColor, 0.4), 1]);
const deselectedPointColor = asCssColor([...scaleVector(highlightColor, 0.4), 1]);

export async function run(container: HTMLElement, state: State) {
  const perigees = await state.perigees.getValue();

  const tooltipOverlay = createPerigeeOverlay(container);

  let selectedPerigee = state.selectedPerigee.getValue();
  state.selectedPerigee.subscribe(selectedPerigeeChanged);

  // Declare the chart dimensions and margins.
  const width = container.clientWidth;
  const height = container.clientHeight;
  const marginTop = 10;
  const marginRight = 16;
  const marginBottom = 30;
  const marginLeft = 50;

  // Declare the x (angle) scale.
  const xScale = scaleLinear()
    .domain(extent(perigees, (d) => d.angleFromFullMoonDegrees) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .range([marginLeft, width - marginRight])
    .nice();

  let xZoomed = xScale;

  // Declare the y (distance) scale.
  const yScale = scaleLinear()
    .domain(extent(perigees, (d) => d.distance) as [number, number])
    .range([height - marginBottom, marginTop])
    .nice();

  // Create the zoom behavior.
  const zoomBehavior = zoom<SVGSVGElement, undefined>()
    .scaleExtent([1, 32])
    .extent([
      [marginLeft, marginTop],
      [width - marginRight, height - marginBottom],
    ])
    .translateExtent([
      [marginLeft, -Infinity],
      [width - marginRight, Infinity],
    ])
    .on("zoom", zoomed);

  // Create the SVG container.
  const svg = create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto;");

  // Create a clip-path with a unique ID.
  const clipId = "distance-time-clip";
  svg
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", marginLeft)
    .attr("y", marginTop)
    .attr("width", width - marginLeft - marginRight)
    .attr("height", height - marginTop - marginBottom);

  const points = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle")
    .data(perigees)
    .enter()
    .append("circle")
    .attr("cx", (p) => xScale(p.angleFromFullMoonDegrees))
    .attr("cy", (p) => yScale(p.distance))
    .attr("r", getRadius)
    .attr("stroke", getCircleOutlineColor)
    .attr("stroke-width", (p) => (p.isSuperMoon || p.isSuperNewMoon ? 2 : 0))
    .attr("fill", getCircleColor)
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) =>
      handlePerigeeMouseover(tooltipOverlay, p, xZoomed(p.angleFromFullMoonDegrees), yScale(p.distance))
    )
    .on("mouseout", () => handlePerigeeMouseout(tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  // Add the x-axis.
  const xAxis = svg.append("g").attr("transform", `translate(0,${height - marginBottom})`);

  // Create the horizontal axis scaler, called at startup and when zooming.
  const scaleXAxis = (x: D3ScaleLinear) =>
    xAxis.call(
      axisBottom(x)
        .ticks(width / 80)
        .tickSizeOuter(0)
    );

  scaleXAxis(xScale);

  // Add the y-axis.
  svg.append("g").attr("transform", `translate(${marginLeft},0)`).call(axisLeft(yScale));

  // Initial zoom.
  svg.call(zoomBehavior).call(zoomBehavior.scaleTo, 8, [0, 0]);

  // Append the SVG element.
  container.append(svg.node()!);

  // When zooming, redraw the area and the x axis.
  function zoomed(event: D3ZoomEvent<SVGElement, undefined>) {
    xZoomed = event.transform.rescaleX(xScale);
    points.attr("cx", (d) => xZoomed(d.angleFromFullMoonDegrees));
    scaleXAxis(xZoomed);
  }

  function selectedPerigeeChanged(perigee: Perigee | null) {
    selectedPerigee = perigee;
    // Move selected perigee to the end so that it appears on top of others.
    points.sort((a, b) => (a === selectedPerigee ? 1 : b === selectedPerigee ? -1 : 0));
    points.attr("stroke", getCircleOutlineColor).attr("fill", getCircleColor).attr("r", getRadius);
  }

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
