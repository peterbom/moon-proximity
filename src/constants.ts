import { Vector3 } from "./common/numeric-types";

export const earthEquatorialRadius = 6378.137;
export const earthPolarRadius = 6356.752314245;
export const earthToMoonMass = 81.30056845;

export const earthMeanRadius = 6371; // https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
export const moonMeanRadius = 1737.4; // https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html
export const sunMeanRadius = 695700; // https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html

export const highlightColor: Vector3 = [0.616, 0, 1]; // #9D00FF
export const sunlightColor: Vector3 = [0.99, 0.95, 0.78]; // #fcf2c7
export const moonlightColor: Vector3 = [0.76, 0.77, 0.8]; // #C2C5CC

// This determines the area of the Earth to focus on when examining the distance
// of the moon at its perigee.
// All of the Earth's surface (at sea level) which is within this distance will
// be highlighted.
export const highlightClosestKmCount = 10;

export const dataStartDate = new Date("2000-01-01T00:00:00Z");
export const dataEndDate = new Date("2100-01-01T00:00:00Z");

// https://visibleearth.nasa.gov/images/73934/topography
// "Data in these images were scaled 0-6400 meters"
export const elevationScaleFactor = 6400.0;
