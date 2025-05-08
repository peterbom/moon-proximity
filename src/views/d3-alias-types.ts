import type { ScaleLinear, ScaleTime, Selection } from "d3";

export type D3DatalessSelection<TElement extends Element> = Selection<TElement, undefined, null, undefined>;

export type D3ScaleTime = ScaleTime<number, number>;

export type D3ScaleLinear = ScaleLinear<number, number>;
