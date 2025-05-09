import { createTextOverlay, OverlayElement, setAbsoluteStyleRect, setupSlider, StyleRect } from "../common/html-utils";
import { IdGenerator } from "../common/id-generator";
import { clamp, degToRad, radToDeg } from "../common/math";
import type { SphericalCoordinate, Vector3, Vector4 } from "../common/numeric-types";
import {
  asAxialRotationFromUnitX,
  asScaleTransform,
  asTranslation,
  asYRotation,
  asZRotation,
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
import { getProximityLine } from "../proximity-line";
import { Perigee, State } from "../state-types";
import { addMouseListeners } from "../webgl/canvas-interaction";
import { MultiViewContext } from "../webgl/context";
import { CanvasCoordinates } from "../webgl/dimension-types";
import { addDragHandlers, DragData } from "../webgl/drag-interaction";
import { createPickingRenderTarget, MousePickResult } from "../webgl/picking-utils";
import {
  createTextureAttributeLitObjectProgramInfo,
  createUniformColorLitObjectProgramInfo,
} from "../webgl/programs/lit-object";
import { createPickingProgramInfo } from "../webgl/programs/picking";
import { createUniformColorSimpleObjectProgramInfo } from "../webgl/programs/simple-object";
import { ObjectWithId } from "../webgl/scene-types";
import { createCircleShapeData, createPlaneShapeData, createStraightLineShapeData } from "../webgl/shape-generation";

const idGenerator = new IdGenerator(1);

const timeStepMs = 1000 * 60;
const lightColor = sunlightColor;
const ambientToDirect = 0.4;
const fov = degToRad(60);

const viewInfo = {
  cameraDistance: (earthEquatorialRadius * 1.4) / Math.tan(fov / 2),
  viewAdjustment: { r: 1, theta: 0, phi: 0 } as SphericalCoordinate,
  fieldOfView: fov,
  nearLimit: 10,
  farLimit: 1e8,
};

const earthShapeData = createEllipsoidShapeData(earthEquatorialRadius, earthPolarRadius);
const straightLineShapeData = createStraightLineShapeData([1, 0, 0]);
const circleShapeData = createCircleShapeData(1, 360);
const eclipticPlaneShapeData = createPlaneShapeData(earthEquatorialRadius * 3, earthEquatorialRadius * 3);

const coordDisplayHtml = `
<div>lat: <span data-var="lat"></span></div>
<div>lon: <span data-var="lon"></span></div>
`;

type CoordElems = {
  lat: Element;
  lon: Element;
};

function getCoordElems(parent: Element): CoordElems {
  return {
    lat: parent.querySelector("span[data-var='lat']")!,
    lon: parent.querySelector("span[data-var='lon']")!,
  };
}

export async function run(context: MultiViewContext, state: State) {
  const overlays: Overlays = {
    coords: createTextOverlay(context.virtualCanvas, coordDisplayHtml, getCoordElems),
  };

  const ephemeris = await state.ephPromise;
  state.selectedPerigee.subscribe((p) => runWithDate(context, state, ephemeris, overlays, p));
  runWithDate(context, state, ephemeris, overlays, state.selectedPerigee.getValue());
}

function runWithDate(
  context: MultiViewContext,
  state: State,
  ephemeris: Ephemeris,
  overlays: Overlays,
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

  const earthObject: TexturedSceneObject = {
    id: idGenerator.getNextId(),
    name: "Earth",
    getTransforms: (sceneInfo) => sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
    shininess: 100,
    show: true,
  };

  const eclipticPlaneObject: ColoredSceneObject = {
    id: idGenerator.getNextId(),
    name: "Ecliptic plane",
    getTransforms: (sceneInfo) => [
      ...sceneInfo.eclipticPlaneLocalWorldTransforms.localToWorldTransforms,
      asTranslation(sceneInfo.earthPosition),
    ],
    color: [1, 1, 1, 0.2],
    shininess: 100,
    show: true,
  };

  const proximityLineObject: SimpleVertexColorSceneObject = {
    id: idGenerator.getNextId(),
    name: "Moon closest proximity",
    getTransforms: (sceneInfo) => [
      asScaleTransform(1.001),
      ...sceneInfo.earthLocalWorldTransforms.localToWorldTransforms,
    ],
    show: true,
  };

  const lineObjects: SimpleSceneObject[] = [
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

  const circleObjects: SimpleSceneObject[] = [
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

    const isEarthObject = result.id === earthObject.id;
    setAbsoluteStyleRect(overlays.coords.overlay, isEarthObject, styleRect);

    if (isEarthObject) {
      const [lon, lat] = result.values;
      overlays.coords.content.lat.textContent = radToDeg(lat).toFixed(2);
      overlays.coords.content.lon.textContent = radToDeg(lon).toFixed(2);
    }
  }

  const gl = context.gl;
  const texturedObjectProgramInfo = createTextureAttributeLitObjectProgramInfo(gl);
  const interpolatePickingProgramInfo = createPickingProgramInfo(gl, true);
  const pickingRenderTarget = createPickingRenderTarget(gl, "RG32F");
  const uniformColorLitObjectProgramInfo = createUniformColorLitObjectProgramInfo(gl);
  const uniformColorSimpleObjectProgramInfo = createUniformColorSimpleObjectProgramInfo(gl);
  const simpleShapeProgramInfo = createSimpleShapeProgramInfo(gl);

  const texturedEllipsoidVaoLookup = new VertexAttribsInfoLookup<
    EllipsoidShapeData,
    LitObjectAttrib<ColorSource.TextureAttribute>
  >();
  const pickingEllipsoidVaoLookup = new VertexAttribsInfoLookup<EllipsoidShapeData, PickingAttrib>();
  const uniformColoredObjectVaoLookup = new VertexAttribsInfoLookup<ShapeData, LitObjectAttrib<ColorSource.Uniform>>();
  const simpleVertexColorObjectVaoLookup = new VertexAttribsInfoLookup<ShapeData, SimpleShapeVertexColorAttributes>();
  const simpleObjectVaoLookup = new VertexAttribsInfoLookup<ShapeData, SimpleShapeAttributes>();

  texturedEllipsoidVaoLookup.setVao([earthObject], earthShapeData, getTexturedObjectVao);
  pickingEllipsoidVaoLookup.setVao([earthObject], earthShapeData, getEarthPickingVao);
  simpleVertexColorObjectVaoLookup.setVao(
    [proximityLineObject],
    proximityShapeData,
    createSimpleShapeVertexColorVaoFromParams
  );
  uniformColoredObjectVaoLookup.setVao([eclipticPlaneObject], eclipticPlaneShapeData, getUniformColoredObjectVao);
  simpleObjectVaoLookup.setVao(lineObjects, straightLineShapeData, createSimpleShapeVaoFromParams);
  simpleObjectVaoLookup.setVao(circleObjects, circleShapeData, createSimpleShapeVaoFromParams);

  const texturedObjectUniformCollector = new TexturedObjectUniformCollector(context, () => sceneInfo);
  const uniformColoredObjectUniformCollector = new UniformColoredObjectUniformCollector(() => sceneInfo);
  const simpleVertexColorShapeUniformCollector = new SimpleVertexColorShapeUniformCollector(() => sceneInfo);
  const simpleShapeUniformCollector = new SimpleShapeUniformCollector(() => sceneInfo);
  const pickingUniformCollector = createPickingUniformCollector(texturedObjectUniformCollector, (obj, values) => ({
    u_id: obj.id,
    u_matrix: values.u_matrix,
  }));

  const sceneRenderer = new SceneRenderer(gl);
  sceneRenderer.addSceneObjects(
    [earthObject].filter((o) => o.show),
    texturedObjectUniformCollector,
    texturedObjectProgramInfo,
    texturedEllipsoidVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect);
    }
  );

  addPickingSceneObjects(
    gl,
    sceneRenderer,
    [earthObject].filter((o) => o.show),
    pickingEllipsoidVaoLookup,
    pickingUniformCollector,
    pickingInfo
  );

  sceneRenderer.addSceneObjects(
    [eclipticPlaneObject].filter((o) => o.show),
    uniformColoredObjectUniformCollector,
    uniformColoredObjectProgramInfo,
    uniformColoredObjectVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect, { depthMask: false, depthTest: true, blendConfig: true });
    }
  );

  sceneRenderer.addSceneObjects(
    [proximityLineObject].filter((o) => o.show),
    simpleVertexColorShapeUniformCollector,
    simpleVertexColorObjectProgramInfo,
    simpleVertexColorObjectVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect, { blendConfig: true });
    }
  );

  sceneRenderer.addSceneObjects(
    [...lineObjects, ...circleObjects].filter((o) => o.show),
    simpleShapeUniformCollector,
    simpleShapeProgramInfo,
    simpleObjectVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect);
    }
  );

  addDragHandlers(context.combinedCanvas, context.virtualCanvas, handleMouseDrag);
  addMouseListeners(context.combinedCanvas, context.virtualCanvas, { scroll: handleZoom });
  createMouseMovePicking(
    gl,
    context.combinedCanvas,
    context.virtualCanvas,
    pickingInfo.pickingBuffers,
    handleMousePick
  );

  context.multiSceneDrawer.registerStillDrawer(context.virtualCanvas, drawScene);

  function drawScene(pixelRect: ElementRectangle) {
    sceneRenderer.render(pixelRect);
  }
}

