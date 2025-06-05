import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, Selection as D3Selection, ZoomBehavior, ZoomTransform } from "d3";
import { asCssColor, OverlayElement } from "../common/html-utils";
import { moonlightColor } from "../constants";
import { Perigee, State } from "../state-types";
import {
  createPerigeeOverlay,
  handlePerigeeMouseout,
  handlePerigeeMouseover,
  PerigeeElems,
  setPointsAppearance,
} from "./perigee-info-overlay";
import { D3DatalessSelection, D3ScaleLinear, D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getPeaks } from "../common/peak-detection";
import {
  DatePosition,
  DatePositionAngles,
  getDatePosition,
  getDatePositionAngles,
  getLunarEclipseMaginutude,
} from "../calculations";
import { getAstronomicalTime } from "../time";
import { maxByProperty } from "../common/iteration";
import { getZoomFactors, ZoomExtents } from "./d3-helpers";

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
    perigees: [],
    selectedPerigee: null,
    fullMoonDates: [],
  };

  const { startDate, endDate } = state.timeRange.getValue();
  updateViewData(viewData, ephemeris, datePositions, state.selectedPerigee.getValue(), startDate, endDate);
  state.perigees.setValue(viewData.perigees);

  updateViewComponents(viewComponents, viewDimensions, viewData, state);

  const resizeObserver = new ResizeObserver(() => {
    viewDimensions.width = container.clientWidth;
    viewDimensions.height = container.clientHeight;
    updateViewComponents(viewComponents, viewDimensions, viewData, state);
  });

  resizeObserver.observe(container);
  state.selectedPerigee.subscribe((p) => {
    viewData.selectedPerigee = p;
    updateViewComponents(viewComponents, viewDimensions, viewData, state);
  });

  state.timeRange.subscribe(({ startDate, endDate }) => {
    updateViewData(viewData, ephemeris, datePositions, state.selectedPerigee.getValue(), startDate, endDate);
    state.perigees.setValue(viewData.perigees);
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
  const clipId = "perigee-time-clip";
  const clipRect = svg.append("clipPath").attr("id", clipId).append("rect");

  // Append a path for the line.
  const path = svg
    .append("path")
    .attr("clip-path", `url(#${clipId})`)
    .attr("fill", "none")
    .attr("stroke", lineColor)
    .attr("stroke-width", 0.5)
    .style("stroke-dasharray", "5,5");

  const points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined> = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle");

  const fullMoonLines: D3Selection<SVGLineElement, Date, SVGGElement, undefined> = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("line");

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
    path,
    points,
    fullMoonLines,
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
  if (width - marginLeft - marginRight < 0 || height - marginTop - marginBottom < 0) {
    viewComponents.zoomTransform = null; // reset to force zoom when visible
    return;
  }

  viewComponents.xScale = viewComponents.xScale
    .domain([viewData.startDate, viewData.endDate])
    .range([marginLeft, width - marginRight]);

  viewComponents.yScale = viewComponents.yScale
    .domain(extent(viewData.perigees, (p) => p.moonDistance) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
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

  viewComponents.path = viewComponents.path.attr(
    "d",
    line<Perigee>()
      .x((p) => xScale(p.date))
      .y((p) => viewComponents.yScale(p.moonDistance))
      .curve(curveNatural)(viewData.perigees)
  );

  viewComponents.points = viewComponents.points
    .data(viewData.perigees)
    .join("circle")
    .call(setPointsAppearance, viewData.selectedPerigee)
    .attr("cx", (p) => xScale(p.date))
    .attr("cy", (p) => viewComponents.yScale(p.moonDistance))
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) =>
      handlePerigeeMouseover(viewComponents.tooltipOverlay, p, xScale(p.date), viewComponents.yScale(p.moonDistance))
    )
    .on("mouseout", () => handlePerigeeMouseout(viewComponents.tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  viewComponents.fullMoonLines = viewComponents.fullMoonLines
    .data(viewData.fullMoonDates)
    .join("line")
    .attr("x1", xScale)
    .attr("y1", 0)
    .attr("x2", xScale)
    .attr("y2", viewDimensions.height - viewDimensions.marginBottom)
    .style("stroke-width", 1)
    .style("stroke", lineColor)
    .style("fill", "none");

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
  selectedPerigee: Perigee | null,
  startDate: Date,
  endDate: Date
) {
  viewData.startDate = startDate;
  viewData.endDate = endDate;

  const datePositionAngles = allDatePositions
    .filter((dp) => dp.date >= startDate && dp.date < endDate)
    .map(getDatePositionAngles);

  viewData.fullMoonDates = getPeaks(
    datePositionAngles,
    (dpa) => dpa.date.getTime(),
    (dpa) => dpa.angleBetweenMoonAndSun,
    unixTimeToDatePositionAngles,
    peakRangeThresholdSeconds
  ).map((p) => p.peak.date);

  const newMoonDates = getPeaks(
    datePositionAngles,
    (dpa) => dpa.date.getTime(),
    (dpa) => -dpa.angleBetweenMoonAndSun,
    unixTimeToDatePositionAngles,
    peakRangeThresholdSeconds
  ).map((p) => p.peak.date);

  // Get the max/min moon distance by year for supermoon calculations.
  const yearMaxMinDistance = new Map<number, { max: number; min: number }>();
  Map.groupBy(datePositionAngles, (dp) => dp.date.getFullYear()).forEach((dps, year) => {
    yearMaxMinDistance.set(year, {
      max: maxByProperty(dps, (dd) => dd.moonDistance).value,
      min: -maxByProperty(dps, (dd) => -dd.moonDistance).value,
    });
  });

  viewData.perigees = getPeaks(
    datePositionAngles,
    (dpa) => dpa.date.getTime(),
    (dpa) => -dpa.moonDistance,
    unixTimeToPerigee,
    peakRangeThresholdSeconds
  ).map((p) => datePositionAnglesToPerigee(p.peak));

  viewData.selectedPerigee =
    selectedPerigee !== null && viewData.perigees.includes(selectedPerigee) ? selectedPerigee : null;

  function unixTimeToPerigee(unixTime: number): Perigee {
    const datePositionAngles = unixTimeToDatePositionAngles(unixTime);
    return datePositionAnglesToPerigee(datePositionAngles);
  }

  function unixTimeToDatePositionAngles(unixTime: number): DatePositionAngles {
    const date = new Date(unixTime);
    const datePosition = getDatePosition(ephemeris, getAstronomicalTime(date));
    return getDatePositionAngles(datePosition);
  }

  function datePositionAnglesToPerigee(datePositionAngles: DatePositionAngles): Perigee {
    const unixTime = datePositionAngles.date.getTime();
    const hoursFromFullMoon =
      -maxByProperty(viewData.fullMoonDates, (fullMoonDate) => -Math.abs(fullMoonDate.getTime() - unixTime)).value /
      (1000 * 60 * 60);
    const hoursFromNewMoon =
      -maxByProperty(newMoonDates, (newMoonDate) => -Math.abs(newMoonDate.getTime() - unixTime)).value /
      (1000 * 60 * 60);

    const maxMinDistance = yearMaxMinDistance.get(datePositionAngles.date.getFullYear())!;
    const superMoonThreshold = (maxMinDistance.max - maxMinDistance.min) * 0.1 + maxMinDistance.min;
    const isSuperMoon = hoursFromFullMoon < 24 && datePositionAngles.moonDistance < superMoonThreshold;
    const isSuperNewMoon = hoursFromNewMoon < 24 && datePositionAngles.moonDistance < superMoonThreshold;

    const lunarEclipseMagnitude = getLunarEclipseMaginutude(datePositionAngles);

    return {
      ...datePositionAngles,
      hoursFromFullMoon,
      hoursFromNewMoon,
      isSuperMoon,
      isSuperNewMoon,
      lunarEclipseMagnitude,
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
  perigees: Perigee[];
  selectedPerigee: Perigee | null;
  fullMoonDates: Date[];
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
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>;
  fullMoonLines: D3Selection<SVGLineElement, Date, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<PerigeeElems>;
};
