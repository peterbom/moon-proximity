import { Cleanup } from "../common/cleanup";
import { createTextOverlay, OverlayElement, setAbsoluteStyleRect, setupSlider, StyleRect } from "../common/html-utils";
import { IdGenerator } from "../common/id-generator";
import { degToRad, radToDeg } from "../common/math";
import type { Vector2, Vector3, Vector4 } from "../common/numeric-types";
import { addVectors, getSpatialExtent } from "../common/vectors";
import { asScaleTransform, asTranslation, asYRotation, asZRotation, TransformSeries } from "../common/xform";
import { earthEquatorialRadius } from "../constants";
import { createPinShapeData, ProximityShapeData } from "../geo-shape-data";
import { ProximityTileCollection } from "../map-tiling/proximity-tile-collection";
import type { StructuredTileProcessors } from "../map-tiling/tile-types";
import { ProximityTerrainData } from "../proximity-terrain-data";
import type { State } from "../state-types";
import { createVertexAttribsInfo } from "../webgl/attributes";
import { addMouseListeners } from "../webgl/canvas-interaction";
import type { MultiViewContext } from "../webgl/context";
import type { CanvasCoordinates, ScreenRect } from "../webgl/dimension-types";
import { addDragHandlers } from "../webgl/drag-interaction";
import { createMouseMovePicking, createPickingRenderTarget, MousePickResult } from "../webgl/picking-utils";
import { ProgramInfo, VertexAttribsInfo } from "../webgl/program-types";
import {
  createPickingProgramInfo,
  createPositionValuePickingVao,
  PickingAttribValues,
  PickingOutputTextureInfos,
  PickingUniformValues,
} from "../webgl/programs/picking";
import {
  ColorAttributeSimpleObjectAttribValues,
  ColorAttributeSimpleObjectUniformValues,
  createColorAttributeSimpleObjectProgramInfo,
  createColorAttributeSimpleObjectVao,
  createTextureAttributeSimpleObjectProgramInfo,
  createTextureAttributeSimpleObjectVao,
  createUniformColorSimpleObjectProgramInfo,
  createUniformColorSimpleObjectVao,
  TextureAttributeSimpleObjectAttribValues,
  TextureAttributeSimpleObjectUniformValues,
  UniformColorSimpleObjectAttribValues,
  UniformColorSimpleObjectUniformValues,
} from "../webgl/programs/simple-object";
import { FramebufferRenderTarget } from "../webgl/render-target";
import type { ObjectWithId } from "../webgl/scene-types";
import { createPlaneShapeData, createStraightLineShapeData } from "../webgl/shape-generation";

const idGenerator = new IdGenerator(1);
const cleanup = new Cleanup();

const mPerRadian = earthEquatorialRadius * 1000;
const trueHeightScaleFactor = 1 / mPerRadian;

const viewInfo = {
  cameraDistance: 0.5, // radians, 1 ~= 6378km
  panPosition: [0, 0] as Vector2,
  rotation: 0, // from X axis, around the vertical (Z) axis
  tiltAngle: degToRad(45), // from vertical
  heightScaleFactor: trueHeightScaleFactor * 50,
  fieldOfView: degToRad(60),
  nearLimit: 0.001,
  farLimit: 10,
};

const straightLineShapeData = createStraightLineShapeData([1, 0, 0]);
const planeShapeData = createPlaneShapeData(1, 1);
const pinShapeData = createPinShapeData([1, 0, 0], [0.7, 0.7, 0.7]);

const terrainDisplayHtml = `
<div>lat: <span data-var="lat"></span>°</div>
<div>lon: <span data-var="lon"></span>°</div>
<div>elevation: <span data-var="elev"></span>m</div>
<div>distance: <span data-var="dist"></span>km (delta: <span data-var="delta-dist"></span>km)</div>
<div>time: <span data-var="time"></span></div>
`;

type TerrainOverlayElems = {
  lat: Element;
  lon: Element;
  elev: Element;
  dist: Element;
  deltaDist: Element;
  time: Element;
};

function getTerrainOverlayElems(parent: Element): TerrainOverlayElems {
  return {
    lat: parent.querySelector("span[data-var='lat']")!,
    lon: parent.querySelector("span[data-var='lon']")!,
    elev: parent.querySelector("span[data-var='elev']")!,
    dist: parent.querySelector("span[data-var='dist']")!,
    deltaDist: parent.querySelector("span[data-var='delta-dist']")!,
    time: parent.querySelector("span[data-var='time']")!,
  };
}

const pinDisplayHtml = `
<div>rank: <span data-var="rank"></span></div>
`;

