/*
Line chart based on:
- https://observablehq.com/@d3/line-chart/2 (simple)
- https://observablehq.com/@d3/zoomable-area-chart (zooming)
*/

import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, ZoomBehavior } from "d3";
import { getDistance, getEarthAndMoonPositions } from "../calculations";
import { asCssColor } from "../common/html-utils";
import { seqStep } from "../common/iteration";
import { dataEndDate, dataStartDate, highlightColor } from "../constants";
import type { DateDistance, DatePosition, State } from "../state-types";
import type { D3DatalessSelection, D3ScaleLinear, D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getAstronomicalTime } from "../time";

const lineColor = asCssColor([...highlightColor, 1]);

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const { datePositions, dateDistances } = getDatePositionsAndDistances(ephemeris);

  state.datePositions.setValue(datePositions);
  state.dateDistances.setValue(dateDistances);

  const { startDate, endDate } = state.timeRange.getValue();

  // Declare the chart dimensions and margins.
  const viewDimensions: ViewDimensions = {
    width: container.clientWidth,
    height: container.clientHeight,
    marginTop: 10,
    marginRight: 16,
    marginBottom: 30,
    marginLeft: 50,
  };

  const viewComponents = createViewComponents(viewDimensions);
  container.append(viewComponents.svg.node()!);

  state.timeRange.subscribe(({ startDate, endDate }) => updateDates(viewComponents, startDate, endDate, dateDistances));

  updateDates(viewComponents, startDate, endDate, dateDistances);
}

function updateDates(viewComponents: ViewComponents, startDate: Date, endDate: Date, allDateDistances: DateDistance[]) {
  const dateDistances = allDateDistances.filter((dd) => dd.date >= startDate && dd.date < endDate);
  const viewDimensions = viewComponents.viewDimensions;

  viewComponents.xScale = viewComponents.xScale.domain([startDate, endDate]);
  viewComponents.yScale = viewComponents.yScale
    .domain(extent(dateDistances, (d) => d.distance) as [number, number])
    .nice(); // cast needed: https://stackoverflow.com/a/75465468

  viewComponents.path = viewComponents.path.attr(
    "d",
    makeLine(viewComponents.xScale, viewComponents.yScale, dateDistances)
  );

  rescaleXAxis(viewComponents, viewComponents.xScale, viewDimensions.width);
  viewComponents.yAxis = viewComponents.yAxis.call(axisLeft(viewComponents.yScale));

  const intervalYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const initialScaleFactor = Math.max(intervalYears / 2, 1);
  const maxScaleFactor = Math.max(intervalYears * 2, 1);

  viewComponents.zoomBehavior = viewComponents.zoomBehavior
    .scaleExtent([1, maxScaleFactor])
    .on("zoom", (event: D3ZoomEvent<SVGElement, undefined>) => {
      // When zooming, redraw the area and the x axis.
      const xZoomed = event.transform.rescaleX(viewComponents.xScale);
      viewComponents.path = viewComponents.path.attr("d", makeLine(xZoomed, viewComponents.yScale, dateDistances));
      rescaleXAxis(viewComponents, xZoomed, viewDimensions.width);
    });

  viewComponents.svg
    .call(viewComponents.zoomBehavior)
    .call(viewComponents.zoomBehavior.scaleTo, initialScaleFactor, [viewComponents.xScale(startDate), 0]);
}

function createViewComponents(viewDimensions: ViewDimensions): ViewComponents {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom } = viewDimensions;

  // Declare the x (time) scale.
  const xScale = scaleUtc().range([marginLeft, width - marginRight]);

  // Declare the y (distance) scale.
  const yScale = scaleLinear().range([height - marginBottom, marginTop]);

  // Create the zoom behavior.
  const zoomBehavior = zoom<SVGSVGElement, undefined>()
    .extent([
      [marginLeft, marginTop],
      [width - marginRight, height - marginBottom],
    ])
    .translateExtent([
      [marginLeft, -Infinity],
      [width - marginRight, Infinity],
    ]);

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
    .attr("stroke-width", 1);

  // Add the axes.
  const xAxis = svg.append("g").attr("transform", `translate(0,${height - marginBottom})`);
  const yAxis = svg.append("g").attr("transform", `translate(${marginLeft},0)`);

  return {
    viewDimensions,
    svg,
    xScale,
    yScale,
    xAxis,
    yAxis,
    path,
    zoomBehavior,
  };
}

function rescaleXAxis(viewComponents: ViewComponents, xScale: D3ScaleTime, width: number) {
  viewComponents.xAxis = viewComponents.xAxis.call(
    axisBottom(xScale)
      .ticks(width / 80)
      .tickSizeOuter(0)
  );
}

function makeLine(xScale: D3ScaleTime, yScale: D3ScaleLinear, dateDistances: DateDistance[]) {
  return line<DateDistance>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.distance))
    .curve(curveNatural)(dateDistances);
}

function getDatePositionsAndDistances(ephemeris: Ephemeris): {
  datePositions: DatePosition[];
  dateDistances: DateDistance[];
} {
  const datePositions = seqStep(dataStartDate.getTime(), dataEndDate.getTime(), 1000 * 60 * 60 * 24).map((unixTime) => {
    const date = new Date(unixTime);
    const position = getEarthAndMoonPositions(ephemeris, getAstronomicalTime(date));
    return { date, position };
  });

  const dateDistances = datePositions.map((p) => ({ date: p.date, distance: getDistance(p.position) }));
  return { datePositions, dateDistances };
}

type ViewDimensions = {
  width: number;
  height: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
};

type ViewComponents = {
  viewDimensions: ViewDimensions;
  svg: D3DatalessSelection<SVGSVGElement>;
  xScale: D3ScaleTime;
  yScale: D3ScaleLinear;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  path: D3DatalessSelection<SVGPathElement>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
};
