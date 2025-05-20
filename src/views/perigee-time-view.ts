import { axisBottom, axisLeft, create, curveNatural, extent, line, scaleLinear, scaleUtc, zoom } from "d3";
import type { D3ZoomEvent } from "d3";
import { asCssColor } from "../common/html-utils";
import { radToDeg } from "../common/math";
import { displayEndDate, displayStartDate, highlightColor, moonlightColor } from "../constants";
import { DateDistance, DatePosition, Perigee, State } from "../state-types";
import { createPerigeeOverlay, handlePerigeeMouseout, handlePerigeeMouseover } from "./perigee-info-overlay";
import { D3ScaleTime } from "./d3-alias-types";
import { Ephemeris } from "../ephemeris";
import { getBestQualitySampleRanges, QualitySample, refine } from "../common/peak-detection";
import { getAngleFromFullMoon, getCosAngleFromFullMoon, getDistance, getEarthMoonPositions } from "../calculations";
import { scaleVector } from "../common/vectors";

const lineColor = asCssColor([...moonlightColor, 1]);
const moonCircleColor = asCssColor([...moonlightColor, 1]);
const pointColor = asCssColor([...highlightColor, 1]);

const deselectedMoonCircleColor = asCssColor([...scaleVector(moonlightColor, 0.4), 1]);
const deselectedPointColor = asCssColor([...scaleVector(highlightColor, 0.4), 1]);

const fullMoonCosAngle = 1;
const newMoonCosAngle = -1;