type PinOverlayElems = {
  rank: Element;
};

function getPinOverlayElems(parent: Element): PinOverlayElems {
  return {
    rank: parent.querySelector("span[data-var='rank']")!,
  };
}

export async function run(context: MultiViewContext, state: State) {
  const tileCollection = new ProximityTileCollection(context);

  const gl = context.gl;

  const programs = {
    textureAttributeSimpleObjectProgramInfo: createTextureAttributeSimpleObjectProgramInfo(gl),
    uniformColorSimpleObjectProgramInfo: createUniformColorSimpleObjectProgramInfo(gl),
    colorAttributeSimpleObjectProgramInfo: createColorAttributeSimpleObjectProgramInfo(gl),
    interpolatePickingProgramInfo: createPickingProgramInfo(gl, true),
    flatPickingProgramInfo: createPickingProgramInfo(gl, false),
  };

  const vaos = {
    horizontalPlane: createUniformColorSimpleObjectVao(
      gl,
      programs.uniformColorSimpleObjectProgramInfo.attribSetters,
      planeShapeData
    ),
    pin: createColorAttributeSimpleObjectVao(
      gl,
      programs.colorAttributeSimpleObjectProgramInfo.attribSetters,
      pinShapeData
    ),
    pinPicking: createPositionValuePickingVao(gl, programs.interpolatePickingProgramInfo.attribSetters, pinShapeData),
    straightLine: createUniformColorSimpleObjectVao(
      gl,
      programs.uniformColorSimpleObjectProgramInfo.attribSetters,
      straightLineShapeData
    ),
  };

  const proximityShapeData = state.proximityShapeData.getValue();
  const resources: NewSelectionResources = {
    overlays: {
      terrain: createTextOverlay(context.virtualCanvas, terrainDisplayHtml, getTerrainOverlayElems),
      pin: createTextOverlay(context.virtualCanvas, pinDisplayHtml, getPinOverlayElems),
    },
    programs,
    vaos,
    coordsPickingRenderTarget: createPickingRenderTarget(gl, "RG16F"),
    tilePickingRenderTarget: createPickingRenderTarget(gl, "R8"), // TODO: Check <255 values needed
    proximityShapeData,
    tileCollection,
  };

  state.proximityShapeData.subscribe((shapeData) =>
    runWithNewSelection(context, {
      ...resources,
      proximityShapeData: shapeData,
    })
  );

  runWithNewSelection(context, resources);
}

async function runWithNewSelection(context: MultiViewContext, resources: NewSelectionResources) {
  if (resources.proximityShapeData === null) {
    return;
  }

  const proximityShapeData = resources.proximityShapeData;
  const terrainData = await resources.tileCollection.createTerrainData(proximityShapeData);

  cleanup.add(terrainData);

  const readyResources: ReadyResources = {
    ...resources,
    proximityShapeData,
    terrainData,
  };

  runWithReadyResources(context, readyResources);
}

