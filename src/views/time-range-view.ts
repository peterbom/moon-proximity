/*
Range slider based on:
- https://observablehq.com/@sarah37/snapping-range-slider-with-d3-brush
*/

import { axisBottom, brushX, create, D3BrushEvent, scaleUtc } from "d3";
import { dataEndDate, dataStartDate } from "../constants";
import { State } from "../state-types";
import { toFriendlyUTC } from "../common/text-utils";

export async function run(container: HTMLElement, state: State) {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const marginTop = 1;
  const marginBottom = 30;
  const marginLeft = 75;
  const marginRight = 75;

  const svg = create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("style", "max-width: 100%; height: auto;");

  container.append(svg.node()!);

  const xScale = scaleUtc()
    .domain([dataStartDate, dataEndDate])
    .range([marginLeft, width - marginRight])
    .nice();

  svg
    .append("g")
    .call(
      axisBottom(xScale)
        .ticks(width / 80)
        .tickSizeOuter(0)
    )
    .attr("transform", `translate(0,${height - marginBottom})`);

  const bodyStyle = window.getComputedStyle(document.body);
  const labelStart = svg
    .append("text")
    .attr("x", 0)
    .attr("y", height / 2)
    .attr("fill", bodyStyle.color)
    .attr("font-size", "0.7rem")
    .attr("dominant-baseline", "middle")
    .attr("text-anchor", "end");

  const labelEnd = svg
    .append("text")
    .attr("x", 0)
    .attr("y", height / 2)
    .attr("fill", bodyStyle.color)
    .attr("font-size", "0.7rem")
    .attr("dominant-baseline", "middle")
    .attr("text-anchor", "start");

  const brushBehavior = brushX<undefined>()
    .extent([
      [marginLeft, marginTop],
      [width - marginRight, height],
    ])
    .on("brush", (event: D3BrushEvent<undefined>) => {
      const [x1, x2] = event.selection as [number, number];
      const [d1, d2] = [xScale.invert(x1), xScale.invert(x2)];
      labelStart.attr("x", x1 - 8).text(toFriendlyUTC(d1, { showTime: false, showUTC: false }));
      labelEnd.attr("x", x2 + 8).text(toFriendlyUTC(d2, { showTime: false, showUTC: false }));

      // Move brush handles
      handle.attr("display", null).attr("transform", (handle: BrushHandle) => {
        const isLeft = handle.type === "w";
        const x = isLeft ? x1 : x2;
        return `translate(${x}, ${-height / 4})`;
      });
    })
    .on("end", (event: any) => {
      if (event.selection) {
        // Update view
        const sel = event.selection as [number, number];
        const [startDate, endDate] = sel.map(xScale.invert);
        state.timeRange.setValue({ startDate, endDate });
      }
    });

  const brush = svg.append("g").call(brushBehavior);

  const brushResizePath = (handle: BrushHandle) => {
    const isRight = handle.type === "e";
    const e = isRight ? 1 : 0;
    const x = isRight ? 1 : -1;
    const y = height / 2;

    // prettier-ignore
    return `M${0.5 * x},${y}A6,6 0 0 ${e} ${6.5 * x},${y + 6}V${2 * y - 6}A6,6 0 0 ${e} ${0.5 * x},${2 * y}ZM${2.5 * x},${y + 8}V${2 * y - 8}M${4.5 * x},${y + 8}V${2 * y - 8}`;
  };

  const handle = brush
    .selectAll(".handle--custom")
    .data<BrushHandle>([{ type: "w" }, { type: "e" }])
    .join("path")
    .attr("class", "handle--custom")
    .attr("stroke", "#555")
    .attr("fill", "#aaa")
    .attr("cursor", "ew-resize")
    .attr("d", brushResizePath);

  // override default behaviour - clicking outside of the selected area
  // will select a small piece there rather than deselecting everything
  // https://bl.ocks.org/mbostock/6498000
  brush
    .selectAll(".overlay")
    .each((d: any) => {
      d.type = "selection";
    })
    .on("mousedown touchstart", (e: MouseEvent) => {
      const oldTimeRange = state.timeRange.getValue();
      const interval = oldTimeRange.endDate.getTime() - oldTimeRange.startDate.getTime();
      const startDate = xScale.invert(e.offsetX);
      const endTime = Math.min(dataEndDate.getTime(), startDate.getTime() + interval);
      const endDate = new Date(endTime);

      state.timeRange.setValue({ startDate, endDate });
      updateBrushFromState();
    });

  updateBrushFromState();
  function updateBrushFromState() {
    const { startDate, endDate } = state.timeRange.getValue();
    brush.call(brushBehavior.move, [startDate, endDate].map(xScale) as [number, number]);
  }
}

type BrushHandle = {
  type: "e" | "w";
};
