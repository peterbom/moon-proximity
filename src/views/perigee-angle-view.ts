import {
  axisBottom,
  axisLeft,
  create,
  D3ZoomEvent,
  extent,
  scaleLinear,
  Selection as D3Selection,
  zoom,
  ZoomBehavior,
} from "d3";
import { OverlayElement } from "../common/html-utils";
import type { Perigee, State } from "../state-types";
import {
  createPerigeeOverlay,
  handlePerigeeMouseout,
  handlePerigeeMouseover,
  PerigeeElems,
  setPointsAppearance,
} from "./perigee-info-overlay";
import type { D3DatalessSelection, D3ScaleLinear } from "./d3-alias-types";

export function run(container: HTMLElement, state: State) {
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

function updatePerigees(state: State, viewComponents: ViewComponents, perigees: Perigee[]) {
  const viewDimensions = viewComponents.viewDimensions;

  viewComponents.xScale = viewComponents.xScale
    .domain(extent(perigees, (d) => d.angleFromFullMoonDegrees) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .nice();

  viewComponents.yScale = viewComponents.yScale.domain(extent(perigees, (d) => d.distance) as [number, number]).nice();

  viewComponents.points = viewComponents.points
    .data(perigees)
    .join("circle")
    .call(setPointsAppearance, viewComponents.selectedPerigee)
    .attr("cx", (p) => viewComponents.xScale(p.angleFromFullMoonDegrees))
    .attr("cy", (p) => viewComponents.yScale(p.distance))
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) =>
      handlePerigeeMouseover(
        viewComponents.tooltipOverlay,
        p,
        viewComponents.xScale(p.angleFromFullMoonDegrees),
        viewComponents.yScale(p.distance)
      )
    )
    .on("mouseout", () => handlePerigeeMouseout(viewComponents.tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  rescaleXAxis(viewComponents, viewComponents.xScale, viewDimensions.width);
  viewComponents.yAxis = viewComponents.yAxis.call(axisLeft(viewComponents.yScale));

  viewComponents.zoomBehavior = viewComponents.zoomBehavior.on("zoom", (event: D3ZoomEvent<SVGElement, undefined>) => {
    const xZoomed = event.transform.rescaleX(viewComponents.xScale);
    viewComponents.points = viewComponents.points.attr("cx", (d) => xZoomed(d.angleFromFullMoonDegrees));
    rescaleXAxis(viewComponents, xZoomed, viewDimensions.width);
  });

  // Initial zoom.
  viewComponents.svg.call(viewComponents.zoomBehavior).call(viewComponents.zoomBehavior.scaleTo, 8, [0, 0]);
}

function createViewComponents(container: HTMLElement, viewDimensions: ViewDimensions): ViewComponents {
  const { width, height, marginLeft, marginRight, marginTop, marginBottom } = viewDimensions;

  // Declare the x (angle) scale.
  const xScale = scaleLinear().range([marginLeft, width - marginRight]);

  // Declare the y (distance) scale.
  const yScale = scaleLinear().range([height - marginBottom, marginTop]);

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

function rescaleXAxis(viewComponents: ViewComponents, xScale: D3ScaleLinear, width: number) {
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
  xScale: D3ScaleLinear;
  yScale: D3ScaleLinear;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<PerigeeElems>;
  selectedPerigee: Perigee | null;
};
