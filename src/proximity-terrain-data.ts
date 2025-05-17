import { maxByProperty } from "./common/iteration";
import type { Vector2 } from "./common/numeric-types";
import { elevationScaleFactor, highlightClosestKmCount } from "./constants";
import { createTerrainShapeData } from "./geo-shape-data";
import {
  elevationTileDimensions,
  latitudeRadiansPerTile,
  longitudeRadiansPerTile,
} from "./map-tiling/earth-resource-tiles";
import type {
  EarthResourceTile,
  ImageDimensions,
  PositionOnTile,
  RectangularTileLayout,
  TileOutputTextures,
} from "./map-tiling/tile-types";
import { getTiledAreaForMap, TiledArea } from "./map-tiling/tiled-area";
import type { ScreenRect } from "./webgl/dimension-types";
import type { ShapeData } from "./webgl/shape-types";
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

const cachedTopCount = 500;
const meshPointSpacing = 50;

export class ProximityTerrainData {
  private readonly longitudeLines: TerrainLongitudeLine[];

  private readonly mapTiledArea: TiledArea;
  private readonly tileToColorTextureRect = new Map<EarthResourceTile, ScreenRect>();

  private readonly cachedTopLocations: TerrainLocation[];

  constructor(
    private readonly gl: WebGL2RenderingContext,
    public readonly rectangularTileLayout: RectangularTileLayout,
    public readonly dataTextureDimensions: ImageDimensions,
    public readonly colorTexture: ReadableTexture,
    public readonly colorTextureTiledArea: TiledArea,
    private readonly tileOutputTextures: Map<EarthResourceTile, TileOutputTextures>
  ) {
    tileOutputTextures.forEach((_textures, tile) => {
      const colorTextureRect = colorTextureTiledArea.getTargetRect(tile);
      this.tileToColorTextureRect.set(tile, colorTextureRect);
    });

    this.longitudeLines = getLongitudeLines(gl, rectangularTileLayout.groupedOrderedTiles, this.tileOutputTextures);

    this.mapTiledArea = getTiledAreaForMap(dataTextureDimensions, rectangularTileLayout);

    this.cachedTopLocations = this.calculateTopClosestPoints(cachedTopCount);
  }

  public getTextures(tile: EarthResourceTile): TileOutputTextures {
    const textures = this.tileOutputTextures.get(tile);
    if (!textures) {
      throw new Error(`Textures not found for tile ${tile.filenameBase}`);
    }

    return textures;
  }

  public getTopClosestPoints(topCount: number): TerrainLocation[] {
    if (topCount > cachedTopCount) {
      throw new Error(`Only ${cachedTopCount} closest points are stored.`);
    }

    return this.cachedTopLocations.slice(0, topCount);
  }

  public createShapeData(): ShapeData {
    // Create the shape data from a subset of the height map data for mesh generation.
    const linesForMesh = this.getLinesForMesh();
    const textureTiledArea = this.colorTextureTiledArea;
    const mapTiledArea = this.mapTiledArea;
    const targetDimensions = textureTiledArea.targetDimensions;

    return createTerrainShapeData(linesForMesh, getPositions);

    function getPositions(tile: EarthResourceTile, tileX: number, tileY: number) {
      const [x, y] = mapTiledArea.getTargetPosition(tile, [tileX, tileY]);
      const [texX, texY] = textureTiledArea.getTargetPosition(tile, [tileX, tileY]);
      const [u, v] = [texX / targetDimensions.width, texY / targetDimensions.height];

      return {
        xy: [x, y] as Vector2,
        uv: [u, v] as Vector2,
      };
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

  public getTilePositionFromMap(mapPosition: Vector2): PositionOnTile {
    return this.mapTiledArea.getPositionOnTile(mapPosition);
  }

  public getLatLong(position: PositionOnTile): { long: number; lat: number } {
    const [tileX, tileY] = position.position;
    const long = position.tile.startLon + (tileX / elevationTileDimensions.width) * longitudeRadiansPerTile;
    const lat = position.tile.startLat + (tileY / elevationTileDimensions.height) * latitudeRadiansPerTile;
    return { long, lat };
  }

  public getElevation(position: PositionOnTile): number {
    const texture = this.getTextures(position.tile).elevations;

    const [xOffset, yOffset] = position.position;
    const rect: ScreenRect = { xOffset, yOffset, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return (bufferInfo.buffer[0] / 255) * elevationScaleFactor;
  }

  public getDistanceAboveMin(position: PositionOnTile): number {
    const texture = this.getTextures(position.tile).distancesAboveMin;

    const [xOffset, yOffset] = position.position;
    const rect: ScreenRect = { xOffset, yOffset, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return bufferInfo.buffer[0];
  }

  public getUnixSeconds(position: PositionOnTile): number {
    const texture = this.getTextures(position.tile).unixSeconds;

    const [xOffset, yOffset] = position.position;
    const rect: ScreenRect = { xOffset, yOffset, width: 1, height: 1 };

    const bufferInfo = readTexture(this.gl, texture, rect);

    return bufferInfo.buffer[0];
  }

  public clean() {
    this.gl.deleteTexture(this.colorTexture.texture);
    this.tileOutputTextures.forEach((textures) => {
      this.gl.deleteTexture(textures.proximities.texture);
      this.gl.deleteTexture(textures.elevations.texture);
      this.gl.deleteTexture(textures.distancesAboveMin.texture);
      this.gl.deleteTexture(textures.unixSeconds.texture);
    });
  }
}

function getLongitudeLines(
  gl: WebGL2RenderingContext,
  groupedOrderedTiles: EarthResourceTile[][],
  tileProximityTextures: Map<EarthResourceTile, TileOutputTextures>
): TerrainLongitudeLine[] {
  const lines: TerrainLongitudeLine[] = [];

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
      const proximityTexture = tileProximityTextures.get(tile)!.proximities;
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
