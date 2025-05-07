import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { EarthMoonPositions, Ephemeris } from "./ephemeris";
import { ProximityShapeData } from "./geo-shape-data";

export type State = {
  ephPromise: Promise<Ephemeris>;
  datePositions: DelayedProperty<DatePosition[]>;
  dateDistances: DelayedProperty<DateDistance[]>;
  perigees: DelayedProperty<Perigee[]>;
  selectedPerigee: NotifiableProperty<Perigee | null>;
  proximityShapeData: NotifiableProperty<ProximityShapeData | null>;
  externals: {
    d3: any;
  };
};

export type DatePosition = {
  date: Date;
  position: EarthMoonPositions;
};

export type DateDistance = {
  date: Date;
  distance: number;
};

export type Perigee = {
  date: Date;
  distance: number;
  angleFromFullMoon: number;
  angleFromFullMoonDegrees: number;
  isSuperMoon: boolean;
  isSuperNewMoon: boolean;
};
