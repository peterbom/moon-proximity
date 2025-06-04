import {
  axisBottom,
  axisLeft,
  create,
  curveNatural,
  extent,
  interpolateOranges,
  line,
  scaleLinear,
  scaleSequential,
  scaleUtc,
  zoom,
} from "d3";
import type { D3ZoomEvent, Selection as D3Selection, ZoomBehavior, ZoomTransform, ScaleSequential } from "d3";
import { asCssColor, OverlayElement } from "../common/html-utils";
import { moonlightColor, moonMeanRadius, sunMeanRadius } from "../constants";
import { DatePosition, NewMoon, State } from "../state-types";
import { D3DatalessSelection, D3ScaleLinear, D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getPeaks } from "../common/peak-detection";
import { getEarthMoonAndSunPositions } from "../calculations";
import { getAstronomicalTime } from "../time";
import { getZoomFactors, ZoomExtents } from "./d3-helpers";
import { dotProduct3, getMagnitude, normalize, subtractVectors } from "../common/vectors";
import { radToDeg } from "../common/math";
import {
  createNewMoonOverlay,
  handleNewMoonMouseout,
  handleNewMoonMouseover,
  NewMoonElems,
} from "./new-moon-info-overlay";

const lineColor = asCssColor([...moonlightColor, 1]);
const zoomExtents: ZoomExtents = {
  min: 1000 * 60 * 60 * 24 * 30, // 1 month
  max: 1000 * 60 * 60 * 24 * 365 * 5, // 5 years
  initial: 1000 * 60 * 60 * 24 * 365 * 2, // 2 years
};

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const datePositions = await state.datePositions.getValue();

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
    newMoons: [],
  };

  const { startDate, endDate } = state.timeRange.getValue();
  updateViewData(viewData, ephemeris, datePositions, startDate, endDate);

  updateViewComponents(viewComponents, viewDimensions, viewData);

  const resizeObserver = new ResizeObserver(() => {
    viewDimensions.width = container.clientWidth;
    viewDimensions.height = container.clientHeight;
    updateViewComponents(viewComponents, viewDimensions, viewData);
  });

  resizeObserver.observe(container);

  state.timeRange.subscribe(({ startDate, endDate }) => {
    updateViewData(viewData, ephemeris, datePositions, startDate, endDate);
    updateViewComponents(viewComponents, viewDimensions, viewData);
  });
}

function createViewComponents(container: HTMLElement): ViewComponents {
  const colorScale = scaleSequential(interpolateOranges);
  const xScale = scaleUtc();
  const yScale = scaleLinear();
  const zoomTransform = null;
  const zoomBehavior = zoom<SVGSVGElement, undefined>();

  const svg = create("svg");

  // Create a clip-path with a unique ID.
  const clipId = "new-moon-clip";
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect");

  // Append a path for the line.
  const path = svg
    .append("path")
    .attr("clip-path", `url(#${clipId})`)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 0.5)
    .style("stroke-dasharray", "5,5");

  const points: D3Selection<SVGCircleElement, NewMoon, SVGGElement, undefined> = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle");

  const xAxis = svg.append("g");
  const yAxis = svg.append("g");

  const tooltipOverlay = createNewMoonOverlay(container);

  return {
    svg,
    clipRect,
    colorScale,
    xScale,
    yScale,
    zoomTransform,
    xAxis,
    yAxis,
    path,
    points,
    zoomBehavior,
    tooltipOverlay,
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
    .domain(extent(viewData.newMoons, (p) => radToDeg(p.angleBetweenMoonAndSun)) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
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

  viewComponents.colorScale = viewComponents.colorScale.domain(
    extent(viewData.newMoons, (p) => p.moonVisibleAngle / p.sunVisibleAngle).reverse() as [number, number]
  );

  viewComponents.clipRect = viewComponents.clipRect
    .attr("x", marginLeft)
    .attr("y", marginTop)
    .attr("width", width - marginLeft - marginRight)
    .attr("height", height - marginTop - marginBottom);

  viewComponents.path = viewComponents.path.attr(
    "d",
    line<NewMoon>()
      .x((p) => xScale(p.date))
      .y((p) => viewComponents.yScale(radToDeg(p.angleBetweenMoonAndSun)))
      .curve(curveNatural)(viewData.newMoons)
  );

  viewComponents.points = viewComponents.points
    .data(viewData.newMoons)
    .join("circle")
    .attr("cx", (m) => xScale(m.date))
    .attr("cy", (m) => viewComponents.yScale(radToDeg(m.angleBetweenMoonAndSun)))
    .attr("fill", (m) => viewComponents.colorScale(m.moonVisibleAngle / m.sunVisibleAngle))
    .attr("r", 6)
    .style("cursor", "pointer")
    .on("mouseover", (_e, m) =>
      handleNewMoonMouseover(
        viewComponents.tooltipOverlay,
        m,
        xScale(m.date),
        viewComponents.yScale(radToDeg(m.angleBetweenMoonAndSun))
      )
    )
    .on("mouseout", () => handleNewMoonMouseout(viewComponents.tooltipOverlay));
  //.on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

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

const peakRangeThresholdSeconds = 1000 * 30;

function updateViewData(
  viewData: ViewData,
  ephemeris: Ephemeris,
  allDatePositions: DatePosition[],
  startDate: Date,
  endDate: Date
) {
  viewData.startDate = startDate;
  viewData.endDate = endDate;
  const datePositions = allDatePositions.filter((dd) => dd.date >= startDate && dd.date < endDate);

  const newMoonPeaks = getPeaks(
    datePositions.map(datePositionToNewMoon),
    (m) => m.date.getTime(),
    (m) => -m.angleBetweenMoonAndSun,
    unixTimeToNewMoon,
    peakRangeThresholdSeconds
  );

  viewData.newMoons = newMoonPeaks.map((p) => p.peak);

  function unixTimeToNewMoon(unixTime: number): NewMoon {
    const date = new Date(unixTime);
    const position = getEarthMoonAndSunPositions(ephemeris, getAstronomicalTime(date));
    const datePosition = { date, position };
    return datePositionToNewMoon(datePosition);
  }

  function datePositionToNewMoon(datePosition: DatePosition): NewMoon {
    const earthToMoon = subtractVectors(datePosition.position.moonPosition, datePosition.position.earthPosition);
    const earthToSun = subtractVectors(datePosition.position.sunPosition, datePosition.position.earthPosition);
    const angleBetweenMoonAndSun = Math.acos(dotProduct3(normalize(earthToMoon), normalize(earthToSun)));
    const moonDistance = getMagnitude(earthToMoon);
    const sunDistance = getMagnitude(earthToSun);
    const moonVisibleAngle = Math.atan(moonMeanRadius / moonDistance) * 2;
    const sunVisibleAngle = Math.atan(sunMeanRadius / sunDistance) * 2;
    return {
      date: datePosition.date,
      positions: datePosition.position,
      moonDistance,
      sunDistance,
      angleBetweenMoonAndSun,
      moonVisibleAngle,
      sunVisibleAngle,
    };
  }
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
  newMoons: NewMoon[];
  startDate: Date;
  endDate: Date;
};

type ViewComponents = {
  svg: D3DatalessSelection<SVGSVGElement>;
  clipRect: D3DatalessSelection<SVGRectElement>;
  colorScale: ScaleSequential<string, never>;
  xScale: D3ScaleTime;
  yScale: D3ScaleLinear;
  zoomTransform: ZoomTransform | null;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  path: D3DatalessSelection<SVGPathElement>;
  points: D3Selection<SVGCircleElement, NewMoon, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<NewMoonElems>;
};
