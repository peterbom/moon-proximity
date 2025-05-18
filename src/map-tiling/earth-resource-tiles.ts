import { orderPreservingGroupBy, seq } from "../common/iteration";
import type { Vector2 } from "../common/numeric-types";
import { TextureDefinition } from "../webgl/texture-definition";
import { createDownloadingTexture } from "../webgl/texture-utils";
import type { EarthResourceTile, ImageDimensions, RectangularTileLayout, TileSelectionData } from "./tile-types";

const horizontalTileCount = 32;
const verticalTileCount = 16;
const tileCount = horizontalTileCount * verticalTileCount;

const colorFileOriginalDimensions: ImageDimensions = {
  width: 21600,
  height: 10800,
};

const elevationFileOriginalDimensions: ImageDimensions = {
  width: 21600,
  height: 10800,
};

export const colorTileDimensions = getTileDimensions(colorFileOriginalDimensions);
export const elevationTileDimensions = getTileDimensions(elevationFileOriginalDimensions);

export const longitudeRadiansPerTile = (2 * Math.PI) / horizontalTileCount;
export const latitudeRadiansPerTile = Math.PI / verticalTileCount;

const allEarthResourceTiles = seq(tileCount).map<EarthResourceTile>((index) => {
  const columnIndex = Math.floor(index / verticalTileCount);
  const rowIndex = index % verticalTileCount;
  return {
    index,
    startLon: -Math.PI + columnIndex * longitudeRadiansPerTile,
    startLat: Math.PI / 2 - rowIndex * latitudeRadiansPerTile,
    filenameBase: `image${columnIndex + 1}x${rowIndex + 1}`,
  };
});

export function getEarthResourceTile(geodeticCoords: Vector2): EarthResourceTile {
  const [lon, lat] = geodeticCoords;
  const columnIndex = Math.floor((lon + Math.PI) / longitudeRadiansPerTile);
  const rowIndex = Math.floor((Math.PI / 2 - lat) / latitudeRadiansPerTile);
  const index = columnIndex * verticalTileCount + rowIndex;
  return allEarthResourceTiles[index];
}

/**
 * Gets the tiles needed to cover the supplied selection data. Results are:
 * 1. Grouped West to East
 * 2. Ordered North to South
 */
export function getGroupedOrderedTiles(
  selectionData: TileSelectionData,
  distanceAboveMinCutoff: number
): EarthResourceTile[][] {
  const tiles = new Map<number, { tile: EarthResourceTile; time: number }>();
  selectionData.distancesAboveMin.forEach((distanceAboveMin, i) => {
    if (distanceAboveMin < distanceAboveMinCutoff) {
      const coords = selectionData.geodeticCoords[i];
      const time = selectionData.unixSeconds[i];
      const tile = getEarthResourceTile(coords);
      if (!tiles.has(tile.index)) {
        tiles.set(tile.index, { tile, time });
      }
    }
  });

  // Sorting West to East cannot be done by looking at coordinates (lat/long), because the data
  // might span -180/+180 degrees longitude, meaning that 179 degrees is West of (before) -179 degrees.
  // Instead we can sort by descending time. As the Earth spins, locations to the East will experience
  // maximal proximity to the moon *before* locations to the West.
  const westToEastTiles = [...tiles.values()].sort((a, b) => b.time - a.time).map((x) => x.tile);

  // North/South ordering is still indeterminate. Keep the West->East ordering but group by longitude
  // and sort each group by descending latitude.
  const westToEastTileGroups = orderPreservingGroupBy(westToEastTiles, (t) => t.startLon);
  westToEastTileGroups.forEach((group) => group.sort((a, b) => b.startLat - a.startLat));

  return westToEastTileGroups;
}

export function getRectangularTileLayout(groupedOrderedTiles: EarthResourceTile[][]): RectangularTileLayout {
  const startLongitudes = groupedOrderedTiles.map((g) => g[0].startLon);
  const startLatitudeSet = new Set<number>(groupedOrderedTiles.flat().map((tile) => tile.startLat));
  const startLatitudes = [...startLatitudeSet.values()].sort((a, b) => b - a); // sort descending

  return {
    groupedOrderedTiles,
    startLatitudes,
    startLongitudes,
  };
}

export class ImageElementTileDownloader {
  constructor(
    private readonly folderPath: string,
    private readonly extension: string,
    private readonly textureDefinition: TextureDefinition
  ) {}

  public async download(
    gl: WebGL2RenderingContext,
    tiles: EarthResourceTile[],
    itemDownloaded: (
      tile: EarthResourceTile,
      texture: WebGLTexture,
      textureDefinition: TextureDefinition
    ) => void = () => {}
  ): Promise<void> {
    const self = this;

    const promises = tiles.map(async (tile) => {
      const imageSrc = `${self.folderPath}${tile.filenameBase}.${self.extension}`;
      await new Promise<void>((resolve) => {
        createDownloadingTexture(gl, imageSrc, self.textureDefinition, [0, 0, 0, 0], (texture) => {
          itemDownloaded(tile, texture, self.textureDefinition);
          resolve();
        });
      });
    });

    await Promise.all(promises);
  }
}

function getTileDimensions(imageDimensions: ImageDimensions): ImageDimensions {
  return {
    width: imageDimensions.width / horizontalTileCount,
    height: imageDimensions.height / verticalTileCount,
  };
}
