/*
Line chart based on:
- https://observablehq.com/@d3/line-chart/2 (simple)
- https://observablehq.com/@d3/zoomable-area-chart (zooming)
*/

import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent } from "d3";
import { getDistance, getEarthAndMoonPositions } from "../calculations";
import { asCssColor } from "../common/html-utils";
import { seqStep } from "../common/iteration";
import { displayEndDate, displayStartDate, highlightColor } from "../constants";
import type { DateDistance, DatePosition, State } from "../state-types";
import type { D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getAstronomicalTime } from "../time";

const lineColor = asCssColor([...highlightColor, 1]);

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const { datePositions, dateDistances } = getDatePositionsAndDistances(ephemeris);

  state.datePositions.setValue(datePositions);
  state.dateDistances.setValue(dateDistances);

  // Declare the chart dimensions and margins.
  const width = container.clientWidth;
  const height = container.clientHeight;
  const marginTop = 10;
  const marginRight = 16;
  const marginBottom = 30;
  const marginLeft = 50;

  // Declare the x (time) scale.
  const xScale = scaleUtc()
    .domain([displayStartDate, displayEndDate])
    .range([marginLeft, width - marginRight])
    .nice();

  // Declare the y (distance) scale.
  const yScale = scaleLinear()
    .domain(extent(dateDistances, (d) => d.distance) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .range([height - marginBottom, marginTop])
    .nice();

  // Given a time scaling function, constructs a 'd' attribute value (string representation of the line).
  const makeLine = (xScalingFunction: D3ScaleTime) =>
    line<DateDistance>()
      .x((d) => xScalingFunction(d.date))
      .y((d) => yScale(d.distance))
      .curve(curveNatural)(dateDistances);

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

  // Append a path for the line.
  const path = svg
    .append("path")
    .attr("clip-path", `url(#${clipId})`)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 1)
    .attr("d", makeLine(xScale));

  // Add the x-axis.
  const xAxis = svg.append("g").attr("transform", `translate(0,${height - marginBottom})`);

  // Create the horizontal axis scaler, called at startup and when zooming.
  const scaleXAxis = (x: D3ScaleTime) =>
    xAxis.call(
      axisBottom(x)
        .ticks(width / 80)
        .tickSizeOuter(0)
    );

  scaleXAxis(xScale);

  // Add the y-axis.
  svg.append("g").attr("transform", `translate(${marginLeft},0)`).call(axisLeft(yScale));

  // Initial zoom.
  svg.call(zoomBehavior).call(zoomBehavior.scaleTo, 2, [xScale(displayStartDate), 0]);

  // Append the SVG element.
  container.append(svg.node()!);

  // When zooming, redraw the area and the x axis.
  function zoomed(event: D3ZoomEvent<SVGElement, undefined>) {
    const xZoomed = event.transform.rescaleX(xScale);
    path.attr("d", makeLine(xZoomed));
    scaleXAxis(xZoomed);
  }
}

function getDatePositionsAndDistances(ephemeris: Ephemeris): {
  datePositions: DatePosition[];
  dateDistances: DateDistance[];
} {
  const datePositions = seqStep(displayStartDate.getTime(), displayEndDate.getTime(), 1000 * 60 * 60 * 24).map(
    (unixTime) => {
      const date = new Date(unixTime);
      const position = getEarthAndMoonPositions(ephemeris, getAstronomicalTime(date));
      return { date, position };
    }
  );

  const dateDistances = datePositions.map((p) => ({ date: p.date, distance: getDistance(p.position) }));
  return { datePositions, dateDistances };
}