function runWithReadyResources(context: MultiViewContext, resources: ReadyResources) {
  setupSlider(context.virtualCanvas, "rotation", {
    value: radToDeg(viewInfo.rotation),
    updated: (v) => updateViewRotation(degToRad(v)),
    min: -180,
    max: 180,
  });

  setupSlider(context.virtualCanvas, "tilt", {
    value: radToDeg(viewInfo.tiltAngle),
    updated: (v) => updateViewTilt(degToRad(v)),
    min: 0,
    max: 90,
  });

  const closestPoints = resources.terrainData.getTopClosestPoints(10);
  const terrainShapeData = resources.terrainData.createShapeData();
  const terrainSpatialExtent = getSpatialExtent(terrainShapeData.positions);

  const terrainObject: CommonSceneObject = {
    id: idGenerator.getNextId(),
    getTransforms: () => [],
    show: true,
  };

  const [minX, minY] = terrainSpatialExtent.min;
  const [maxX, maxY] = terrainSpatialExtent.max;
  const horizontalPlaneObject: UniformColorSceneObject = {
    id: idGenerator.getNextId(),
    color: [1, 1, 1, 0.2],
    getTransforms: () => [asScaleTransform([maxX - minX, maxY - minY, 1]), asTranslation([minX, minY, 0])],
    show: true,
  };

  const lineObjects: UniformColorSceneObject[] = [
    {
      id: idGenerator.getNextId(),
      getTransforms: () => [asScaleTransform(earthEquatorialRadius * 2)],
      color: [1, 0, 0, 1],
      show: false,
    },
    {
      id: idGenerator.getNextId(),
      getTransforms: () => [asScaleTransform(earthEquatorialRadius * 2), asZRotation(Math.PI / 2)],
      color: [0, 1, 0, 1],
      show: false,
    },
    {
      id: idGenerator.getNextId(),
      getTransforms: () => [asScaleTransform(earthEquatorialRadius * 2), asYRotation(-Math.PI / 2)],
      color: [0, 0, 1, 1],
      show: false,
    },
  ];

  const pinObjects: PinObject[] = closestPoints.map((location, i) => ({
    id: idGenerator.getNextId(),
    getTransforms: () => [
      asScaleTransform(viewInfo.cameraDistance * Math.tan(viewInfo.fieldOfView) * 0.05),
      asTranslation([location.latLong.long, location.latLong.lat, viewInfo.heightScaleFactor * location.proximity]),
    ],
    color: [1, 0, 0, 1],
    rank: i + 1,
    show: true,
  }));

  function updateViewRotation(rotation: number) {
    viewInfo.rotation = -rotation;
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function updateViewTilt(tiltAngle: number) {
    viewInfo.tiltAngle = tiltAngle;
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleMouseDrag(_rotationMatix: number[], delta: Vector3) {
    // The delta is an approximation of clip space (i.e. the y-axis is up/down).
    // Translate x deltas to longitudinal movement and y deltas to latitude.
    const [deltaX, deltaY] = delta;
    const visibleDistancePerClipUnit = viewInfo.cameraDistance * Math.tan(viewInfo.fieldOfView / 2);

    const cosRot = Math.cos(viewInfo.rotation);
    const sinRot = Math.sin(viewInfo.rotation);

    const xShift = -(cosRot * deltaX + sinRot * deltaY) * visibleDistancePerClipUnit;
    const yShift = -(sinRot * deltaX + cosRot * deltaY) * visibleDistancePerClipUnit;

    const [startX, startY] = viewInfo.panPosition;
    viewInfo.panPosition = [startX + xShift, startY + yShift];

    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleZoom(_coords: CanvasCoordinates, delta: number) {
    const scaleFactor = 1 + Math.sign(delta) * 0.1;
    viewInfo.cameraDistance *= scaleFactor;
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleMousePick(coords: CanvasCoordinates, result: MousePickResult) {
    const styleRect: Partial<StyleRect> = {
      left: coords.canvasCssX,
      top: coords.canvasCssY,
    };

    const isTerrainObject = result.id === terrainObject.id;
    setAbsoluteStyleRect(resources.overlays.terrain.overlay, isTerrainObject, styleRect);

    const pinObject = pinObjects.find((p) => p.id === result.id);
    setAbsoluteStyleRect(resources.overlays.pin.overlay, pinObject !== undefined, styleRect);

    if (isTerrainObject) {
      const [x, y, z] = result.values;
      const dataTexCoords: Vector2 = [x, y];

      const tileIndex = Math.floor(z); // TODO: Change picking so this is not interpolated.

      const { lat, long } = resources.terrainData.getLatLong(tileIndex, dataTexCoords);
      resources.overlays.terrain.content.lat.textContent = radToDeg(lat).toFixed(2);
      resources.overlays.terrain.content.lon.textContent = radToDeg(long).toFixed(2);

      const elev = resources.terrainData.getElevation(tileIndex, dataTexCoords);
      resources.overlays.terrain.content.elev.textContent = elev.toFixed();

      // When displaying the overall distance, take elevation data into account (converting from m to km).
      const distanceAboveMin = resources.terrainData.getDistanceAboveMin(tileIndex, dataTexCoords) - elev / 1000;
      const distance = resources.proximityShapeData.minDistance + distanceAboveMin;
      resources.overlays.terrain.content.dist.textContent = Math.round(distance).toLocaleString();

      const deltaSign = Math.sign(distanceAboveMin) >= 0 ? "+" : "-";
      resources.overlays.terrain.content.deltaDist.textContent = `${deltaSign}${Math.abs(distanceAboveMin).toFixed(2)}`;

      const unixSeconds = resources.terrainData.getUnixSeconds(tileIndex, dataTexCoords);
      resources.overlays.terrain.content.time.textContent = new Date(unixSeconds * 1000).toISOString();
    } else if (pinObject !== undefined) {
      resources.overlays.pin.content.rank.textContent = pinObject.rank.toFixed();
    }
  }

  const gl = context.gl;

  const terrainVao = createTextureAttributeSimpleObjectVao(
    gl,
    resources.programs.textureAttributeSimpleObjectProgramInfo.attribSetters,
    terrainShapeData
  );

  const terrainCoordPickingVao = createVertexAttribsInfo(
    gl,
    resources.programs.interpolatePickingProgramInfo.attribSetters,
    {
      attribsInfo: {
        a_position: { type: gl.FLOAT, data: terrainShapeData.positions },
        a_values: { type: gl.FLOAT, data: terrainShapeData.dataTexCoords },
      },
      indices: terrainShapeData.indices,
    }
  );

  const terrainTilePickingVao = createVertexAttribsInfo(
    gl,
    resources.programs.interpolatePickingProgramInfo.attribSetters,
    {
      attribsInfo: {
        a_position: { type: gl.FLOAT, data: terrainShapeData.positions },
        a_values: { type: gl.FLOAT, data: terrainShapeData.tileIndices },
      },
      indices: terrainShapeData.indices,
    }
  );

  cleanup.add(terrainVao);
  cleanup.add(terrainCoordPickingVao);
  cleanup.add(terrainTilePickingVao);

  const simpleShapeUniformCollector = new SimpleShapeUniformCollector(sceneInfo);
  const terrainObjectUniformCollector = new TerrainObjectUniformCollector(sceneInfo);
  const pickingUniformCollector = createPickingUniformCollector(terrainObjectUniformCollector, (obj, values) => ({
    u_id: obj.id,
    u_matrix: values.u_matrix,
  }));

  const sceneRenderer = new SceneRenderer(gl);
  sceneRenderer.addSceneObjects(
    [terrainObject].filter((o) => o.show),
    terrainObjectUniformCollector,
    textureAttributeSimpleObjectProgramInfo,
    simpleShapeTextureVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect);
    }
  );

  addPickingSceneObjects(
    gl,
    sceneRenderer,
    [terrainObject].filter((o) => o.show),
    pickingShapeVaoLookup,
    pickingUniformCollector,
    pickingInfo
  );

  sceneRenderer.addSceneObjects(
    [horizontalPlaneObject].filter((o) => o.show),
    simpleShapeUniformCollector,
    uniformColorSimpleObjectProgramInfo,
    simpleObjectVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect, { depthMask: false, depthTest: true, blendConfig: true });
    }
  );

  sceneRenderer.addSceneObjects(
    [...lineObjects, ...pinObjects].filter((o) => o.show),
    simpleShapeUniformCollector,
    uniformColorSimpleObjectProgramInfo,
    simpleObjectVaoLookup,
    () => null,
    (pixelRect) => {
      initDraw(gl, pixelRect);
    }
  );

  cleanup.add(addDragHandlers(context.combinedCanvas, context.virtualCanvas, handleMouseDrag));
  cleanup.add(addMouseListeners(context.combinedCanvas, context.virtualCanvas, { scroll: handleZoom }));
  cleanup.add(
    createMouseMovePicking(
      gl,
      context.combinedCanvas,
      context.virtualCanvas,
      pickingInfo.pickingBuffers,
      handleMousePick
    )
  );

  context.multiSceneDrawer.registerStillDrawer(context.virtualCanvas, drawScene);

  function drawScene(pixelRect: ScreenRect) {
    sceneRenderer.render(pixelRect);
  }
}