class TexturedObjectUniformCollector extends UniformCollector<
  SceneContext,
  TexturedSceneObject,
  LitObjectUniformValues<ColorSource.TextureAttribute>,
  PerSceneUniforms
> {
  private readonly texture: WebGLTexture;

  constructor(context: MultiViewContext, private readonly getSceneInfo: () => SceneInfo) {
    super();
    const gl = context.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));

    createImageLoadHandler("/images/moon-proximity/2k_earth_daymap.jpg", (image) => {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.generateMipmap(gl.TEXTURE_2D);
      context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
    });
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    return getSceneContext(this.getSceneInfo(), pixelRect);
  }

  protected getSceneUniformValuesImpl(
    context: SceneContext
  ): Pick<LitObjectUniformValues<ColorSource.TextureAttribute>, PerSceneUniforms> {
    return getSharedSceneUniformValues(context);
  }

  public getObjectUniformValues(
    context: SceneContext,
    obj: TexturedSceneObject
  ): Omit<LitObjectUniformValues<ColorSource.TextureAttribute>, PerSceneUniforms> {
    return {
      ...getSharedLitObjectUniformValues(context, obj),
      u_texture: this.texture,
    };
  }
}

class UniformColoredObjectUniformCollector extends UniformCollector<
  SceneContext,
  ColoredSceneObject,
  LitObjectUniformValues<ColorSource.Uniform>,
  PerSceneUniforms
