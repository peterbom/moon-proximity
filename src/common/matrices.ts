import type { Vector3 } from "./numeric-types";
import { crossProduct3, normalize, subtractVectors } from "./vectors";

export function makeIdentity4() {
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

export function makeTranslation4(xOffset: number, yOffset: number, zOffset: number) {
  /*
  1   0   0   xOffset
  0   1   0   yOffset
  0   0   1   zOffset
  0   0   0   1
  */
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    xOffset, yOffset, zOffset, 1
  ];
}

export function makeScale4(factor: Vector3 | number) {
  const [x, y, z] = typeof factor === "number" ? ([factor, factor, factor] as Vector3) : factor;

  /*
  xFactor 0       0       0
  0       yFactor 0       0
  0       0       zFactor 0
  0       0       0       1
  */
  // prettier-ignore
  return [
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
  ];
}

export function makeRotationX(angleInRadians: number) {
  /*
  1       0       0      0
  0       cos(θ) -sin(θ) 0
  0       sin(θ)  cos(θ) 0
  0       0       0      1
  */
  // prettier-ignore
  return [
    1, 0, 0, 0,
    0, Math.cos(angleInRadians), Math.sin(angleInRadians), 0,
    0, -Math.sin(angleInRadians), Math.cos(angleInRadians), 0,
    0, 0, 0, 1
  ];
}

export function makeRotationY(angleInRadians: number) {
  /*
  cos(θ)  0       sin(θ) 0
  0       1       0      0
  -sin(θ) 0       cos(θ) 0
  0       0       0      1
  */
  // prettier-ignore
  return [
    Math.cos(angleInRadians), 0, -Math.sin(angleInRadians), 0,
    0, 1, 0, 0,
    Math.sin(angleInRadians), 0, Math.cos(angleInRadians), 0,
    0, 0, 0, 1
  ];
}

export function makeRotationZ(angleInRadians: number) {
  /*
  cos(θ)  sin(θ)  0      0
  -sin(θ) cos(θ)  0      0
  0       0       1      0
  0       0       0      1
  */
  // prettier-ignore
  return [
    Math.cos(angleInRadians), Math.sin(angleInRadians), 0, 0,
    -Math.sin(angleInRadians), Math.cos(angleInRadians), 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];
}

export function makeRotationFromX(to: Vector3): number[] {
  const normTo = normalize(to);
  const rotationAxis = normalize(crossProduct3([1, 0, 0], normTo));
  const angle = Math.acos(normTo[0]);
  return makeRotationOnAxis(rotationAxis, angle);
}

