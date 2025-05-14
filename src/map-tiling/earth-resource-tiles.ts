import { seq, splitByProperty } from "../common/iteration";
import type { Vector2 } from "../common/numeric-types";
import { TextureDefinition } from "../webgl/texture-definition";
import { createDownloadingTexture } from "../webgl/texture-utils";
import type { EarthResourceTile, ImageDimensions } from "./tile-types";

const horizontalTileCount = 32;
const verticalTileCount = 16;
const tileCount = horizontalTileCount * verticalTileCount;

export const colorFileOriginalDimensions: ImageDimensions = {
  width: 21600,
  height: 10800,
};

export const elevationFileOriginalDimensions: ImageDimensions = {
  width: 21600,
  height: 10800,
};

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

export class ImageElementTileDownloader {
  private readonly downloadedFiles = new Map<number, WebGLTexture>();
  protected readonly tileDimensions: ImageDimensions;

  constructor(
    private readonly folderPath: string,
    private readonly extension: string,
    private readonly textureDefinition: TextureDefinition,
    originalImageDimensions: ImageDimensions
  ) {
    this.tileDimensions = getTileDimensions(originalImageDimensions);
  }

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
    const { matching: downloaded, notMatching: notDownloaded } = splitByProperty(tiles, (t) =>
      self.downloadedFiles.has(t.index)
    );

    downloaded.forEach((tile) => {
      const texture = self.downloadedFiles.get(tile.index)!;
      itemDownloaded(tile, texture, self.textureDefinition);
    });

    const promises = notDownloaded.map(async (tile) => {
      const imageSrc = `${self.folderPath}${tile.filenameBase}.${self.extension}`;
      await new Promise<void>((resolve) => {
        createDownloadingTexture(gl, imageSrc, self.textureDefinition, [0, 0, 0, 0], (texture) => {
          self.downloadedFiles.set(tile.index, texture);
          itemDownloaded(tile, texture, self.textureDefinition);
          resolve();
        });
      });
    });

    await Promise.all(promises);
  }
}

export function getTileDimensions(imageDimensions: ImageDimensions): ImageDimensions {
  return {
    width: imageDimensions.width / horizontalTileCount,
    height: imageDimensions.height / verticalTileCount,
  };
}
