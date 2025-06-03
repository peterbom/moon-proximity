/*
Line chart based on:
- https://observablehq.com/@d3/line-chart/2 (simple)
- https://observablehq.com/@d3/zoomable-area-chart (zooming)
*/

import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, ZoomBehavior, ZoomTransform } from "d3";
import { getDistance, getEarthAndMoonPositions } from "../calculations";
import { asCssColor } from "../common/html-utils";
import { seqStep } from "../common/iteration";
import { dataEndDate, dataStartDate, highlightColor } from "../constants";
import type { DateDistance, DatePosition, State } from "../state-types";
import type { D3DatalessSelection, D3ScaleLinear, D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getAstronomicalTime } from "../time";
import { getZoomFactors, ZoomExtents } from "./d3-helpers";

const lineColor = asCssColor([...highlightColor, 1]);
const zoomExtents: ZoomExtents = {
  min: 1000 * 60 * 60 * 24 * 30, // 1 month
  max: 1000 * 60 * 60 * 24 * 365 * 20, // 20 years
  initial: 1000 * 60 * 60 * 24 * 365 * 5, // 5 years
};

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const { datePositions, dateDistances } = getDatePositionsAndDistances(ephemeris);

  state.datePositions.setValue(datePositions);
  state.dateDistances.setValue(dateDistances);

  const { startDate, endDate } = state.timeRange.getValue();

  const viewComponents = createViewComponents();
  container.append(viewComponents.svg.node()!);

  const viewDimensions: ViewDimensions = {
    width: container.clientWidth,
    height: container.clientHeight,
    marginTop: 10,
    marginRight: 16,
    marginBottom: 30,
    marginLeft: 50,
  };

  const viewData: ViewData = {
    dateDistances: dateDistances.filter((dd) => dd.date >= startDate && dd.date < endDate),
    startDate,
    endDate,
  };

  updateViewComponents(viewComponents, viewDimensions, viewData);

  const resizeObserver = new ResizeObserver(() => {
    viewDimensions.width = container.clientWidth;
    viewDimensions.height = container.clientHeight;
    updateViewComponents(viewComponents, viewDimensions, viewData);
  });

  resizeObserver.observe(container);
  state.timeRange.subscribe(({ startDate, endDate }) => {
    viewData.dateDistances = dateDistances.filter((dd) => dd.date >= startDate && dd.date < endDate);
    viewData.startDate = startDate;
    viewData.endDate = endDate;
    updateViewComponents(viewComponents, viewDimensions, viewData);
  });
}

function createViewComponents(): ViewComponents {
  const xScale = scaleUtc();
  const yScale = scaleLinear();
  const zoomTransform = null;
  const zoomBehavior = zoom<SVGSVGElement, undefined>();

  const svg = create("svg");

  // Create a clip-path with a unique ID.
  const clipId = "distance-time-clip";
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect");

  // Append a path for the line.
  const path = svg
    .append("path")
    .attr("clip-path", `url(#${clipId})`)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 1);

  // Add the axes.
  const xAxis = svg.append("g");
  const yAxis = svg.append("g");

  return {
    svg,
    clipRect,
    xScale,
    yScale,
    zoomTransform,
    xAxis,
    yAxis,
    path,
    zoomBehavior,
  };
}

function updateViewComponents(viewComponents: ViewComponents, viewDimensions: ViewDimensions, viewData: ViewData) {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom } = viewDimensions;
  if (width - marginLeft - marginRight < 0 || height - marginTop - marginBottom < 0) {
    viewComponents.zoomTransform = null; // reset to force zoom when visible
    return;
  }

  viewComponents.xScale = viewComponents.xScale
    .domain([viewData.startDate, viewData.endDate])
    .range([marginLeft, width - marginRight]);

  viewComponents.yScale = viewComponents.yScale
    .domain(extent(viewData.dateDistances, (d) => d.distance) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .range([height - marginBottom, marginTop])
    .nice();

  const zoomFactors = getZoomFactors(viewData.startDate.getTime(), viewData.endDate.getTime(), zoomExtents);

  viewComponents.zoomBehavior = viewComponents.zoomBehavior
    .scaleExtent([zoomFactors.min, zoomFactors.max])
    .extent([
      [marginLeft, marginTop],
      [width - marginRight, height - marginBottom],
    ])
    .translateExtent([
      [marginLeft, -Infinity],
      [width - marginRight, Infinity],
    ])
    .on("zoom", (event: D3ZoomEvent<SVGElement, undefined>) => {
      viewComponents.zoomTransform = event.transform;
      updateViewComponents(viewComponents, viewDimensions, viewData);
    });

  viewComponents.svg = viewComponents.svg
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .call(viewComponents.zoomBehavior);

  // Set initial zoom if not already set.
  if (viewComponents.zoomTransform === null) {
    const xy: [number, number] = [viewComponents.xScale(viewData.startDate), 0];
    viewComponents.svg = viewComponents.svg.call(viewComponents.zoomBehavior.scaleTo, zoomFactors.initial, xy);
    return;
  }

  const xScale = viewComponents.zoomTransform.rescaleX(viewComponents.xScale);

  viewComponents.clipRect = viewComponents.clipRect
    .attr("x", marginLeft)
    .attr("y", marginTop)
    .attr("width", width - marginLeft - marginRight)
    .attr("height", height - marginTop - marginBottom);

  viewComponents.path = viewComponents.path.attr(
    "d",
    line<DateDistance>()
      .x((d) => xScale(d.date))
      .y((d) => viewComponents.yScale(d.distance))
      .curve(curveNatural)(viewData.dateDistances)
  );

  viewComponents.xAxis = viewComponents.xAxis
    .call(
      axisBottom(xScale)
        .ticks(viewDimensions.width / 80)
        .tickSizeOuter(0)
    )
    .attr("transform", `translate(0,${viewDimensions.height - viewDimensions.marginBottom})`);

  viewComponents.yAxis = viewComponents.yAxis
    .call(axisLeft(viewComponents.yScale))
    .attr("transform", `translate(${viewDimensions.marginLeft},0)`);
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

type ViewData = {
  dateDistances: DateDistance[];
  startDate: Date;
  endDate: Date;
};

type ViewComponents = {
  svg: D3DatalessSelection<SVGSVGElement>;
  clipRect: D3DatalessSelection<SVGRectElement>;
  xScale: D3ScaleTime;
  yScale: D3ScaleLinear;
  zoomTransform: ZoomTransform | null;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  path: D3DatalessSelection<SVGPathElement>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
};
