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
import { getRange } from "../common/iteration";
import { degToRad, makeScale, radToDeg } from "../common/math";
import { compose4, makeViewProjectionMatrices } from "../common/matrices";
import type { Vector2, Vector3, Vector4 } from "../common/numeric-types";
import { addVectors, getSpatialExtent } from "../common/vectors";
import {
  asScaleTransform,
  asTranslation,
  asYRotation,
  asZRotation,
  getTransformSeriesMatrix,
  TransformSeries,
} from "../common/xform";
import { earthEquatorialRadius } from "../constants";
import { createPinShapeData, ProximityShapeData } from "../geo-shape-data";
import { ProximityTileCollection } from "../map-tiling/proximity-tile-collection";
import { ProximityTerrainData } from "../proximity-terrain-data";
import type { State } from "../state-types";
import { overlay } from "../styles/site.module.css";
import { addMouseListeners } from "../webgl/canvas-interaction";
import type { MultiViewContext } from "../webgl/context";
import type { CanvasCoordinates, ScreenRect } from "../webgl/dimension-types";
import { addDragHandlers, DragData } from "../webgl/drag-interaction";
import { DrawOptions } from "../webgl/draw-options";
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
  CommonSimpleObjectUniformValues,
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
import { FramebufferRenderTarget, ScreenRenderTarget } from "../webgl/render-target";
import { SceneRenderer } from "../webgl/scene-renderer";
import type { ObjectWithId } from "../webgl/scene-types";
import { createPlaneShapeData, createStraightLineShapeData } from "../webgl/shape-generation";
import { drawToCanvas, readTexture } from "../webgl/texture-utils";
import { UniformContext } from "../webgl/uniforms";

