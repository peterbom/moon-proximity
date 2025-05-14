import {
  getEarthLocalWorldTransforms,
  getEclipticPlaneLocalWorldTransforms,
  getLatLongPosition,
} from "../calculations";
import { Cleanup } from "../common/cleanup";
import {
  createTextOverlay,
  getOrCreateAbsolutePositionCanvas,
  OverlayElement,
  setAbsoluteStyleRect,
  setupSlider,
  StyleRect,
} from "../common/html-utils";
import { IdGenerator } from "../common/id-generator";
import { clamp, degToRad, makeScale, radToDeg } from "../common/math";
import { compose4, makeViewProjectionMatrices } from "../common/matrices";
import type { SphericalCoordinate, Vector3, Vector4 } from "../common/numeric-types";
import { normalize, scaleVector } from "../common/vectors";
import {
  applyTransformMatrix,
  applyTransforms,
  asAxialRotationFromUnitX,
  asScaleTransform,
  asTranslation,
  asYRotation,
  asZRotation,
  getNormalTransformSeries,
  getTransformSeriesMatrix,
  LocalWorldTransforms,
  TransformSeries,
} from "../common/xform";
import {
  earthEquatorialRadius,
  earthPolarRadius,
  highlightClosestKmCount,
  highlightColor,
  sunlightColor,
} from "../constants";
import { Ephemeris } from "../ephemeris";
import { createEllipsoidShapeData, createProximityShapeData } from "../geo-shape-data";
import type { LatLongPosition } from "../geo-types";
import { getProximityLine } from "../proximity-line";
import type { Perigee, State } from "../state-types";
import { overlay } from "../styles/site.module.css";
import { AstronomicalTime, getAstronomicalTime } from "../time";
import { createVertexAttribsInfo } from "../webgl/attributes";
import { addMouseListeners } from "../webgl/canvas-interaction";
import { MultiViewContext } from "../webgl/context";
import type { CanvasCoordinates, ScreenRect } from "../webgl/dimension-types";
import { addDragHandlers, DragData } from "../webgl/drag-interaction";
import { DrawOptions } from "../webgl/draw-options";
import { floatToUint16 } from "../webgl/format-conversion";
import { createMouseMovePicking, createPickingRenderTarget, MousePickResult } from "../webgl/picking-utils";
import { ProgramInfo, VertexAttribsInfo } from "../webgl/program-types";
import {
  CommonLitObjectAttribValues,
  CommonLitObjectUniformValues,
  createTextureAttributeLitObjectProgramInfo,
  createTextureAttributeLitObjectVao,
  createUniformColorLitObjectProgramInfo,
  createUniformColorLitObjectVao,
  TextureAttributeLitObjectAttribValues,
  TextureAttributeLitObjectUniformValues,
  UniformColorLitObjectUniformValues,
} from "../webgl/programs/lit-object";
import {
  createPickingProgramInfo,
  PickingAttribValues,
  PickingOutputTextureInfos,
  PickingUniformValues,
} from "../webgl/programs/picking";
import {
  ColorAttributeSimpleObjectAttribValues,
  ColorAttributeSimpleObjectUniformValues,
  CommonSimpleObjectAttribValues,
  CommonSimpleObjectUniformValues,
  createColorAttributeSimpleObjectProgramInfo,
  createColorAttributeSimpleObjectVao,
  createUniformColorSimpleObjectProgramInfo,
  createUniformColorSimpleObjectVao,
  UniformColorSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import { FramebufferRenderTarget, ScreenRenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import type { ObjectWithId } from "../webgl/scene-types";
import { createCircleShapeData, createPlaneShapeData, createStraightLineShapeData } from "../webgl/shape-generation";
import { TextureDefinition } from "../webgl/texture-definition";
import { createDownloadingTexture } from "../webgl/texture-utils";
import { UniformContext } from "../webgl/uniforms";

const debugPicking = false;

const idGenerator = new IdGenerator(1);
const cleanup = new Cleanup();

const timeStepMs = 1000 * 60;
const lightColor = sunlightColor;
const ambientToDirect = 0.4;
const fov = degToRad(60);
const eclipticPlaneSize = earthEquatorialRadius * 3;

const viewInfo = {
  cameraDistance: (earthEquatorialRadius * 1.4) / Math.tan(fov / 2),
  viewAdjustment: { r: 1, theta: 0, phi: 0 } as SphericalCoordinate,
  fieldOfView: fov,
  nearLimit: 10,
  farLimit: 1e8,
};

const earthTexturePath = "/resources/2k_earth_daymap.jpg";
const earthTextureDefinition = new TextureDefinition("RGB8").withMipmap(true);

const earthShapeData = createEllipsoidShapeData(earthEquatorialRadius, earthPolarRadius);
const straightLineShapeData = createStraightLineShapeData([1, 0, 0]);
const circleShapeData = createCircleShapeData(1, 360);
const eclipticPlaneShapeData = createPlaneShapeData(eclipticPlaneSize, eclipticPlaneSize);

const coordDistanceDisplayHtml = `
<div>lat: <span data-var="lat"></span>°</div>
<div>lon: <span data-var="lon"></span>°</div>
<div>distance: +<span data-var="dist"></span>km</div>
`;

type CoordDistanceElems = {
  lat: Element;
  lon: Element;
  dist: Element;
};

function getCoordDistanceElems(parent: Element): CoordDistanceElems {
  return {
    lat: parent.querySelector("span[data-var='lat']")!,
    lon: parent.querySelector("span[data-var='lon']")!,
    dist: parent.querySelector("span[data-var='dist']")!,
  };
}

export async function run(context: MultiViewContext, state: State) {
  const ephemeris = await state.ephPromise;

  const gl = context.gl;

  const textureAttributeLitObjectProgramInfo = createTextureAttributeLitObjectProgramInfo(gl);
  const interpolatePickingProgramInfo = createPickingProgramInfo(gl, true);
  const uniformColorLitObjectProgramInfo = createUniformColorLitObjectProgramInfo(gl);
  const colorAttributeSimpleObjectProgramInfo = createColorAttributeSimpleObjectProgramInfo(gl);
  const uniformColorSimpleObjectProgramInfo = createUniformColorSimpleObjectProgramInfo(gl);

  const vaos = {
    earth: createTextureAttributeLitObjectVao(gl, textureAttributeLitObjectProgramInfo.attribSetters, earthShapeData),
    earthPicking: createVertexAttribsInfo(gl, interpolatePickingProgramInfo.attribSetters, {
      attribsInfo: {
        a_position: { type: gl.FLOAT, data: earthShapeData.positions },
        a_values: { type: gl.FLOAT, data: earthShapeData.geodeticCoords },
      },
      indices: earthShapeData.indices,
    }),
    eclipticPlane: createUniformColorLitObjectVao(
      gl,
      uniformColorLitObjectProgramInfo.attribSetters,
      eclipticPlaneShapeData
    ),
    line: createUniformColorSimpleObjectVao(gl, uniformColorLitObjectProgramInfo.attribSetters, straightLineShapeData),
    circle: createUniformColorSimpleObjectVao(gl, uniformColorLitObjectProgramInfo.attribSetters, circleShapeData),
  };

  const resources: ViewResources = {
    overlays: {
      coordsDistance: createTextOverlay(
        context.virtualCanvas,
        coordDistanceDisplayHtml,
        getCoordDistanceElems,
        overlay
      ),
    },
    programs: {
      textureAttributeLitObjectProgramInfo,
      interpolatePickingProgramInfo,
      uniformColorLitObjectProgramInfo,
      colorAttributeSimpleObjectProgramInfo,
      uniformColorSimpleObjectProgramInfo,
    },
    vaos,
    earthTexture: createDownloadingTexture(gl, earthTexturePath, earthTextureDefinition, [0, 0, 255, 255]),
    ephemeris,
    pickingRenderTarget: createPickingRenderTarget(gl, "RGBA16F"),
  };

  state.selectedPerigee.subscribe((p) => runWithDate(context, state, resources, p));
  runWithDate(context, state, resources, state.selectedPerigee.getValue());
}

function runWithDate(
  context: MultiViewContext,
  state: State,
  viewResources: ViewResources,
  selectedPerigee: Perigee | null
) {
  if (selectedPerigee === null) {
    return;
  }

  setupSlider(context.virtualCanvas, "time", {
    value: 0,
    updated: (v) => updateTime(new Date(selectedPerigee.date.getTime() + timeStepMs * v)),
    min: -120,
    max: 120,
    displayVal(value) {
      return new Date(selectedPerigee.date.getTime() + timeStepMs * value).toISOString();
    },
  });

  const ephemeris = viewResources.ephemeris;
  let sceneInfo = getSceneInfo(ephemeris, selectedPerigee.date);
  const maxTimeRangeSeconds = 60 * 60 * 24;
  const proximityLine = getProximityLine(ephemeris, sceneInfo.time, highlightClosestKmCount, maxTimeRangeSeconds, 60);
  const proximityShapeData = createProximityShapeData(
    proximityLine,
    earthEquatorialRadius,
    earthPolarRadius,
    highlightColor
  );

  state.proximityShapeData.setValue(proximityShapeData);

  const earthObject: LitSceneObject = {
    id: idGenerator.getNextId(),
    name: "Earth",
    getTransforms: (sceneInfo) => sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
    shininess: 100,
    show: true,
  };

  const eclipticPlaneObject: UniformColorLitSceneObject = {
    id: idGenerator.getNextId(),
    name: "Ecliptic plane",
    getTransforms: (sceneInfo) => [
      asTranslation([-eclipticPlaneSize / 2, -eclipticPlaneSize / 2, 0]),
      ...sceneInfo.eclipticPlaneLocalWorldTransforms.localToWorldTransforms,
      asTranslation(sceneInfo.earthPosition),
    ],
    color: [1, 1, 1, 0.2],
    shininess: 100,
    show: true,
  };

  const proximityShapeObject: CommonSceneObject = {
    id: idGenerator.getNextId(),
    name: "Moon closest proximity",
    getTransforms: (sceneInfo) => [
      asScaleTransform(1.001),
      ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
    ],
    show: true,
  };

  const lineObjects: UniformColorSceneObject[] = [
    {
      id: idGenerator.getNextId(),
      name: "Earth to sun",
      getTransforms: (sceneInfo) => [
        asAxialRotationFromUnitX(sceneInfo.localSunDirectionUnit),
        asScaleTransform(earthEquatorialRadius * 2),
        ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
      ],
      color: [...sunlightColor, 1],
      show: true,
    },
    {
      id: idGenerator.getNextId(),
      name: "Earth to moon",
      getTransforms: (sceneInfo) => [
        asAxialRotationFromUnitX(sceneInfo.localMoonDirectionUnit),
        asScaleTransform(earthEquatorialRadius * 2),
        ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
      ],
      color: [0.6, 0.6, 0.6, 1],
      show: true,
    },
    {
      id: idGenerator.getNextId(),
      name: "Earth axis",
      getTransforms: (sceneInfo) => [
        asTranslation([-0.5, 0, 0]),
        asYRotation(Math.PI / 2), // Align with z axis
        asScaleTransform(earthPolarRadius * 3),
        ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
      ],
      color: [1, 1, 0, 1],
      show: true,
    },
    {
      id: idGenerator.getNextId(),
      name: "X",
      getTransforms: (sceneInfo) => [
        asScaleTransform(earthEquatorialRadius * 2),
        asTranslation(sceneInfo.earthPosition),
      ],
      color: [1, 0, 0, 1],
      show: false,
    },
    {
      id: idGenerator.getNextId(),
      name: "Y",
      getTransforms: (sceneInfo) => [
        asScaleTransform(earthEquatorialRadius * 2),
        asZRotation(Math.PI / 2),
        asTranslation(sceneInfo.earthPosition),
      ],
      color: [0, 1, 0, 1],
      show: false,
    },
    {
      id: idGenerator.getNextId(),
      name: "Z",
      getTransforms: (sceneInfo) => [
        asScaleTransform(earthEquatorialRadius * 2),
        asYRotation(-Math.PI / 2),
        asTranslation(sceneInfo.earthPosition),
      ],
      color: [0, 0, 1, 1],
      show: false,
    },
  ];

  const circleObjects: UniformColorSceneObject[] = [
    {
      id: idGenerator.getNextId(),
      name: "Equator",
      getTransforms: (sceneInfo) => [
        asScaleTransform(earthEquatorialRadius * 1.001),
        ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
      ],
      color: [1, 1, 0, 1],
      show: true,
    },
  ];

  function updateTime(date: Date) {
    sceneInfo = getSceneInfo(ephemeris, date);
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleMouseDrag(dragData: DragData) {
    // The delta is an approximation of clip space (i.e. the y-axis is up/down).
    // Translate x deltas to phi (longitudinal) rotation and y deltas to theta rotation.
    const [deltaX, deltaY] = dragData.positionDelta;
    const visibleDistancePerClipUnit = viewInfo.cameraDistance * Math.tan(viewInfo.fieldOfView / 2);
    const thetaDelta = Math.atan((deltaY * visibleDistancePerClipUnit) / earthEquatorialRadius);
    const phiDelta = Math.atan((deltaX * visibleDistancePerClipUnit) / earthEquatorialRadius);

    viewInfo.viewAdjustment.theta = clamp(viewInfo.viewAdjustment.theta - thetaDelta, -Math.PI / 2, Math.PI / 2);
    viewInfo.viewAdjustment.phi -= phiDelta;

    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleZoom(_coords: CanvasCoordinates, delta: number) {
    const allowedDistance = viewInfo.cameraDistance - earthEquatorialRadius - viewInfo.nearLimit;
    const newDistance = allowedDistance * (1 + Math.sign(delta) * 0.1) + earthEquatorialRadius + viewInfo.nearLimit;
    viewInfo.cameraDistance = newDistance;
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleMousePick(coords: CanvasCoordinates, result: MousePickResult) {
    const styleRect: Partial<StyleRect> = {
      left: coords.canvasCssX,
      top: coords.canvasCssY,
    };

    const coordsOverlay = viewResources.overlays.coordsDistance;
    const isEarthObject = result.id === earthObject.id;
    const isProximityObject = result.id === proximityShapeObject.id;

    setAbsoluteStyleRect(coordsOverlay.overlay, isEarthObject || isProximityObject, styleRect);

    if (isEarthObject || isProximityObject) {
      const [lon, lat, distance] = result.values;
      coordsOverlay.content.lat.textContent = radToDeg(lat).toFixed(2);
      coordsOverlay.content.lon.textContent = radToDeg(lon).toFixed(2);
      coordsOverlay.content.dist.textContent = isProximityObject ? distance.toFixed(2) : ` >${highlightClosestKmCount}`;
    }
  }

  const gl = context.gl;

  const proximityShapeVaoInfo = createColorAttributeSimpleObjectVao(
    gl,
    viewResources.programs.colorAttributeSimpleObjectProgramInfo.attribSetters,
    proximityShapeData
  );

  const proximityPickingVaoInfo = createVertexAttribsInfo(
    gl,
    viewResources.programs.interpolatePickingProgramInfo.attribSetters,
    {
      attribsInfo: {
        a_position: { type: gl.FLOAT, data: proximityShapeData.positions },
        a_values: {
          type: gl.FLOAT,
          data: proximityShapeData.geodeticCoords.map((coord, i) => [
            ...coord,
            proximityShapeData.distancesAboveMin[i],
          ]),
        },
      },
      indices: earthShapeData.indices,
    }
  );

  cleanup.add(proximityShapeVaoInfo);
  cleanup.add(proximityPickingVaoInfo);

  const uniformContext = UniformContext.create((rect) => getSceneContext(sceneInfo, rect));

  const earthUniformCollector = uniformContext
    .createCollector<TextureAttributeLitObjectUniformValues, LitSceneObject>()
    .withSceneUniforms(getCommonSharedLitSceneUniformValues)
    .withSceneUniform("u_texture", () => viewResources.earthTexture)
    .withObjectUniforms(getCommonLitObjectUniformValues);

  const uniformColorLitObjectUniformCollector = uniformContext
    .createCollector<UniformColorLitObjectUniformValues, UniformColorLitSceneObject>()
    .withSceneUniforms(getCommonSharedLitSceneUniformValues)
    .withObjectUniforms(getCommonLitObjectUniformValues)
    .withObjectUniform("u_color", (_ctx, obj) => obj.color);

  const colorAttributeSimpleObjectUniformCollector = uniformContext
    .createCollector<ColorAttributeSimpleObjectUniformValues, CommonSceneObject>()
    .withObjectUniform("u_matrix", (context, obj) => {
      const worldMatrix = getTransformSeriesMatrix(obj.getTransforms(context.sceneInfo));
      return compose4(worldMatrix, context.viewProjectionMatrix);
    });

  const uniformColorSimpleObjectUniformCollector = uniformContext
    .createCollector<UniformColorSimpleObjectUniformValues, UniformColorSceneObject>()
    .withObjectUniforms((context, obj) => {
      const worldMatrix = getTransformSeriesMatrix(obj.getTransforms(context.sceneInfo));
      const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
      return {
        u_matrix: matrix,
        u_color: obj.color,
      };
    });

  const earthPickingUniformCollector = uniformContext
    .createCollector<PickingUniformValues, LitSceneObject>()
    .withObjectUniforms((context, obj) => {
      const { u_matrix } = getCommonLitObjectUniformValues(context, obj);
      return {
        u_id: obj.id,
        u_matrix,
      };
    });

  const proximityPickingUniformCollector = uniformContext
    .createCollector<PickingUniformValues, CommonSceneObject>()
    .withObjectUniforms((context, obj) => {
      const worldMatrix = getTransformSeriesMatrix(obj.getTransforms(context.sceneInfo));
      const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
      return {
        u_id: obj.id,
        u_matrix: matrix,
      };
    });

  const screenRenderTarget = new ScreenRenderTarget(gl);

  const sceneRenderer = new SceneRenderer(gl);

  sceneRenderer.addSceneObjects(
    [earthObject].filter((o) => o.show),
    earthUniformCollector,
    viewResources.programs.textureAttributeLitObjectProgramInfo,
    viewResources.vaos.earth,
    screenRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    [earthObject].filter((o) => o.show),
    earthPickingUniformCollector,
    viewResources.programs.interpolatePickingProgramInfo,
    viewResources.vaos.earthPicking,
    viewResources.pickingRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    [eclipticPlaneObject].filter((o) => o.show),
    uniformColorLitObjectUniformCollector,
    viewResources.programs.uniformColorLitObjectProgramInfo,
    viewResources.vaos.eclipticPlane,
    screenRenderTarget,
    DrawOptions.default().blend(true).depthMask(false).depthTest(true)
  );

  sceneRenderer.addSceneObjects(
    [proximityShapeObject].filter((o) => o.show),
    colorAttributeSimpleObjectUniformCollector,
    viewResources.programs.colorAttributeSimpleObjectProgramInfo,
    proximityShapeVaoInfo,
    screenRenderTarget,
    DrawOptions.default().blend(true)
  );

  sceneRenderer.addSceneObjects(
    [proximityShapeObject].filter((o) => o.show),
    proximityPickingUniformCollector,
    viewResources.programs.interpolatePickingProgramInfo,
    proximityPickingVaoInfo,
    viewResources.pickingRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    lineObjects.filter((o) => o.show),
    uniformColorSimpleObjectUniformCollector,
    viewResources.programs.uniformColorSimpleObjectProgramInfo,
    viewResources.vaos.line,
    screenRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    circleObjects.filter((o) => o.show),
    uniformColorSimpleObjectUniformCollector,
    viewResources.programs.uniformColorSimpleObjectProgramInfo,
    viewResources.vaos.circle,
    screenRenderTarget,
    DrawOptions.default()
  );

  cleanup.add(addDragHandlers(context.combinedCanvas, context.virtualCanvas, handleMouseDrag));
  cleanup.add(addMouseListeners(context.combinedCanvas, context.virtualCanvas, { scroll: handleZoom }));
  cleanup.add(
    createMouseMovePicking(
      context.combinedCanvas,
      context.virtualCanvas,
      viewResources.pickingRenderTarget,
      handleMousePick
    )
  );

  context.multiSceneDrawer.registerStillDrawer(context.virtualCanvas, drawScene);

  function drawScene(pixelRect: ScreenRect) {
    sceneRenderer.render(pixelRect);

    if (debugPicking) {
      const canvasElem = getOrCreateAbsolutePositionCanvas(context.virtualCanvas, {
        width: context.virtualCanvas.clientWidth,
        height: context.virtualCanvas.clientHeight,
        left: 0,
        top: context.virtualCanvas.clientHeight + 5,
      });

      const coordDomain: [number, number] = [floatToUint16(0), floatToUint16(Math.PI)];
      const coordRange: [number, number] = [0, 255];
      const coordScale = makeScale(coordDomain, coordRange);
      const distanceScale = makeScale([floatToUint16(0), floatToUint16(10)], [0, 255]);
      const adjust = (color: Vector4): Vector4 => {
        const r = Math.abs(coordScale(color[0]));
        const g = Math.abs(coordScale(color[1]));
        const b = distanceScale(color[2]);
        return [r, g, b, 255];
      };

      viewResources.pickingRenderTarget.drawToCanvas(canvasElem, "values", true, adjust);
    }
  }
}

function getSceneContext(sceneInfo: SceneInfo, drawingRect: ScreenRect): SceneContext {
  // Rather than rotating the world to suit the camera, we manipulate the camera position
  // so that it rotates around the (offset) Earth. This allows us to place objects exactly
  // where they should be relative to the solar system barycenter.
  const cameraTransforms: TransformSeries = [
    asYRotation(-viewInfo.viewAdjustment.theta), // because we're starting with positive x: [1, 0, 0]
    asScaleTransform(viewInfo.cameraDistance),
    asZRotation(sceneInfo.moonLatLongPosition.longAngle + viewInfo.viewAdjustment.phi),
    ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
  ];

  const [cameraPosition] = applyTransforms(cameraTransforms, [1, 0, 0]);
  const { viewProjectionMatrix } = makeViewProjectionMatrices(cameraPosition, drawingRect.width / drawingRect.height, {
    cameraTargetPosition: sceneInfo.earthPosition,
    near: viewInfo.nearLimit,
    far: viewInfo.farLimit,
    up: sceneInfo.earthRotationAxis,
    fov: viewInfo.fieldOfView,
  });

  return { sceneInfo, viewProjectionMatrix };
}

function getCommonSharedLitSceneUniformValues(
  context: SceneContext
): Pick<
  TextureAttributeLitObjectUniformValues,
  "u_ambientColor" | "u_lightColor" | "u_lightPosition" | "u_cameraPosition"
> {
  return {
    u_ambientColor: scaleVector(lightColor, ambientToDirect),
    u_lightColor: scaleVector(lightColor, 1 - ambientToDirect),
    u_lightPosition: context.sceneInfo.sunPosition,
    u_cameraPosition: [0, 0, viewInfo.cameraDistance],
  };
}

function getCommonLitObjectUniformValues(
  context: SceneContext,
  obj: LitSceneObject
): Pick<CommonLitObjectUniformValues, "u_worldMatrix" | "u_matrix" | "u_normalMatrix" | "u_shininess"> {
  const transforms = obj.getTransforms(context.sceneInfo);
  const worldMatrix = getTransformSeriesMatrix(transforms);
  const matrix = compose4(worldMatrix, context.viewProjectionMatrix);

  const normalTransformSeries = getNormalTransformSeries(transforms);
  const normalMatrix = getTransformSeriesMatrix(normalTransformSeries);

  return {
    u_worldMatrix: worldMatrix,
    u_matrix: matrix,
    u_normalMatrix: normalMatrix,
    u_shininess: obj.shininess,
  };
}

function getSceneInfo(ephemeris: Ephemeris, date: Date): SceneInfo {
  const time = getAstronomicalTime(date);

  const eclipticPlaneLocalWorldTransforms = getEclipticPlaneLocalWorldTransforms(ephemeris, time);
  const earthRotation = ephemeris.getEarthRotation(time);

  const sunPosition = ephemeris.getSunPosition(time);
  const earthMoonBarycenterPosition = ephemeris.getEarthMoonBarycenterPosition(time);
  const { moonPosition, earthPosition } = ephemeris.getEarthAndMoonPositions(earthMoonBarycenterPosition, time);
  const earthLocalWorldTransforms = getEarthLocalWorldTransforms(ephemeris, time, earthPosition);

  const [localMoonPosition, localSunPosition] = applyTransformMatrix(
    earthLocalWorldTransforms.worldToLocalMatrix,
    moonPosition,
    sunPosition
  );

  const localMoonDirectionUnit = normalize(localMoonPosition);
  const localSunDirectionUnit = normalize(localSunPosition);

  const moonLatLongPosition = getLatLongPosition(localMoonPosition);

  return {
    time,
    sunPosition,
    earthPosition,
    moonPosition,
    earthRotationAxis: earthRotation.axis,
    moonLatLongPosition,
    localMoonDirectionUnit,
    localSunDirectionUnit,
    earthLocalWorldTransforms,
    eclipticPlaneLocalWorldTransforms,
  };
}

type ViewResources = {
  overlays: Overlays;
  programs: Programs;
  vaos: VaoInfos;
  pickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>;
  earthTexture: WebGLTexture;
  ephemeris: Ephemeris;
};

type Overlays = {
  coordsDistance: OverlayElement<CoordDistanceElems>;
};

type Programs = {
  textureAttributeLitObjectProgramInfo: ProgramInfo<
    TextureAttributeLitObjectAttribValues,
    TextureAttributeLitObjectUniformValues
  >;
  interpolatePickingProgramInfo: ProgramInfo<PickingAttribValues, PickingUniformValues>;
  uniformColorLitObjectProgramInfo: ProgramInfo<CommonLitObjectAttribValues, UniformColorLitObjectUniformValues>;
  colorAttributeSimpleObjectProgramInfo: ProgramInfo<
    ColorAttributeSimpleObjectAttribValues,
    CommonSimpleObjectUniformValues
  >;
  uniformColorSimpleObjectProgramInfo: ProgramInfo<
    CommonSimpleObjectAttribValues,
    UniformColorSimpleObjectUniformValues
  >;
};

type VaoInfos = {
  earth: VertexAttribsInfo<TextureAttributeLitObjectAttribValues>;
  earthPicking: VertexAttribsInfo<PickingAttribValues>;
  eclipticPlane: VertexAttribsInfo<CommonLitObjectAttribValues>;
  line: VertexAttribsInfo<CommonSimpleObjectAttribValues>;
  circle: VertexAttribsInfo<CommonSimpleObjectAttribValues>;
};

type SceneInfo = {
  time: AstronomicalTime;
  sunPosition: Vector3;
  earthPosition: Vector3;
  moonPosition: Vector3;
  earthRotationAxis: Vector3;
  moonLatLongPosition: LatLongPosition;
  localMoonDirectionUnit: Vector3;
  localSunDirectionUnit: Vector3;
  earthLocalWorldTransforms: LocalWorldTransforms;
  eclipticPlaneLocalWorldTransforms: LocalWorldTransforms;
};

type SceneContext = {
  viewProjectionMatrix: number[];
  sceneInfo: SceneInfo;
};

type CommonSceneObject = ObjectWithId & {
  name: string;
  getTransforms: (sceneInfo: SceneInfo) => TransformSeries;
  show: boolean;
};

type UniformColorSceneObject = CommonSceneObject & {
  color: Vector4;
};

type LitSceneObject = CommonSceneObject & {
  shininess: number;
};

type UniformColorLitSceneObject = LitSceneObject & {
  color: Vector4;
};
