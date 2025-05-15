export function seq(n: number): number[] {
  return Array.from(Array(n).keys());
}

export function seqStep(from: number, to: number, step: number): number[] {
  return seq(Math.floor((to - from) / step) + 1).map((n) => n * step + from);
}

/**
 * Groups objects with a shared property value, but retains the ordering in the original array
 * (i.e. only groups items that are adjacent).
 */
export function orderPreservingGroupBy<TObj, TVal>(objects: TObj[], accessor: (obj: TObj) => TVal): TObj[][] {
  const results: TObj[][] = [];
  if (objects.length === 0) {
    return results;
  }

  let lastVal = accessor(objects[0]);
  let lastGroup: TObj[] = [objects[0]];
  results.push(lastGroup);
  for (let i = 1; i < objects.length; i++) {
    const thisObj = objects[i];
    const thisVal = accessor(thisObj);
    if (thisVal === lastVal) {
      lastGroup.push(thisObj);
    } else {
      lastVal = thisVal;
      lastGroup = [thisObj];
      results.push(lastGroup);
    }
  }

  return results;
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

export function splitByProperty<T>(items: T[], matches: (item: T) => boolean): { matching: T[]; notMatching: T[] } {
  const matching: T[] = [];
  const notMatching: T[] = [];
  items.forEach((item) => {
    if (matches(item)) {
      matching.push(item);
    } else {
      notMatching.push(item);
    }
  });

  return { matching, notMatching };
}

export type PairwiseMatch<T> = {
  indexA: number;
  indexB: number;
  itemA: T;
  itemB: T;
};

export function getPairwiseMatches<T>(
  groupA: T[],
  groupB: T[],
  getCorrespondence: (itemA: T, itemB: T) => number
): PairwiseMatch<T>[] {
  const results: PairwiseMatch<T>[] = [];

  const groupBUsage = groupB.map((item) => ({ item, used: false }));
  for (let indexA = 0; indexA < groupA.length; indexA++) {
    const itemA = groupA[indexA];
    const bestB = maxByProperty(groupB, (itemB) => getCorrespondence(itemA, itemB));
    results.push({
      indexA,
      indexB: bestB.index,
      itemA,
      itemB: bestB.item,
    });

    groupBUsage.filter((u) => u.item === bestB).forEach((u) => (u.used = true));
  }

  // All group A items are matched. Now match any missing group B items
  for (const itemB of groupBUsage.filter((u) => !u.used).map((u) => u.item)) {
    const bestA = maxByProperty(groupA, (itemA) => getCorrespondence(itemA, itemB));
    results.push({
      indexA: bestA.index,
      indexB: groupB.indexOf(itemB),
      itemA: bestA.item,
      itemB,
    });
  }

  return results;
}