const debugColorTexture = false;
const debugDataTexturesIndex = 0;

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
  pinCount: 1,
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
    pickingProgramInfo: createPickingProgramInfo(gl, true),
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
    pinPicking: createPositionValuePickingVao(gl, programs.pickingProgramInfo.attribSetters, pinShapeData),
    straightLine: createUniformColorSimpleObjectVao(
      gl,
      programs.uniformColorSimpleObjectProgramInfo.attribSetters,
      straightLineShapeData
    ),
  };

  const proximityShapeData = state.proximityShapeData.getValue();
  const resources: NewSelectionResources = {
    overlays: {
      terrain: createTextOverlay(context.virtualCanvas, terrainDisplayHtml, getTerrainOverlayElems, overlay),
      pin: createTextOverlay(context.virtualCanvas, pinDisplayHtml, getPinOverlayElems, overlay),
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
  // Every time new data is selected, clean up previous resources.
  cleanup.clean();

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

  setupSlider(context.virtualCanvas, "pins", {
    value: viewInfo.pinCount,
    updated: updatePinCount,
    min: 1,
    max: 10,
  });

  const closestPoints = resources.terrainData.getTopClosestPoints(10);
  const terrainShapeData = resources.terrainData.createShapeData();
  const terrainSpatialExtent = getSpatialExtent(terrainShapeData.positions);

  const terrainObject: CommonSceneObject = {
    id: idGenerator.getNextId(),
    getTransforms: () => [asScaleTransform([1, 1, viewInfo.heightScaleFactor])],
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

  function updatePinCount(pinCount: number) {
    viewInfo.pinCount = pinCount;
    context.multiSceneDrawer.requestRedraw(context.virtualCanvas);
  }

  function handleMouseDrag(dragData: DragData) {
    // The delta is an approximation of clip space (i.e. the y-axis is up/down).
    // Translate x deltas to longitudinal movement and y deltas to latitude.
    const [deltaX, deltaY] = dragData.positionDelta;
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
      const tilePos = resources.terrainData.getTilePositionFromMap([x, y]);

      const { lat, long } = resources.terrainData.getLatLong(tilePos);
      resources.overlays.terrain.content.lat.textContent = radToDeg(lat).toFixed(2);
      resources.overlays.terrain.content.lon.textContent = radToDeg(long).toFixed(2);

      const elev = resources.terrainData.getElevation(tilePos);
      resources.overlays.terrain.content.elev.textContent = elev.toFixed();

      // When displaying the overall distance, take elevation data into account (converting from m to km).
      const distanceAboveMin = resources.terrainData.getDistanceAboveMin(tilePos) - elev / 1000;
      const distance = resources.proximityShapeData.minDistance + distanceAboveMin;
      resources.overlays.terrain.content.dist.textContent = Math.round(distance).toLocaleString();

      const deltaSign = Math.sign(distanceAboveMin) >= 0 ? "+" : "-";
      resources.overlays.terrain.content.deltaDist.textContent = `${deltaSign}${Math.abs(distanceAboveMin).toFixed(2)}`;

      const unixSeconds = resources.terrainData.getUnixSeconds(tilePos);
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

  const terrainCoordPickingVao = createPositionValuePickingVao(
    gl,
    resources.programs.pickingProgramInfo.attribSetters,
    terrainShapeData
  );

  cleanup.add(terrainVao);
  cleanup.add(terrainCoordPickingVao);

  const uniformContext = UniformContext.create((rect) => getSceneContext(resources, rect));

  const uniformColorSimpleObjectUniformCollector = uniformContext
    .createCollector<UniformColorSimpleObjectUniformValues, UniformColorSceneObject>()
    .withObjectUniforms(getCommonSceneObjectUniformValues);

  const terrainObjectUniformCollector = uniformContext
    .createCollector<TextureAttributeSimpleObjectUniformValues, CommonSceneObject>()
    .withObjectUniforms(getCommonSceneObjectUniformValues)
    .withObjectUniform("u_texture", () => resources.terrainData.colorTexture.texture);

  const terrainPickingUniformCollector = uniformContext
    .createCollector<PickingUniformValues, CommonSceneObject>()
    .withObjectUniforms(getCommonSceneObjectUniformValues)
    .withObjectUniform("u_id", (_context, obj) => obj.id);

  const colorAttributeSimpleObjectUniformCollector = uniformContext
    .createCollector<ColorAttributeSimpleObjectUniformValues, CommonSceneObject>()
    .withObjectUniforms(getCommonSceneObjectUniformValues);

  const screenRenderTarget = new ScreenRenderTarget(gl);

  const sceneRenderer = new SceneRenderer(gl);

  sceneRenderer.addSceneObjects(
    [terrainObject].filter((o) => o.show),
    terrainObjectUniformCollector,
    resources.programs.textureAttributeSimpleObjectProgramInfo,
    terrainVao,
    screenRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    [terrainObject].filter((o) => o.show),
    terrainPickingUniformCollector,
    resources.programs.pickingProgramInfo,
    terrainCoordPickingVao,
    resources.coordsPickingRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    [horizontalPlaneObject].filter((o) => o.show),
    uniformColorSimpleObjectUniformCollector,
    resources.programs.uniformColorSimpleObjectProgramInfo,
    resources.vaos.horizontalPlane,
    screenRenderTarget,
    DrawOptions.default().blend(true).depthMask(false).depthTest(true)
  );

  sceneRenderer.addSceneObjects(
    lineObjects.filter((o) => o.show),
    uniformColorSimpleObjectUniformCollector,
    resources.programs.uniformColorSimpleObjectProgramInfo,
    resources.vaos.straightLine,
    screenRenderTarget,
    DrawOptions.default()
  );

  sceneRenderer.addSceneObjects(
    pinObjects,
    colorAttributeSimpleObjectUniformCollector,
    resources.programs.colorAttributeSimpleObjectProgramInfo,
    resources.vaos.pin,
    screenRenderTarget,
    DrawOptions.default()
  );

  cleanup.add(addDragHandlers(context.combinedCanvas, context.virtualCanvas, handleMouseDrag));
  cleanup.add(addMouseListeners(context.combinedCanvas, context.virtualCanvas, { scroll: handleZoom }));
  cleanup.add(
    createMouseMovePicking(
      context.combinedCanvas,
      context.virtualCanvas,
      resources.coordsPickingRenderTarget,
      handleMousePick
    )
  );

  context.multiSceneDrawer.registerStillDrawer(context.virtualCanvas, drawScene);

  function drawScene(pixelRect: ScreenRect) {
    sceneRenderer.render(pixelRect);

    if (debugColorTexture) {
      const { width, height } = resources.terrainData.colorTextureTiledArea.targetDimensions;

      const canvasElem = getOrCreateAbsolutePositionCanvas(
        context.virtualCanvas,
        {
          width,
          height,
          left: -context.virtualCanvas.clientLeft,
          top: context.virtualCanvas.clientHeight + 5,
        },
        { name: "mapcolor", number: 1 }
      );

      const readInfo = readTexture(gl, resources.terrainData.colorTexture, { xOffset: 0, yOffset: 0, width, height });
      drawToCanvas(canvasElem, readInfo, false);
    }

    if (debugDataTexturesIndex >= 0) {
      const tile = resources.terrainData.rectangularTileLayout.groupedOrderedTiles.flat()[debugDataTexturesIndex];

      const textures = resources.terrainData.getTextures(tile);
      const { width, height } = resources.terrainData.dataTextureDimensions;
      const left = 0;
      [textures.proximities, textures.elevations, textures.distancesAboveMin, textures.unixSeconds].forEach(
        (texture, i) => {
          const top =
            context.virtualCanvas.clientHeight + 5 + (resources.terrainData.dataTextureDimensions.height + 5) * i;

          const rect = { width, height, left, top };
          const canvasElem = getOrCreateAbsolutePositionCanvas(context.virtualCanvas, rect, {
            name: "mapdata",
            number: i,
          });

          const readInfo = readTexture(gl, texture, { xOffset: 0, yOffset: 0, width, height });

          const { min, max } = getRange(readInfo.buffer);

          const domain: [number, number] = [min, max];
          const range: [number, number] = [0, 255];
          const scale = makeScale(domain, range);
          const adjust = (color: Vector4): Vector4 => {
            const r = scale(color[0]);
            const g = scale(color[1]);
            const b = scale(color[2]);
            return [r, g, b, 255];
          };

          drawToCanvas(canvasElem, readInfo, false, adjust);
        }
      );
    }
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

  const { viewProjectionMatrix } = makeViewProjectionMatrices(cameraPosition, pixelRect.width / pixelRect.height, {
    cameraTargetPosition: cameraTargetPosition,
    near: viewInfo.nearLimit,
    far: viewInfo.farLimit,
    up,
    fov: viewInfo.fieldOfView,
  });

  return { viewProjectionMatrix };
}

function getCommonSceneObjectUniformValues(
  context: SceneContext,
  obj: CommonSceneObject
): CommonSimpleObjectUniformValues {
  const transforms = obj.getTransforms();
  const worldMatrix = getTransformSeriesMatrix(transforms);
  const matrix = compose4(worldMatrix, context.viewProjectionMatrix);

  return {
    u_matrix: matrix,
  };
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
  pickingProgramInfo: ProgramInfo<PickingAttribValues, PickingUniformValues>;
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