> {
  constructor(private readonly getSceneInfo: () => SceneInfo) {
    super();
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    const sceneInfo = this.getSceneInfo();
    return getSceneContext(sceneInfo, pixelRect);
  }

  protected getSceneUniformValuesImpl(
    context: SceneContext
  ): Pick<LitObjectUniformValues<ColorSource.Uniform>, PerSceneUniforms> {
    return getSharedSceneUniformValues(context);
  }

  public getObjectUniformValues(
    context: SceneContext,
    obj: ColoredSceneObject
  ): Omit<LitObjectUniformValues<ColorSource.Uniform>, PerSceneUniforms> {
    return {
      ...getSharedLitObjectUniformValues(context, obj),
      u_color: obj.color,
    };
  }
}

class SimpleVertexColorShapeUniformCollector extends UniformCollector<
  SceneContext,
  SimpleVertexColorSceneObject,
  SimpleShapeVertexColorUniformValues,
  never
> {
  constructor(private readonly getSceneInfo: () => SceneInfo) {
    super();
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    const sceneInfo = this.getSceneInfo();
    return getSceneContext(sceneInfo, pixelRect);
  }

  protected getSceneUniformValuesImpl(): Pick<SimpleShapeVertexColorUniformValues, never> {
    return {};
  }

  public getObjectUniformValues(
    context: SceneContext,
    obj: SimpleVertexColorSceneObject
  ): SimpleShapeVertexColorUniformValues {
    const worldMatrix = getTransformSeriesMatrix(obj.getTransforms(context.sceneInfo));
    const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
    return {
      u_matrix: matrix,
    };
  }
}

