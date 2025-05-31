import type { BaseType, ScaleLinear, ScaleTime, Selection } from "d3";

export type D3DatalessSelection<TElement extends Element, TParentElem extends BaseType = null> = Selection<
  TElement,
  undefined,
  TParentElem,
  undefined
>;

export type D3ScaleTime = ScaleTime<number, number>;

export type D3ScaleLinear = ScaleLinear<number, number>;
