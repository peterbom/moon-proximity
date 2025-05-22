import { DelayedProperty, NotifiableProperty } from "./common/state-properties";
import { EarthMoonPositions, Ephemeris } from "./ephemeris";
import { ProximityShapeData } from "./geo-shape-data";

export type State = {
  tldrView: NotifiableProperty<boolean>;
  ephPromise: Promise<Ephemeris>;
  datePositions: DelayedProperty<DatePosition[]>;
  dateDistances: DelayedProperty<DateDistance[]>;
  perigees: DelayedProperty<Perigee[]>;
  selectedPerigee: NotifiableProperty<Perigee | null>;
  proximityShapeData: NotifiableProperty<ProximityShapeData | null>;
  terrainLocationData: NotifiableProperty<TerrainLocationData | null>;
  savedPoints: NotifiableProperty<SavedPoint[]>;
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