class SimpleShapeUniformCollector extends UniformCollector<
  SceneContext,
  SimpleSceneObject,
  SimpleShapeUniformValues,
  never
> {
  constructor(private readonly getSceneInfo: () => SceneInfo) {
    super();
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    const sceneInfo = this.getSceneInfo();
    return getSceneContext(sceneInfo, pixelRect);
  }

  protected getSceneUniformValuesImpl(): Pick<SimpleShapeUniformValues, never> {
    return {};
  }

  public getObjectUniformValues(context: SceneContext, obj: SimpleSceneObject): SimpleShapeUniformValues {
    const worldMatrix = getTransformSeriesMatrix(obj.getTransforms(context.sceneInfo));
    const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
    return {
      u_matrix: matrix,
      u_color: obj.color,
    };
  }
}

function getSceneContext(sceneInfo: SceneInfo, pixelRect: ElementRectangle): SceneContext {
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
  const { viewProjectionMatrix } = createViewProjectionMatrix(cameraPosition, pixelRect.width / pixelRect.height, {
    cameraTargetPosition: sceneInfo.earthPosition,
    near: viewInfo.nearLimit,
    far: viewInfo.farLimit,
    up: sceneInfo.earthRotationAxis,
    fov: viewInfo.fieldOfView,
  });

  return { sceneInfo, viewProjectionMatrix };
}

function getSharedSceneUniformValues(context: SceneContext): Pick<LitObjectSharedUniformValues, PerSceneUniforms> {
  return {
    u_ambientColor: scaleVector(lightColor, ambientToDirect),
    u_lightColor: scaleVector(lightColor, 1 - ambientToDirect),
    u_lightPosition: context.sceneInfo.sunPosition,
    u_cameraPosition: [0, 0, viewInfo.cameraDistance],
  };
}

function getSharedLitObjectUniformValues(
  context: SceneContext,
  obj: LitSceneObject
): Omit<LitObjectSharedUniformValues, PerSceneUniforms> {
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

function getEarthPickingVao(params: GetVaoParameters<EllipsoidShapeData, PickingAttrib>) {
  return createVertexAttribsInfo(params.gl, params.attribSetters, {
    attribsInfo: {
      a_position: { type: params.gl.FLOAT, data: params.shapeData.positions },
      a_values: { type: params.gl.FLOAT, data: params.shapeData.geodeticCoords },
    },
    indices: params.shapeData.indices,
  });
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

type Overlays = {
  coords: OverlayElement<CoordElems>;
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

type SimpleVertexColorSceneObject = CommonSceneObject;

type SimpleSceneObject = CommonSceneObject & {
  color: Vector4;
};

type LitSceneObject = CommonSceneObject & {
  shininess: number;
};

type TexturedSceneObject = LitSceneObject;

type ColoredSceneObject = LitSceneObject & {
  color: Vector4;
};

type PerSceneUniforms = keyof Pick<
  LitObjectSharedUniformValues,
  "u_lightPosition" | "u_cameraPosition" | "u_lightColor" | "u_ambientColor"
>;
