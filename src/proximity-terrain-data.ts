import { maxByProperty } from "./common/iteration";
import type { Vector2 } from "./common/numeric-types";
import { elevationScaleFactor, highlightClosestKmCount } from "./constants";
import { createTerrainShapeData, TerrainShapeData } from "./geo-shape-data";
import {
  elevationFileOriginalDimensions,
  getTileDimensions,
  latitudeRadiansPerTile,
  longitudeRadiansPerTile,
} from "./map-tiling/earth-resource-tiles";
import type {
  EarthResourceTile,
  ImageDimensions,
  TileOutputTextures,
  TileToTextureScale,
} from "./map-tiling/tile-types";
import { TiledTextureDimensions } from "./map-tiling/tiled-texture-dimensions";
import { ScreenRect } from "./webgl/dimension-types";
import { ReadableTexture, readTexture } from "./webgl/texture-utils";

export type TerrainLongitudeLine = {
  x: number;
  longitude: number;
  points: TerrainLongitudePoint[];
};

export type TerrainLongitudePoint = {
  tile: EarthResourceTile;
  y: number;
  latitude: number;
  value: number;
};

export type TerrainLocation = {
  dataTexCoords: Vector2;
  latLong: { lat: number; long: number };
  proximity: number;
  tile: EarthResourceTile;
};

const cachedTopCount = 100;
const meshPointSpacing = 5;

export class ProximityTerrainData {
  private readonly orderedTiles: EarthResourceTile[];
  private readonly longitudeLines: TerrainLongitudeLine[];

  private readonly tileToColorTextureScaling = new Map<EarthResourceTile, TileToTextureScale>();
  private readonly elevationTextures = new Map<EarthResourceTile, ReadableTexture>();
  private readonly distancesAboveMinTextures = new Map<EarthResourceTile, ReadableTexture>();
  private readonly unixSecondsTextures = new Map<EarthResourceTile, ReadableTexture>();

  private readonly cachedTopLocations: TerrainLocation[];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly elevationTileDimensions: ImageDimensions,
    public readonly colorTexture: ReadableTexture,
    public readonly colorTiledTextureDimensions: TiledTextureDimensions,
    tileOutputTextures: Map<EarthResourceTile, TileOutputTextures>,
    groupedOrderedTiles: EarthResourceTile[][]
  ) {
    this.orderedTiles = groupedOrderedTiles.flat();

    const proximityTextures = new Map<EarthResourceTile, ReadableTexture>();
    tileOutputTextures.forEach((textures, tile) => {
      const textureScaling = colorTiledTextureDimensions.getTileToTextureScale(tile);
      proximityTextures.set(tile, textures.proximities);
      this.tileToColorTextureScaling.set(tile, textureScaling);
      this.elevationTextures.set(tile, textures.elevations);
      this.distancesAboveMinTextures.set(tile, textures.distancesAboveMin);
      this.unixSecondsTextures.set(tile, textures.unixSeconds);
    });

    this.longitudeLines = getLongitudeLines(gl, groupedOrderedTiles, proximityTextures);

    // Having used the proximity textures to calculate the longitude lines, they're no longer
    // required.
    proximityTextures.forEach((readable) => gl.deleteTexture(readable.texture));

    this.cachedTopLocations = this.calculateTopClosestPoints(cachedTopCount);
  }

  public getTopClosestPoints(topCount: number): TerrainLocation[] {
    if (topCount > cachedTopCount) {
      throw new Error(`Only ${cachedTopCount} closest points are stored.`);
    }

    return this.cachedTopLocations.slice(0, topCount);
  }

  public createShapeData(): TerrainShapeData {
    // Create the shape data from a subset of the height map data for mesh generation.
    const linesForMesh = this.getLinesForMesh();
    const tileTextureScaling = this.tileToColorTextureScaling;
    const targetTextureDimensions = this.colorTiledTextureDimensions.targetTextureDimensions;

    return createTerrainShapeData(linesForMesh, (t) => this.orderedTiles.indexOf(t), getTexCoords);

    function getTexCoords(tile: EarthResourceTile, tileX: number, tileY: number): Vector2 {
      const scaling = tileTextureScaling.get(tile)!;
      const u = scaling.scaleX(tileX) / targetTextureDimensions.width;
      const v = scaling.scaleY(tileY) / targetTextureDimensions.height;
      return [u, v];
    }
  }

  private getLinesForMesh(): TerrainLongitudeLine[] {
    const self = this;

    // Include all of the longitude lines that have a cached top proximity value.
    const cachedLongToLat = new Map<number, Set<number>>();
    this.cachedTopLocations.forEach((location) => {
      const cachedLatValuesForLong = cachedLongToLat.get(location.latLong.long);
      if (cachedLatValuesForLong === undefined) {
        cachedLongToLat.set(location.latLong.long, new Set([location.latLong.lat]));
      } else {
        cachedLatValuesForLong.add(location.latLong.lat);
      }
    });

    return this.longitudeLines.filter(includeLine).map<TerrainLongitudeLine>((line) => {
      const points = line.points.filter((p, i) => includePoint(line, p, i));
      return { ...line, points };
    });

    function includeLine(line: TerrainLongitudeLine, index: number): boolean {
      if (index === 0 || index === self.longitudeLines.length) return true;
      if (index % meshPointSpacing === 0) return true;
      if (cachedLongToLat.has(line.longitude)) return true;
      return false;
    }

    function includePoint(line: TerrainLongitudeLine, point: TerrainLongitudePoint, index: number): boolean {
      if (index === 0 || index === line.points.length) return true;
      if (index % meshPointSpacing === 0) return true;
      const cachedLatValuesForLong = cachedLongToLat.get(line.longitude);
      if (cachedLatValuesForLong !== undefined && cachedLatValuesForLong.has(point.latitude)) return true;
      return false;
    }
  }

  private calculateTopClosestPoints(topCount: number): TerrainLocation[] {
    const topClosestPoints: TerrainLocation[] = [];
    let threshold = -Infinity;
    for (const line of this.longitudeLines) {
      const x = line.x;
      for (const point of line.points) {
        const y = point.y;
        const tile = point.tile;
        if (point.value > threshold) {
          const dataTexCoords: Vector2 = [x, y];
          const latLong = { lat: point.latitude, long: line.longitude };
          const proximity = point.value;
          topClosestPoints.push({ dataTexCoords, proximity, tile, latLong });

          if (topClosestPoints.length > topCount) {
            const removeAt = maxByProperty(topClosestPoints, (l) => -l.proximity).index;
            topClosestPoints.splice(removeAt, 1);
          }

          threshold = maxByProperty(topClosestPoints, (l) => -l.proximity).item.proximity;
        }
      }
    }

    return topClosestPoints.sort((a, b) => b.proximity - a.proximity);
  }

  public getLatLong(tileIndex: number, dataTexCoords: Vector2): { long: number; lat: number } {
    const tile = this.orderedTiles[tileIndex];

    const [x, y] = dataTexCoords;
    const long = tile.startLon + (x / this.elevationTileDimensions.width) * longitudeRadiansPerTile;
    const lat = tile.startLat - (y / this.elevationTileDimensions.height) * latitudeRadiansPerTile;
    return { long, lat };
  }

  public getElevation(tileIndex: number, dataTexCoords: Vector2): number {
    const tile = this.orderedTiles[tileIndex];
    const texture = this.elevationTextures.get(tile)!;

    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return (bufferInfo.buffer[0] / 255) * elevationScaleFactor;
  }

  public getDistanceAboveMin(tileIndex: number, dataTexCoords: Vector2): number {
    const tile = this.orderedTiles[tileIndex];
    const texture = this.distancesAboveMinTextures.get(tile)!;

    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return bufferInfo.buffer[0];
  }

  public getUnixSeconds(tileIndex: number, dataTexCoords: Vector2): number {
    const tile = this.orderedTiles[tileIndex];
    const texture = this.unixSecondsTextures.get(tile)!;

    const [x, y] = dataTexCoords;
    const rect: ScreenRect = { xOffset: x, yOffset: y, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return bufferInfo.buffer[0];
  }

  public clean() {
    this.gl.deleteTexture(this.colorTexture.texture);
    this.elevationTextures.forEach((readable) => this.gl.deleteTexture(readable.texture));
    this.distancesAboveMinTextures.forEach((readable) => this.gl.deleteTexture(readable.texture));
    this.unixSecondsTextures.forEach((readable) => this.gl.deleteTexture(readable.texture));
  }
}