class SimpleShapeUniformCollector extends UniformCollector<
  SceneContext,
  UniformColorSceneObject,
  SimpleShapeUniformValues,
  never
> {
  constructor(private readonly sceneInfo: SceneInfo) {
    super();
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    return getSceneContext(this.sceneInfo, pixelRect);
  }

  protected getSceneUniformValuesImpl(): Pick<SimpleShapeUniformValues, never> {
    return {};
  }

  public getObjectUniformValues(context: SceneContext, obj: UniformColorSceneObject): SimpleShapeUniformValues {
    const worldMatrix = getTransformSeriesMatrix(obj.getTransforms());
    const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
    return {
      u_matrix: matrix,
      u_color: obj.color,
    };
  }
}

class TerrainObjectUniformCollector extends UniformCollector<
  SceneContext,
  CommonSceneObject,
  SimpleShapeTextureUniformValues,
  "u_matrix"
> {
  constructor(private readonly sceneInfo: SceneInfo) {
    super();
  }

  protected getSceneContextImpl(pixelRect: ElementRectangle): SceneContext {
    return getSceneContext(this.sceneInfo, pixelRect);
  }

  protected getSceneUniformValuesImpl(context: SceneContext): Pick<SimpleShapeTextureUniformValues, "u_matrix"> {
    const sceneTransforms = [asScaleTransform([1, 1, viewInfo.heightScaleFactor])];
    const worldMatrix = getTransformSeriesMatrix(sceneTransforms);
    const matrix = compose4(worldMatrix, context.viewProjectionMatrix);
    return {
      u_matrix: matrix,
    };
  }

  public getObjectUniformValues(
    _context: SceneContext,
    obj: CommonSceneObject
  ): Pick<SimpleShapeTextureUniformValues, "u_texture"> {
    return {
      u_texture: this.sceneInfo.structuredTileProcessors.combinedColorTexture,
    };
  }
}