export async function run(container: HTMLElement, state: State) {
  const ephemeris = await state.ephPromise;
  const datePositions = await state.datePositions.getValue();
  const dateDistances = await state.dateDistances.getValue();

  const { perigees, fullMoonDates } = getPerigeesAndFullMoonDates(ephemeris, datePositions, dateDistances);

  state.perigees.setValue(perigees);

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

  // Declare the x (time) scale.
  const xScale = scaleUtc()
    .domain([displayStartDate, displayEndDate])
    .range([marginLeft, width - marginRight])
    .nice();

  let xZoomed = xScale;

  // Declare the y (distance) scale.
  const yScale = scaleLinear()
    .domain(extent(perigees, (d) => d.distance) as [number, number]) // cast needed: https://stackoverflow.com/a/75465468
    .range([height - marginBottom, marginTop])
    .nice();

  // Given a time scaling function, constructs a 'd' attribute value (string representation of the line).
  const makeLine = (xScalingFunction: D3ScaleTime) =>
    line<Perigee>()
      .x((d) => xScalingFunction(d.date))
      .y((d) => yScale(d.distance))
      .curve(curveNatural)(perigees);

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
    .attr("stroke-width", 0.5)
    .style("stroke-dasharray", "5,5")
    .attr("d", makeLine(xScale));

  const points = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("circle")
    .data(perigees)
    .enter()
    .append("circle")
    .attr("cx", (p) => xScale(p.date))
    .attr("cy", (p) => yScale(p.distance))
    .attr("r", getRadius)
    .attr("stroke", getCircleOutlineColor)
    .attr("stroke-width", (p) => (p.isSuperMoon || p.isSuperNewMoon ? 2 : 0))
    .attr("fill", getCircleColor)
    .style("cursor", "pointer")
    .on("mouseover", (_e, p) => handlePerigeeMouseover(tooltipOverlay, p, xZoomed(p.date), yScale(p.distance)))
    .on("mouseout", () => handlePerigeeMouseout(tooltipOverlay))
    .on("pointerdown", (_e, p) => state.selectedPerigee.setValue(p));

  const fullMoonLines = svg
    .append("g")
    .attr("clip-path", `url(#${clipId})`)
    .selectAll("line")
    .data(fullMoonDates)
    .enter()
    .append("line")
    .attr("x1", xScale)
    .attr("y1", 0)
    .attr("x2", xScale)
    .attr("y2", height - marginTop - marginBottom)
    .style("stroke-width", 1)
    .style("stroke", lineColor)
    .style("fill", "none");

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
  svg.call(zoomBehavior).call(zoomBehavior.scaleTo, 8, [xScale(displayStartDate), 0]);

  // Append the SVG element.
  container.append(svg.node()!);

  // When zooming, redraw the area and the x axis.
  function zoomed(event: D3ZoomEvent<SVGElement, undefined>) {
    xZoomed = event.transform.rescaleX(xScale);
    path.attr("d", makeLine(xZoomed));
    points.attr("cx", (d) => xZoomed(d.date));
    fullMoonLines.attr("x1", xZoomed).attr("x2", xZoomed);
    scaleXAxis(xZoomed);
  }

  function selectedPerigeeChanged(perigee: Perigee | null) {
    selectedPerigee = perigee;
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

function getPerigeesAndFullMoonDates(
  ephemeris: Ephemeris,
  datePositions: DatePosition[],
  dateDistances: DateDistance[]
): { perigees: Perigee[]; fullMoonDates: Date[] } {
  const unixTimes = datePositions.map((p) => p.date.getTime());

  const fullMoonDates = getClosestAngleDates(ephemeris, fullMoonCosAngle, unixTimes).map(
    (d) => new Date(d.refinedUnixTime)
  );
  const perigeePositions = getPerigeePositions(ephemeris, dateDistances);
  const perigeeUnixTimes = perigeePositions.map((p) => p.unixTime);

  const superMoonUnixTimes = new Set(
    getClosestAngleDates(ephemeris, fullMoonCosAngle, perigeeUnixTimes).map((d) => d.sourceUnixTime)
  );

  const superNewMoonUnixTimes = new Set(
    getClosestAngleDates(ephemeris, newMoonCosAngle, perigeeUnixTimes).map((d) => d.sourceUnixTime)
  );

  const perigees = perigeePositions.map<Perigee>((p) => {
    return {
      date: new Date(p.unixTime),
      distance: p.distance,
      angleFromFullMoon: p.angleFromFullMoon,
      angleFromFullMoonDegrees: radToDeg(p.angleFromFullMoon),
      isSuperMoon: superMoonUnixTimes.has(p.unixTime),
      isSuperNewMoon: superNewMoonUnixTimes.has(p.unixTime),
    };
  });

  return { perigees, fullMoonDates };
}

// Aim to calculate troughs within 30 seconds of the minimum distance.
const peakRangeThresholdSeconds = 1000 * 30;

function getPerigeePositions(ephemeris: Ephemeris, dateDistances: DateDistance[]): UnixTimeDistanceAngle[] {
  const qualitySamples: QualitySample[] = dateDistances.map((dd) => ({
    value: dd.date.getTime(),
    quality: -dd.distance,
  }));

  const troughRanges = getBestQualitySampleRanges(qualitySamples);
  const troughs = troughRanges.map((range) =>
    refine(
      range,
      (unixTime) => {
        const positions = getEarthMoonPositions(ephemeris, unixTime);
        return -getDistance(positions);
      },
      peakRangeThresholdSeconds
    )
  );

  return troughs.map<UnixTimeDistanceAngle>((t) => {
    const positions = getEarthMoonPositions(ephemeris, t.value);
    const angleFromFullMoon = getAngleFromFullMoon(positions);
    return {
      unixTime: t.value,
      distance: -t.quality,
      angleFromFullMoon,
    };
  });
}

function getClosestAngleDates(
  ephemeris: Ephemeris,
  cosTargetAngle: number,
  unixTimes: number[]
): ClosestUnixTimeResult[] {
  const qualitySamples: QualitySample[] = unixTimes.map((unixTime) => ({
    value: unixTime,
    quality: getProximityToAngle(unixTime),
  }));

  const peakRanges = getBestQualitySampleRanges(qualitySamples);
  return peakRanges.map<ClosestUnixTimeResult>((range) => {
    const sourceUnixTime = range.peak.value;
    const refinedUnixTime = refine(range, getProximityToAngle, peakRangeThresholdSeconds).value;
    return { sourceUnixTime, refinedUnixTime };
  });

  function getProximityToAngle(unixTime: number): number {
    const positions = getEarthMoonPositions(ephemeris, unixTime);
    const cosAngle = getCosAngleFromFullMoon(positions);
    return -Math.abs(cosAngle - cosTargetAngle);
  }
}

type UnixTimeDistanceAngle = {
  unixTime: number;
  distance: number;
  angleFromFullMoon: number;
};

type ClosestUnixTimeResult = {
  sourceUnixTime: number;
  refinedUnixTime: number;
};
