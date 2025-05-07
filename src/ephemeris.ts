import { AstronomicalTime } from "./time";
import { addVectors, crossProduct3, normalize, scaleVector, subtractVectors } from "./common/vectors";
import {
  applyTransforms,
  asXRotation,
  asYRotation,
  asZRotation,
  RotationOnAxis,
  TransformSeries,
  TransformType,
} from "./common/xform";
import { earthToMoonMass } from "./constants";
import type { Vector3 } from "./common/numeric-types";

export const dataStartDate = 2458416.5; // 2018-10-25T00:00:00.000Z
export const dataEndDate = 2497136.5; // 2124-10-29T00:00:00.000Z
const eph_emb_offset = 0;
const eph_moon_offset = 43560;
const eph_sun_offset = 217800;
const eph_emb_coeffs = 6;
const eph_moon_coeffs = 6;
const eph_sun_coeffs = 2;
const eph_emb_interval_length = 16;
const eph_moon_interval_length = 4;
const eph_sun_interval_length = 16;

export const radiansPerArcsecond = Math.PI / (180 * 60 * 60);

export type EarthRotation = {
  axis: Vector3;
  axialAngle: number;
  transforms: TransformSeries;
};

export type EarthMoonPositions = {
  moonPosition: Vector3;
  earthPosition: Vector3;
};

export class Ephemeris {
  private readonly data: Float32Array;
  constructor(buffer: ArrayBuffer) {
    this.data = new Float32Array(buffer);
  }

  public getSunPosition(time: AstronomicalTime): Vector3 {
    const offset_day_count = time.julianDays - dataStartDate;

    const complete_sun_interval_count = Math.floor(offset_day_count / eph_sun_interval_length);
    const last_sun_interval_day_count = offset_day_count - complete_sun_interval_count * eph_sun_interval_length;

    // The sun's data contains a collection of values for each interval (16 days). Within each interval are
    // 2 coefficients for each x, y and z.
    const offset = eph_sun_offset + eph_sun_coeffs * complete_sun_interval_count * 3;

    // Get position within current interval, normalized to a value between -1 and 1.
    const normalized_interval_position = (last_sun_interval_day_count / eph_sun_interval_length) * 2.0 - 1.0;

    return this.getChebyshevPos(normalized_interval_position, offset, eph_sun_coeffs);
  }

  public getEarthMoonBarycenterPosition(time: AstronomicalTime): Vector3 {
    const offset_day_count = time.julianDays - dataStartDate;

    const interval = Math.floor(offset_day_count / eph_emb_interval_length);
    const thisIntervalDayCount = offset_day_count - interval * eph_emb_interval_length;

    let offset = eph_emb_offset + eph_emb_coeffs * interval * 3;

    const x = (thisIntervalDayCount / eph_emb_interval_length) * 2.0 - 1.0;

    return this.getChebyshevPos(x, offset, eph_emb_coeffs);
  }

  public getEarthMoonBarycenterVelocity(time: AstronomicalTime): Vector3 {
    const offset_day_count = time.julianDays - dataStartDate;

    const interval = Math.floor(offset_day_count / eph_emb_interval_length);
    const thisIntervalDayCount = offset_day_count - interval * eph_emb_interval_length;

    let offset = eph_emb_coeffs * interval * 3;

    const x = (thisIntervalDayCount / eph_emb_interval_length) * 2.0 - 1.0;

    let vel = this.getChebyshevVel(x, offset, eph_emb_coeffs);

    const sc = 2.0 / eph_emb_interval_length / 3600 / 24;

    vel[0] *= sc;
    vel[1] *= sc;
    vel[2] *= sc;

    return vel;
  }

  public getEarthAndMoonPositions(embPosition: Vector3, time: AstronomicalTime): EarthMoonPositions {
    const offset_day_count = time.julianDays - dataStartDate;

    const interval = Math.floor(offset_day_count / eph_moon_interval_length);
    const thisIntervalDayCount = offset_day_count - interval * eph_moon_interval_length;

    let offset = eph_moon_offset + eph_moon_coeffs * interval * 3;

    const x = (thisIntervalDayCount / eph_moon_interval_length) * 2.0 - 1.0;

    const earthToMoon = this.getChebyshevPos(x, offset, eph_moon_coeffs);

    // We know the earth-to-moon vector and the earth-moon-barycenter position.
    // Since the earth-to-moon vector passes through the barycenter, the barycenter-to-moon
    // vector is a scaling of the earth-to-moon vector.
    // The equation for center of mass in terms of mass (m) and distance (d) is:
    // m_e * d_e = m_m * d_m (m and e suffixes refer to the moon and earth)
    // We also know the total distance (d) between earth and moon is
    // d = d_e + d_m
    // These can be rearranged to find d_m:
    // d_m = d * m_e / (m_m + m_e)
    const scalingFactor = earthToMoonMass / (1 + earthToMoonMass);
    const embToMoon = scaleVector(earthToMoon, scalingFactor);

    // Now the moon position relative to the origin (solar system barycenter) is
    // the sum of ssb->emb + emb->moon
    const moonPosition = addVectors(embPosition, embToMoon);

    // And the earth relative to the origin is ssb->moon - earth->moon
    const earthPosition = subtractVectors(moonPosition, earthToMoon);
    return { moonPosition, earthPosition };
  }

