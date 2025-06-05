import { DatePosition, EclipseMagnitude } from "./calculations";
import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { Ephemeris } from "./ephemeris";
import { ProximityShapeData } from "./geo-shape-data";

export type State = {
  tldrView: NotifiableProperty<boolean>;
  ephPromise: Promise<Ephemeris>;
  timeRange: NotifiableProperty<TimeRange>;
  datePositions: DelayedProperty<DatePosition[]>;
  perigees: NotifiableProperty<Perigee[]>;
  selectedPerigee: NotifiableProperty<Perigee | null>;
  proximityShapeData: NotifiableProperty<ProximityShapeData | null>;
  terrainLocationData: NotifiableProperty<TerrainLocationData | null>;
  savedPoints: NotifiableProperty<SavedPoint[]>;
};

export type TimeRange = {
  startDate: Date;
  endDate: Date;
};

export type Perigee = DatePosition & {
  hoursFromFullMoon: number;
  hoursFromNewMoon: number;
  angleBetweenMoonAndSun: number;
  moonVisibleAngle: number;
  sunVisibleAngle: number;
  isSuperMoon: boolean;
  isSuperNewMoon: boolean;
  lunarEclipseMagnitude: EclipseMagnitude;
};

export type TerrainLocationData = {
  longitudeDegrees: number;
  latitudeDegrees: number;
  altitudeInM: number;
  distanceToMoonInKm: number;
  relativeProximityInKm: number;
  optimalDate: Date;
};

export type SavedPoint = {
  longitudeDegrees: number;
  latitudeDegrees: number;
  altitudeInM: number;
  distanceToMoonInKm: number;
  idealUnixTime: number; // For serialization
};