export function makeRotationOnAxis(normalizedAxis: Vector3, angleInRadians: number) {
  // Using quaternion multiplication, a pure rotation around q of unit length is given by q * p * qInv
  // where p is the point to be rotated.
  //
  // The angle that (q * p * qInv) rotates p is determined by the real (w) component of q.
  // - If w is 1, then i,j,k are all 0 and the result is a noop.
  // - If w is 0, then i,j,k make a unit quaternion and the result is a 180 degree (pi) rotation.
  //
  // Because the real numbers exist on a separate dimension to the x,y,z axes (of the i,j,k components),
  // the angle between (1 + 0i + 0j + 0k) and (0 + xi + yj + zk) is 90 degrees (pi/2).
  //
  // That means that increasing the i,j,k components corresponds to rotating (1 + 0i + 0j + 0k) towards
  // (0 + xi + yj + zk). The angle of this rotation, theta, determines the proportions of q:
  // - w' = cos(theta)
  // - (x',y',z') = sin(theta)(x,y,z)
  //
  // Values of theta between 0 and 90 degrees (pi/2) will result in rotations between 0 and 180 degrees (pi).
  // So, to get our desired rotation we set theta to half the desired rotation angle.
  const theta = angleInRadians / 2;
  const ijkFactor = Math.sin(theta);
  const w = Math.cos(theta);
  const x = ijkFactor * normalizedAxis[0];
  const y = ijkFactor * normalizedAxis[1];
  const z = ijkFactor * normalizedAxis[2];

  // We now have q = (w + xi + yj + zk) and qInv = (w -xi - yj -zk).
  // To get the rotation matrix we need values for i-hat, j-hat and k-hat which correspond to rotating
  // the unit vector on each x,y,z axis.
  //
  // These work out to be:
  // q * i * qInv = 0 + (w^2 + x^2 - y^2 - z^2)i + 2(xy + wz)j + 2(xz - wy)k
  // q * j * qInv = 0 + 2(xy - wz)i + (w^2 - x^2 + y^2 - z^2)j + 2(wx + yz)k
  // q * k * qInv = 0 + 2(wy + xz)i + 2(yz - wx)j + (w^2 - x^2 - y^2 + z^2)k
  //
  // Rewriting these in terms of unit vectors based on the i,j,k components, and placing in a 4x4 matrix
  //
  // w^2 + x^2 - y^2 - z^2   2(xy - wz)              2(wy + xz)              0
  // 2(xy + wz)              w^2 - x^2 + y^2 - z^2   2(yz - wx)              0
  // 2(xz - wy)              2(wx + yz)              w^2 - x^2 - y^2 + z^2   0
  // 0                       0                       0                       1

  const w2 = Math.pow(w, 2);
  const x2 = Math.pow(x, 2);
  const y2 = Math.pow(y, 2);
  const z2 = Math.pow(z, 2);

  // prettier-ignore
  return [
    w2 + x2 - y2 - z2, 2*(x*y + w*z), 2*(x*z - w*y), 0,
    2*(x*y - w*z), w2 - x2 + y2 - z2, 2*(w*x + y*z), 0,
    2*(w*y + x*z), 2*(y*z - w*x), w2 - x2 - y2 + z2, 0,
    0, 0, 0, 1
  ];
}

export function makeLookAt(cameraPosition: Vector3, target: Vector3, up: Vector3 = [0, 1, 0]): number[] {
  // https://webglfundamentals.org/webgl/lessons/webgl-3d-camera.html

  // From the camera's perspective, the target is straight ahead along its negative z-axis.
  // So, the positive z-axis (k-hat) points out behind the camera in a line from the target.
  // Directionally, this is cameraPosition - target (because target + k-hat-dir = cameraPosition).
  // To avoid scaling the camera distance, k-hat needs to be normalized.
  const kHat = normalize(subtractVectors(cameraPosition, target));

  // i-hat will be perpendicular to the plane comprising the span of 'up' and k-hat.
  // j-hat will be perpendicular to the plane comprising the span of k-hat and i-hat.
  const iHat = normalize(crossProduct3(up, kHat));
  const jHat = normalize(crossProduct3(kHat, iHat));

  // The resulting transformation will include the rotational components as well as the
  // translation.
  // prettier-ignore
  return [
      ...iHat, 0,
      ...jHat, 0,
      ...kHat, 0,
      ...cameraPosition, 1,
    ];
}

function multiply4v(m: number[], v: number[]) {
  /* Indices represented mathematically
  m[0]  m[4]  m[8]  a[12]    v[0]
  m[1]  m[5]  m[9]  a[13]    v[1]
  m[2]  m[6]  m[10] a[14]    v[2]
  m[3]  m[7]  m[11] a[15]    v[3]
  */
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
  ];
}

function toColumns(m: number[], length: number) {
  const columns = [];
  for (let i = 0; i < m.length; i += length) {
    columns.push(m.slice(i, i + length));
  }
  return columns;
}

export function multiply4(a: number[], b: number[]) {
  return toColumns(b, 4)
    .map((v) => multiply4v(a, v))
    .flat();
}

export function compose4(...matrices: number[][]) {
  return matrices.reduce((prev, current) => multiply4(current, prev), makeIdentity4());
}

export function transpose4(m: number[]) {
  /*
  m0  m4  m8  m12
  m1  m5  m9  m13
  m2  m6  m10 m14
  m3  m7  m11 m15
  */
  // prettier-ignore
  return [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
  ]
}
