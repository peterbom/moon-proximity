import { maxByProperty } from "./common/iteration";
import type { Vector2 } from "./common/numeric-types";
import { highlightClosestKmCount } from "./constants";
import { createTerrainShapeData, TerrainShapeData } from "./geo-shape-data";
import {
  elevationFileOriginalDimensions,
  getTileDimensions,
  latitudeRadiansPerTile,
  longitudeRadiansPerTile,
} from "./map-tiling/earth-resource-tiles";
import type { EarthResourceTile, StructuredTileProcessors, TileProximityValues } from "./map-tiling/tile-types";

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
  private readonly longitudeLines: TerrainLongitudeLine[];
  private readonly cachedTopLocations: TerrainLocation[];

  constructor(private readonly structuredTileProcessors: StructuredTileProcessors) {
    this.longitudeLines = getLongitudeLines(structuredTileProcessors);
    this.cachedTopLocations = this.calculateTopClosestPoints(cachedTopCount);
  }

  public getTopClosestPoints(topCount: number): TerrainLocation[] {
    if (topCount > cachedTopCount) {
      throw new Error(`Only ${cachedTopCount} closest points are stored.`);
    }

    return this.cachedTopLocations.slice(0, topCount);
  }

  public createShapeData(): TerrainShapeData {
    const orderedTiles = this.structuredTileProcessors.orderedTiles;
    const processorLookup = this.structuredTileProcessors.tileProcessorLookup;

    // Create the shape data from a subset of the height map data for mesh generation.
    const linesForMesh = this.getLinesForMesh();
    return createTerrainShapeData(linesForMesh, (t) => orderedTiles.indexOf(t), getTexCoords);

    function getTexCoords(tile: EarthResourceTile, tileX: number, tileY: number): Vector2 {
      const processors = processorLookup.get(tile);
      if (!processors) {
        throw new Error(`Unable to find texture processor for tile ${tile.index} (${tile.filenameBase})`);
      }

      return processors.color.getTextureCoords(tileX, tileY);
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
}

function getLongitudeLines(structuredTileProcessors: StructuredTileProcessors): TerrainLongitudeLine[] {
  const lines: TerrainLongitudeLine[] = [];

  const elevationTileDimensions = getTileDimensions(elevationFileOriginalDimensions);
  const latitudeRadiansPerPixel = latitudeRadiansPerTile / elevationTileDimensions.height;
  const longitudeRadiansPerPixel = longitudeRadiansPerTile / elevationTileDimensions.width;

  // Divide into strips of equal longitude, West to East
  for (const longitudeProcessors of structuredTileProcessors.longitudeTileProcessors) {
    // Get all the proximity values for all the tiles at this longitude.
    const valuesForLongitude: SourceLongitudeValues[] = longitudeProcessors.singleTileProcessors.map((p) => ({
      values: p.elevation.getProximityValues(),
      tile: p.tile,
    }));

    for (let x = 0; x < elevationTileDimensions.width; x++) {
      // Create a column of values by combining the x'th column from each of the tiles at this
      // longitude in order (downwards / South / descending latitude).
      const startLatitude = longitudeProcessors.singleTileProcessors[0].tile.startLat;
      const points = [...makeColumnIterator(valuesForLongitude, startLatitude, latitudeRadiansPerPixel, x)];
      const longitude = longitudeProcessors.startLon + longitudeRadiansPerPixel * x;
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
    for (let y = 0; y < tileValues.values.height; y++) {
      const index = y * tileValues.values.width + x;
      const value = tileValues.values.data[index];
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
  values: TileProximityValues;
};
