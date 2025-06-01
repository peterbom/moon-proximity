import { axisBottom, axisLeft, create, extent, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, Selection as D3Selection, ZoomBehavior } from "d3";
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

export async function run(container: HTMLElement, state: State) {
  const viewDimensions: ViewDimensions = {
    width: container.clientWidth,
    height: container.clientHeight,
    marginTop: 10,
    marginRight: 16,
    marginBottom: 30,
    marginLeft: 50,
  };

  const viewComponents = createViewComponents(container, viewDimensions);
  container.append(viewComponents.svg.node()!);

  state.selectedPerigee.subscribe((p) => updateSelectedPerigee(p, viewComponents));
  state.perigees.subscribe((perigees) => updatePerigees(state, viewComponents, perigees));

  updatePerigees(state, viewComponents, state.perigees.getValue());
  updateSelectedPerigee(state.selectedPerigee.getValue(), viewComponents);
}

function updateSelectedPerigee(perigee: Perigee | null, viewComponents: ViewComponents) {
  viewComponents.selectedPerigee = perigee;
  viewComponents.points = viewComponents.points.call(setPointsAppearance, perigee);
}

function updatePerigees(state: State, viewComponents: ViewComponents, allPerigees: Perigee[]) {
  const { startDate, endDate } = state.timeRange.getValue();

  const perigees =
    allPerigees.length > 3
      ? getUnrefinedPeaks(
          allPerigees,
          (p) => p.date.getTime(),
          (p) => -p.distance
        ).map((p) => p.peak)
      : allPerigees;

  const viewDimensions = viewComponents.viewDimensions;

  viewComponents.xScale = viewComponents.xScale.domain([startDate, endDate]).nice();
  viewComponents.yScale = viewComponents.yScale.domain(extent(perigees, (d) => d.distance) as [number, number]).nice();

  viewComponents.points = viewComponents.points
    .data(perigees)
    .join("circle")
    .call(setPointsAppearance, viewComponents.selectedPerigee)
    .attr("cx", (p) => viewComponents.xScale(p.date))
    .attr("cy", (p) => viewComponents.yScale(p.distance))
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) =>
      handlePerigeeMouseover(
        viewComponents.tooltipOverlay,
        p,
        viewComponents.xScale(p.date),
        viewComponents.yScale(p.distance)
      )
    )
    .on("mouseout", () => handlePerigeeMouseout(viewComponents.tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  rescaleXAxis(viewComponents, viewComponents.xScale, viewDimensions.width);
  viewComponents.yAxis = viewComponents.yAxis.call(axisLeft(viewComponents.yScale));

  const intervalYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const initialScaleFactor = Math.max(intervalYears / 16, 1);
  const maxScaleFactor = Math.max(intervalYears * 2, 1);

  viewComponents.zoomBehavior
    .scaleExtent([1, maxScaleFactor])
    .on("zoom", (event: D3ZoomEvent<SVGElement, undefined>) => {
      // When zooming, redraw the area and the x axis.
      const xZoomed = event.transform.rescaleX(viewComponents.xScale);
      viewComponents.points = viewComponents.points.attr("cx", (d) => xZoomed(d.date));
      rescaleXAxis(viewComponents, xZoomed, viewDimensions.width);
    });

  // Initial zoom.
  viewComponents.svg
    .call(viewComponents.zoomBehavior)
    .call(viewComponents.zoomBehavior.scaleTo, initialScaleFactor, [viewComponents.xScale(startDate), 0]);
}

function createViewComponents(container: HTMLElement, viewDimensions: ViewDimensions): ViewComponents {
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

  const points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined> = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle");

  const xAxis = svg.append("g").attr("transform", `translate(0,${height - marginBottom})`);
  const yAxis = svg.append("g").attr("transform", `translate(${marginLeft},0)`);

  const tooltipOverlay = createPerigeeOverlay(container);
  const selectedPerigee = null;

  return {
    viewDimensions,
    svg,
    xScale,
    yScale,
    xAxis,
    yAxis,
    points,
    zoomBehavior,
    tooltipOverlay,
    selectedPerigee,
  };
}

function rescaleXAxis(viewComponents: ViewComponents, xScale: D3ScaleTime, width: number) {
  viewComponents.xAxis = viewComponents.xAxis.call(
    axisBottom(xScale)
      .ticks(width / 80)
      .tickSizeOuter(0)
  );
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
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<PerigeeElems>;
  selectedPerigee: Perigee | null;
};
