import { axisBottom, axisLeft, create, extent, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, Selection as D3Selection, ZoomBehavior, ZoomTransform } from "d3";
import { OverlayElement } from "../common/html-utils";
import { Perigee, State } from "../state-types";
import {
  createPerigeeOverlay,
  handlePerigeeMouseout,
  handlePerigeeMouseover,
  PerigeeElems,
  setPointsAppearance,
} from "./perigee-info-overlay";
import { D3DatalessSelection, D3ScaleLinear, D3ScaleTime } from "./d3-alias-types";
import { getUnrefinedPeaks } from "../common/peak-detection";
import { getZoomFactors, ZoomExtents } from "./d3-helpers";

const zoomExtents: ZoomExtents = {
  min: 1000 * 60 * 60 * 24 * 365, // 1 year
  max: 1000 * 60 * 60 * 24 * 365 * 50, // 50 years
  initial: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
};

export async function run(container: HTMLElement, state: State) {
  const viewComponents = createViewComponents(container);
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
    startDate: new Date(),
    endDate: new Date(),
    perigees: [],
    selectedPerigee: null,
  };

  const { startDate, endDate } = state.timeRange.getValue();
  updateViewData(viewData, state.perigees.getValue(), state.selectedPerigee.getValue(), startDate, endDate);

  updateViewComponents(viewComponents, viewDimensions, viewData, state);

  state.selectedPerigee.subscribe((p) => {
    viewData.selectedPerigee = p;
    updateViewComponents(viewComponents, viewDimensions, viewData, state);
  });

  state.perigees.subscribe((perigees) => {
    const { startDate, endDate } = state.timeRange.getValue();
    updateViewData(viewData, perigees, state.selectedPerigee.getValue(), startDate, endDate);
    updateViewComponents(viewComponents, viewDimensions, viewData, state);
  });
}

function createViewComponents(container: HTMLElement): ViewComponents {
  const xScale = scaleUtc();
  const yScale = scaleLinear();
  const zoomTransform = null;
  const zoomBehavior = zoom<SVGSVGElement, undefined>();

  const svg = create("svg");

  // Create a clip-path with a unique ID.
  const clipId = "super-perigee-clip";
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect");

  const points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined> = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle");

  const xAxis = svg.append("g");
  const yAxis = svg.append("g");

  const tooltipOverlay = createPerigeeOverlay(container);

  return {
    svg,
    clipRect,
    xScale,
    yScale,
    zoomTransform,
    xAxis,
    yAxis,
    points,
    zoomBehavior,
    tooltipOverlay,
  };
}

function updateViewComponents(
  viewComponents: ViewComponents,
  viewDimensions: ViewDimensions,
  viewData: ViewData,
  state: State
) {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom } = viewDimensions;

  viewComponents.xScale = viewComponents.xScale
    .domain([viewData.startDate, viewData.endDate])
    .range([marginLeft, width - marginRight]);

  viewComponents.yScale = viewComponents.yScale
    .domain(extent(viewData.perigees, (p) => p.distance) as [number, number])
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
      updateViewComponents(viewComponents, viewDimensions, viewData, state);
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

  viewComponents.points = viewComponents.points
    .data(viewData.perigees)
    .join("circle")
    .call(setPointsAppearance, viewData.selectedPerigee)
    .attr("cx", (p) => xScale(p.date))
    .attr("cy", (p) => viewComponents.yScale(p.distance))
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) =>
      handlePerigeeMouseover(viewComponents.tooltipOverlay, p, xScale(p.date), viewComponents.yScale(p.distance))
    )
    .on("mouseout", () => handlePerigeeMouseout(viewComponents.tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  viewComponents.xAxis = viewComponents.xAxis
    .call(
      axisBottom(xScale)
        .ticks(width / 80)
        .tickSizeOuter(0)
    )
    .attr("transform", `translate(0,${height - marginBottom})`);

  viewComponents.yAxis = viewComponents.yAxis
    .call(axisLeft(viewComponents.yScale))
    .attr("transform", `translate(${marginLeft},0)`);
}

function updateViewData(
  viewData: ViewData,
  allPerigees: Perigee[],
  selectedPerigee: Perigee | null,
  startDate: Date,
  endDate: Date
) {
  viewData.startDate = startDate;
  viewData.endDate = endDate;

  viewData.perigees =
    allPerigees.length > 3
      ? getUnrefinedPeaks(
          allPerigees,
          (p) => p.date.getTime(),
          (p) => -p.distance
        ).map((p) => p.peak)
      : allPerigees;

  viewData.selectedPerigee =
    selectedPerigee !== null && viewData.perigees.includes(selectedPerigee) ? selectedPerigee : null;
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
  startDate: Date;
  endDate: Date;
  perigees: Perigee[];
  selectedPerigee: Perigee | null;
};

type ViewComponents = {
  svg: D3DatalessSelection<SVGSVGElement>;
  clipRect: D3DatalessSelection<SVGRectElement>;
  xScale: D3ScaleTime;
  yScale: D3ScaleLinear;
  zoomTransform: ZoomTransform | null;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<PerigeeElems>;
};
