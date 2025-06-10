import type { Cleaner } from "../common/cleanup";
import { makeIdentity4, makeRotationOnAxis, multiply4 } from "../common/matrices";
import type { Vector3 } from "../common/numeric-types";
import { crossProduct3, getMagnitude, normalize, scaleVector, subtractVectors } from "../common/vectors";
import { addTouchEventListeners, TouchEventListeners } from "./canvas-interaction";
import type { CanvasCoordinates } from "./dimension-types";

const speedDropoffPerMs = 1 / 200;

type DragTracking = {
  callback: DragCallback;
  spinRequestHandle: number;
  matrix: number[];
  timestamp: number;
  position: Vector3;
  delta: Vector3;
  speed: number;
  axis: Vector3;
  history: CallbackHistoryItem[];
};

export type DragData = {
  rotationMatrix: number[];
  positionDelta: Vector3;
  history: CallbackHistoryItem[];
};

export type DragCallback = (data: DragData) => void;

export type CallbackHistoryItem = {
  delta: Vector3;
  speed: number;
  angle: number;
  movementEnded: boolean;
};

export type AddDragHandlersOptions = {
  rotationMatrix: number[];
};

const defaultAddDragHandlersOptions: AddDragHandlersOptions = {
  rotationMatrix: makeIdentity4(),
};

export function addDragHandlers(
  combinedCanvas: HTMLCanvasElement,
  virtualCanvas: HTMLElement,
  callback: DragCallback,
  options: Partial<AddDragHandlersOptions> = {}
): Cleaner {
  const { rotationMatrix } = { ...defaultAddDragHandlersOptions, ...options };

  const tracking: DragTracking = {
    callback,
    spinRequestHandle: 0,
    axis: [0, 0, 1],
    matrix: rotationMatrix,
    position: [0, 0, 0],
    delta: [0, 0, 0],
    speed: 0,
    timestamp: 0,
    history: [],
  };

  const listeners: TouchEventListeners = {
    begin(coords, timestamp) {
      startMovement(tracking, coords, timestamp);
      return true;
    },
    move(coords, timestamp) {
      updateMovement(tracking, coords, timestamp);
      return true;
    },
    end(timestamp) {
      endMovement(tracking, timestamp);
      return true;
    },
  };

  const touchHandlers = addTouchEventListeners(combinedCanvas, virtualCanvas, listeners);
  return {
    clean() {
      touchHandlers.clean();
    },
  };
}

function startMovement(tracking: DragTracking, coordinates: CanvasCoordinates, timestamp: number) {
  if (tracking.spinRequestHandle) {
    cancelAnimationFrame(tracking.spinRequestHandle);
  }

  tracking.spinRequestHandle = 0;
  tracking.position = toClipVector(coordinates);
  tracking.speed = 0;
  tracking.timestamp = timestamp;
  tracking.history = [];
}

function updateMovement(tracking: DragTracking, coordinates: CanvasCoordinates, timestamp: number) {
  if (timestamp <= tracking.timestamp) return;

  const va = tracking.position;
  const vb = toClipVector(coordinates);

  const delta = subtractVectors(vb, va);
  const angle = getMagnitude(delta);
  if (isNaN(angle) || !isFinite(angle)) return;

  const axis = normalize(crossProduct3(va, vb));
  const rotationMatrix = makeRotationOnAxis(axis, angle);
  const matrix = multiply4(rotationMatrix, tracking.matrix);

  const elapsedMs = timestamp - tracking.timestamp;
  const speed = angle / elapsedMs;

  tracking.history.push({ delta, speed, angle, movementEnded: false });
  tracking.callback({ rotationMatrix: matrix, positionDelta: delta, history: tracking.history });

  tracking.matrix = matrix;
  tracking.timestamp = timestamp;
  tracking.speed = speed;
  tracking.position = vb;
  tracking.delta = delta;
  tracking.axis = axis;
}

function endMovement(tracking: DragTracking, timestamp: number) {
  if (timestamp - tracking.timestamp > 40) return;
  if (tracking.speed < 0.0001) return;

  tracking.timestamp = timestamp;
  tracking.spinRequestHandle = window.requestAnimationFrame(tick);

  function tick(timestamp: number) {
    if (timestamp <= tracking.timestamp) {
      // Avoid negative time deltas.
      // I don't understand why this ever happens, but it does.
      tracking.timestamp = timestamp;
      tracking.spinRequestHandle = window.requestAnimationFrame(tick);
      return;
    }

    const elapsedMs = timestamp - tracking.timestamp;
    const { delta, speed, angle } = getUpdatedStats(tracking.delta, tracking.speed, elapsedMs);

    const rotationMatrix = makeRotationOnAxis(tracking.axis, angle);
    tracking.matrix = multiply4(rotationMatrix, tracking.matrix);
    tracking.delta = delta;
    tracking.speed = speed;
    tracking.timestamp = timestamp;
    tracking.history.push({ delta, speed, angle, movementEnded: true });
    tracking.callback({ rotationMatrix: tracking.matrix, positionDelta: delta, history: tracking.history });

    if (tracking.speed < 0.0001) {
      cancelAnimationFrame(tracking.spinRequestHandle);
      tracking.spinRequestHandle = 0;
    } else {
      tracking.spinRequestHandle = window.requestAnimationFrame(tick);
    }
  }
}

function toClipVector(coordinates: CanvasCoordinates): Vector3 {
  return [coordinates.clipX, coordinates.clipY, coordinates.clipZ];
}

function getUpdatedStats(
  prevDelta: Vector3,
  prevSpeed: number,
  elapsedMs: number
): { delta: Vector3; speed: number; angle: number } {
  // The angle is the sum of speeds for each ms, i.e. the area under the speed curve.
  // Take advantage of the fact that the integral of e^(nt) w.r.t t is 1/n times itself
  const speedFactor = Math.exp(-speedDropoffPerMs * elapsedMs);
  const speed = speedFactor * prevSpeed;

  // The angle is the definite integral of the speed curve between 0 and elapsedMs, multiplied by previous speed.
  // At t=0, e^(nt) = e^0 = 1
  const angle = (-1 / speedDropoffPerMs) * (speedFactor - 1) * prevSpeed;

  // The magnitude of the delta is the angle.
  const deltaScaleFactor = angle / getMagnitude(prevDelta);
  const delta = scaleVector(prevDelta, deltaScaleFactor);
  return { delta, speed, angle };
}