function getSceneContext(resources: ReadyResources, pixelRect: ScreenRect): SceneContext {
  // Calculate the radius of the camera position on the X-Y plane relative to the camera target.
  const cameraPosRadius = viewInfo.cameraDistance * Math.sin(viewInfo.tiltAngle);
  const cameraZ = viewInfo.cameraDistance * Math.cos(viewInfo.tiltAngle);

  // Rotation is from the negative Y axis, but it's easier to calculate from the X axis,
  // so subtract 90 degrees.
  const rotation = viewInfo.rotation - Math.PI / 2;
  const rotationX = Math.cos(rotation);
  const rotationY = Math.sin(rotation);
  const cameraX = cameraPosRadius * rotationX;
  const cameraY = cameraPosRadius * rotationY;

  const minDistanceIndex = resources.proximityShapeData.minDistanceIndex;
  const minDistanceGeodeticCoords = resources.proximityShapeData.geodeticCoords[minDistanceIndex];
  const viewXY = addVectors(minDistanceGeodeticCoords, viewInfo.panPosition);
  const cameraTargetPosition: Vector3 = [...viewXY, 0];
  const cameraPosition = addVectors(cameraTargetPosition, [cameraX, cameraY, cameraZ]);

  const up: Vector3 = viewInfo.tiltAngle > 0 ? [0, 0, 1] : [-rotationX, -rotationY, 0];

  const { viewProjectionMatrix } = createViewProjectionMatrix(cameraPosition, pixelRect.width / pixelRect.height, {
    cameraTargetPosition: cameraTargetPosition,
    near: viewInfo.nearLimit,
    far: viewInfo.farLimit,
    up,
    fov: viewInfo.fieldOfView,
  });

  return { viewProjectionMatrix };
}

type NewSelectionResources = {
  overlays: Overlays;
  programs: Programs;
  vaos: VaoInfos;
  coordsPickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>;
  tilePickingRenderTarget: FramebufferRenderTarget<PickingOutputTextureInfos>;
  tileCollection: ProximityTileCollection;
  proximityShapeData: ProximityShapeData | null;
};

type ReadyResources = NewSelectionResources & {
  proximityShapeData: ProximityShapeData;
  terrainData: ProximityTerrainData;
};

type Overlays = {
  terrain: OverlayElement<TerrainOverlayElems>;
  pin: OverlayElement<PinOverlayElems>;
};

type Programs = {
  textureAttributeSimpleObjectProgramInfo: ProgramInfo<
    TextureAttributeSimpleObjectAttribValues,
    TextureAttributeSimpleObjectUniformValues
  >;
  uniformColorSimpleObjectProgramInfo: ProgramInfo<
    UniformColorSimpleObjectAttribValues,
    UniformColorSimpleObjectUniformValues
  >;
  colorAttributeSimpleObjectProgramInfo: ProgramInfo<
    ColorAttributeSimpleObjectAttribValues,
    ColorAttributeSimpleObjectUniformValues
  >;
  interpolatePickingProgramInfo: ProgramInfo<PickingAttribValues, PickingUniformValues>;
  flatPickingProgramInfo: ProgramInfo<PickingAttribValues, PickingUniformValues>;
};

type VaoInfos = {
  horizontalPlane: VertexAttribsInfo<UniformColorSimpleObjectAttribValues>;
  pin: VertexAttribsInfo<ColorAttributeSimpleObjectAttribValues>;
  pinPicking: VertexAttribsInfo<PickingAttribValues>;
  straightLine: VertexAttribsInfo<UniformColorSimpleObjectAttribValues>;
};

type SceneContext = {
  viewProjectionMatrix: number[];
};

type CommonSceneObject = ObjectWithId & {
  show: boolean;
  getTransforms: () => TransformSeries;
};

type UniformColorSceneObject = CommonSceneObject & {
  color: Vector4;
};

type PinObject = CommonSceneObject & {
  rank: number;
};
function createViewProjectionMatrix(
  cameraPosition: [number, number, number],
  arg1: number,
  arg2: { cameraTargetPosition: Vector3; near: number; far: number; up: Vector3; fov: number }
): { viewProjectionMatrix: any } {
  throw new Error("Function not implemented.");
}
