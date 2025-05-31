import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent, Selection as D3Selection, ZoomBehavior } from "d3";
import { asCssColor, OverlayElement } from "../common/html-utils";
import { radToDeg } from "../common/math";
import { moonlightColor } from "../constants";
import { DateDistance, DatePosition, Perigee, State } from "../state-types";
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
import { getAngleFromFullMoon, getCosAngleFromFullMoon, getDistance, getEarthAndMoonPositions } from "../calculations";
import { getAstronomicalTime } from "../time";
import { maxByProperty } from "../common/iteration";

const lineColor = asCssColor([...moonlightColor, 1]);
const fullMoonCosAngle = 1;
const newMoonCosAngle = -1;

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const datePositions = await state.datePositions.getValue();
  const dateDistances = await state.dateDistances.getValue();

  const { startDate, endDate } = state.timeRange.getValue();

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

  const selectedPerigee = state.selectedPerigee.getValue();
  state.selectedPerigee.subscribe((p) => updateSelectedPerigee(p, viewComponents));

  state.timeRange.subscribe(({ startDate, endDate }) =>
    updateDates(state, ephemeris, viewComponents, startDate, endDate, datePositions, dateDistances)
  );

  updateDates(state, ephemeris, viewComponents, startDate, endDate, datePositions, dateDistances);
  updateSelectedPerigee(selectedPerigee, viewComponents);
}

function updateSelectedPerigee(perigee: Perigee | null, viewComponents: ViewComponents) {
  viewComponents.selectedPerigee = perigee;
  viewComponents.points = viewComponents.points.call(setPointsAppearance, perigee);
}

