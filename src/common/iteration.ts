export function seq(n: number): number[] {
  return Array.from(Array(n).keys());
}

export function seqStep(from: number, to: number, step: number): number[] {
  return seq(Math.floor((to - from) / step) + 1).map((n) => n * step + from);
}

export type ItemWithValue<T> = {
  item: T;
  value: number;
  index: number;
};

export function maxByProperty<T>(items: T[], getPropertyValue: (item: T) => number): ItemWithValue<T> {
  if (items.length === 0) {
    throw new Error("Attempt to get max values from empty collection");
  }

  let maxItemWithValue: ItemWithValue<T> = {
    item: items[0],
    value: getPropertyValue(items[0]),
    index: 0,
  };

  for (let index = 1; index < items.length; index++) {
    const item = items[index];
    const value = getPropertyValue(item);
    if (value > maxItemWithValue.value) {
      maxItemWithValue = { item, value, index };
    }
  }

  return maxItemWithValue;
}