  public getEarthRotation(time: AstronomicalTime): EarthRotation {
    // Apply the following rotations in order:
    // - Z: axial
    // - X: obliquity
    // - Z: -zeta
    // - Y: theta
    // - Z: -z

    // The axial (Z) rotation is the regular daily rotation amount.
    // https://en.wikipedia.org/wiki/Sidereal_time#ERA
    const axialZ = (2 * Math.PI * (0.779057273264 + 1.00273781191135448 * time.j2000Days)) % (2 * Math.PI);

    // https://en.wikipedia.org/wiki/Axial_tilt
    // ε = [23°26′21.448″] − 46.8150″ T − 0.00059″ T^2 + 0.001813″ T^3
    // We can skip the initial axial tilt of ~23° because the model is based on the J2000
    // reference frame, whose axes are aligned with the Earth's equator at 2000-01-01T12:00Z.
    const t = time.j2000Days / 36525;
    const obliquityX = (-46.815 * t - 0.00059 * t * t + 0.001813 * t * t * t) * radiansPerArcsecond;

    // https://www.celestialprogramming.com/snippets/precessionMeeus.html
    // TODO: Consider AIU2006 (https://www.celestialprogramming.com/snippets/precessionIAU2006.html)
    const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t * t * t) * radiansPerArcsecond;
    const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t * t * t) * radiansPerArcsecond;
    const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t * t * t) * radiansPerArcsecond;

    const transforms = [
      asZRotation(axialZ),
      asXRotation(obliquityX),
      asZRotation(-zeta),
      asYRotation(theta),
      asZRotation(-z),
    ];

    const axialAngle = axialZ - zeta - z;
    const [axis] = applyTransforms(transforms, [0, 0, 1]);
    return { transforms, axialAngle, axis };
  }

  public getEclipticPlane(embPos: Vector3, embVel: Vector3): { rotation: RotationOnAxis; up: Vector3 } {
    const eclipticX = normalize(embPos);
    const eclipticZ = normalize(crossProduct3(embPos, embVel));
    const eclipticY = crossProduct3(eclipticX, eclipticZ);

    // prettier-ignore
    const matrix = [
      ...eclipticX, 0,
      ...eclipticY, 0,
      ...eclipticZ, 0,
      0, 0, 0, 1
    ];

    return { rotation: { type: TransformType.RotationOnAxis, matrix }, up: eclipticZ };
  }

  private getChebyshevPos(x: number, offset: number, count: number): Vector3 {
    // For custom kernel, see: https://space.stackexchange.com/a/10492
    // https://space.stackexchange.com/questions/12506/what-is-the-exact-format-of-the-jpl-ephemeris-files
    // https://spiceypy.readthedocs.io/en/main/lessonindex.html
    const c = new Array(14);

    c[0] = 1;
    c[1] = x;

    for (let i = 2; i < count; i++) {
      c[i] = 2 * x * c[i - 1] - c[i - 2];
    }

    const xyz: Vector3 = [0, 0, 0];
    for (let i = count - 1; i >= 0; i--) {
      xyz[0] += c[i] * this.data[offset + i];
      xyz[1] += c[i] * this.data[offset + i + count];
      xyz[2] += c[i] * this.data[offset + i + count * 2];
    }

    return xyz;
  }

  private getChebyshevVel(x: number, offset: number, count: number): Vector3 {
    const c = new Array(14);

    c[0] = 1;
    c[1] = x;

    for (let i = 2; i < count; i++) {
      c[i] = 2 * x * c[i - 1] - c[i - 2];
    }

    const v = new Array(14);

    v[0] = 0;
    v[1] = 1;
    v[2] = 4 * x;

    for (let i = 3; i < count; i++) {
      v[i] = 2 * x * v[i - 1] + 2 * c[i - 1] - v[i - 2];
    }

    const xyz: Vector3 = [0, 0, 0];
    for (let i = count - 1; i >= 0; i--) {
      xyz[0] += v[i] * this.data[offset + i];
      xyz[1] += v[i] * this.data[offset + i + count];
      xyz[2] += v[i] * this.data[offset + i + count * 2];
    }

    return xyz;
  }
}