function updateDates(
  state: State,
  ephemeris: Ephemeris,
  viewComponents: ViewComponents,
  startDate: Date,
  endDate: Date,
  allDatePositions: DatePosition[],
  allDateDistances: DateDistance[]
) {
  const datePositions = allDatePositions.filter((dd) => dd.date >= startDate && dd.date < endDate);
  const dateDistances = allDateDistances.filter((dd) => dd.date >= startDate && dd.date < endDate);

  const { perigees, fullMoonDates } = getPerigeesAndFullMoonDates(ephemeris, datePositions, dateDistances);
  state.perigees.setValue(perigees);

  const viewDimensions = viewComponents.viewDimensions;

  viewComponents.xScale = viewComponents.xScale.domain([startDate, endDate]);

  viewComponents.yScale = viewComponents.yScale
    .domain(extent(perigees, (d) => d.distance) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .nice();

  // Append a path for the line.
  viewComponents.path = viewComponents.path.attr("d", makeLine(viewComponents.xScale, viewComponents.yScale, perigees));

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

  viewComponents.fullMoonLines = viewComponents.fullMoonLines
    .data(fullMoonDates)
    .join("line")
    .attr("x1", viewComponents.xScale)
    .attr("y1", 0)
    .attr("x2", viewComponents.xScale)
    .attr("y2", viewDimensions.height - viewDimensions.marginTop - viewDimensions.marginBottom)
    .style("stroke-width", 1)
    .style("stroke", lineColor)
    .style("fill", "none");

  rescaleXAxis(viewComponents, viewComponents.xScale, viewDimensions.width);
  viewComponents.yAxis = viewComponents.yAxis.call(axisLeft(viewComponents.yScale));

  const intervalYears = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
  const initialScaleFactor = Math.max(intervalYears / 2, 1);
  const maxScaleFactor = Math.max(intervalYears * 2, 1);

  viewComponents.zoomBehavior
    .scaleExtent([1, maxScaleFactor])
    .on("zoom", (event: D3ZoomEvent<SVGElement, undefined>) => {
      // When zooming, redraw the area and the x axis.
      const xZoomed = event.transform.rescaleX(viewComponents.xScale);
      viewComponents.path = viewComponents.path.attr("d", makeLine(xZoomed, viewComponents.yScale, perigees));
      viewComponents.points = viewComponents.points.attr("cx", (d) => xZoomed(d.date));
      viewComponents.fullMoonLines = viewComponents.fullMoonLines.attr("x1", xZoomed).attr("x2", xZoomed);
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
    path,
    points,
    fullMoonLines,
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

function makeLine(xScale: D3ScaleTime, yScale: D3ScaleLinear, perigees: Perigee[]) {
  // Given a time scaling function, constructs a 'd' attribute value (string representation of the line).
  return line<Perigee>()
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.distance))
    .curve(curveNatural)(perigees);
}

function getPerigeesAndFullMoonDates(
  ephemeris: Ephemeris,
  datePositions: DatePosition[],
  dateDistances: DateDistance[]
): { perigees: Perigee[]; fullMoonDates: Date[] } {
  const unixTimes = datePositions.map((p) => p.date.getTime());

  const fullMoonDates = getClosestAngleUnixTimes(ephemeris, fullMoonCosAngle, unixTimes).map((time) => new Date(time));
  const newMoonDates = getClosestAngleUnixTimes(ephemeris, newMoonCosAngle, unixTimes).map((time) => new Date(time));

  const perigees = getPerigees(ephemeris, dateDistances, fullMoonDates, newMoonDates);

  return { perigees, fullMoonDates };
}

// Aim to calculate troughs within 30 seconds of the minimum distance.
const peakRangeThresholdSeconds = 1000 * 30;

function getPerigees(
  ephemeris: Ephemeris,
  dateDistances: DateDistance[],
  fullMoonDates: Date[],
  newMoonDates: Date[]
): Perigee[] {
  const perigeePeaks = getPeaks(
    dateDistances,
    (dd) => dd.date.getTime(),
    (dd) => -dd.distance,
    (unixTime) => {
      const date = new Date(unixTime);
      const positions = getEarthAndMoonPositions(ephemeris, getAstronomicalTime(date));
      const distance = getDistance(positions);
      return { date, distance };
    },
    peakRangeThresholdSeconds
  );

  const yearMaxMinDistance = new Map<number, { max: number; min: number }>();
  Map.groupBy(dateDistances, (dd) => dd.date.getFullYear()).forEach((dds, year) => {
    yearMaxMinDistance.set(year, {
      max: maxByProperty(dds, (dd) => dd.distance).value,
      min: -maxByProperty(dds, (dd) => -dd.distance).value,
    });
  });

  return perigeePeaks.map<Perigee>((p) => {
    const positions = getEarthAndMoonPositions(ephemeris, getAstronomicalTime(p.peak.date));
    const angleFromFullMoon = getAngleFromFullMoon(positions);

    const maxMinDistance = yearMaxMinDistance.get(p.peak.date.getFullYear())!;
    const superMoonThreshold = (maxMinDistance.max - maxMinDistance.min) * 0.1 + maxMinDistance.min;

    const date = p.peak.date;
    const unixTime = date.getTime();
    const hoursFromFullMoon =
      -maxByProperty(fullMoonDates, (fullMoonDate) => -Math.abs(fullMoonDate.getTime() - unixTime)).value /
      (1000 * 60 * 60);
    const hoursFromNewMoon =
      -maxByProperty(newMoonDates, (newMoonDate) => -Math.abs(newMoonDate.getTime() - unixTime)).value /
      (1000 * 60 * 60);

    const isSuperMoon = hoursFromFullMoon < 24 && p.peak.distance < superMoonThreshold;
    const isSuperNewMoon = hoursFromNewMoon < 24 && p.peak.distance < superMoonThreshold;

    return {
      date,
      distance: p.peak.distance,
      angleFromFullMoon,
      angleFromFullMoonDegrees: radToDeg(angleFromFullMoon),
      hoursFromFullMoon,
      hoursFromNewMoon,
      isSuperMoon,
      isSuperNewMoon,
    };
  });
}

function getClosestAngleUnixTimes(ephemeris: Ephemeris, cosTargetAngle: number, unixTimes: number[]): number[] {
  return getPeaks(
    unixTimes,
    (t) => t,
    (t) => getProximityToAngle(t),
    (t) => t,
    peakRangeThresholdSeconds
  ).map((p) => p.peak);

  function getProximityToAngle(unixTime: number): number {
    const positions = getEarthAndMoonPositions(ephemeris, getAstronomicalTime(new Date(unixTime)));
    const cosAngle = getCosAngleFromFullMoon(positions);
    return -Math.abs(cosAngle - cosTargetAngle);
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

type ViewComponents = {
  viewDimensions: ViewDimensions;
  svg: D3DatalessSelection<SVGSVGElement>;
  xScale: D3ScaleTime;
  yScale: D3ScaleLinear;
  xAxis: D3DatalessSelection<SVGGElement>;
  yAxis: D3DatalessSelection<SVGGElement>;
  path: D3DatalessSelection<SVGPathElement>;
  points: D3Selection<SVGCircleElement, Perigee, SVGGElement, undefined>;
  fullMoonLines: D3Selection<SVGLineElement, Date, SVGGElement, undefined>;
  zoomBehavior: ZoomBehavior<SVGSVGElement, undefined>;
  tooltipOverlay: OverlayElement<PerigeeElems>;
  selectedPerigee: Perigee | null;
};