function getLongitudeLines(
  gl: WebGL2RenderingContext,
  groupedOrderedTiles: EarthResourceTile[][],
  tileProximityTextures: Map<EarthResourceTile, ReadableTexture>
): TerrainLongitudeLine[] {
  const lines: TerrainLongitudeLine[] = [];

  const elevationTileDimensions = getTileDimensions(elevationFileOriginalDimensions);
  const latitudeRadiansPerPixel = latitudeRadiansPerTile / elevationTileDimensions.height;
  const longitudeRadiansPerPixel = longitudeRadiansPerTile / elevationTileDimensions.width;

  const elevationTileRect: ScreenRect = {
    xOffset: 0,
    yOffset: 0,
    width: elevationTileDimensions.width,
    height: elevationTileDimensions.height,
  };

  // Divide into pixel-wide strips of equal longitude, West to East
  for (const tileGroup of groupedOrderedTiles) {
    // Get all the proximity values for all the tiles at this longitude.
    const valuesForLongitude: SourceLongitudeValues[] = tileGroup.map((tile) => {
      const proximityTexture = tileProximityTextures.get(tile)!;
      const bufferInfo = readTexture(gl, proximityTexture, elevationTileRect);
      const data = bufferInfo.buffer as Float32Array; // TODO: Pull type from texture definition?
      return { tile, data, width: elevationTileRect.width, height: elevationTileDimensions.height };
    });

    for (let x = 0; x < elevationTileDimensions.width; x++) {
      // Create a column of values by combining the x'th column from each of the tiles at this
      // longitude in order (downwards / South / descending latitude).
      const startLatitude = tileGroup[0].startLat;
      const points = [...makeColumnIterator(valuesForLongitude, startLatitude, latitudeRadiansPerPixel, x)];
      const longitude = tileGroup[0].startLon + longitudeRadiansPerPixel * x;
      if (points.length >= 2) {
        lines.push({ longitude, points, x });
      }
    }
  }

  return lines;
}

const includeThreshold = -highlightClosestKmCount * 1000;

function* makeColumnIterator(
  valuesForLongitude: SourceLongitudeValues[],
  startLatitude: number,
  latitudeRadiansPerPixel: number,
  x: number
): Generator<TerrainLongitudePoint> {
  let inRangeStarted = false;
  let latitude = startLatitude;

  for (const tileValues of valuesForLongitude) {
    const tile = tileValues.tile;
    for (let y = 0; y < tileValues.height; y++) {
      const index = y * tileValues.width + x;
      const value = tileValues.data[index];
      if (value > includeThreshold) {
        inRangeStarted = true;
        yield { latitude, value, tile, y };
      } else if (inRangeStarted) {
        // Moved out of range - finished
        return;
      }

      latitude += latitudeRadiansPerPixel;
    }
  }

  return { startLatitude };
}

type SourceLongitudeValues = {
  tile: EarthResourceTile;
  data: Float32Array;
  width: number;
  height: number;
};
