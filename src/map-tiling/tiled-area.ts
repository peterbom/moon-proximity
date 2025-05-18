import type { Vector2 } from "../common/numeric-types";
import type { ScreenRect } from "../webgl/dimension-types";
import { latitudeRadiansPerTile, longitudeRadiansPerTile } from "./earth-resource-tiles";
import type { EarthResourceTile, ImageDimensions, PositionOnTile, RectangularTileLayout } from "./tile-types";

export class TiledArea {
  private readonly targetTileDimensions: ImageDimensions;
  private readonly tileToPosition = new Map<EarthResourceTile, Vector2>();

  constructor(
    public readonly targetDimensions: ImageDimensions,
    public readonly tileDimensions: ImageDimensions,
    public readonly tileLayout: RectangularTileLayout
  ) {
    const horizontalTileCount = tileLayout.startLongitudes.length;
    const verticalTileCount = tileLayout.startLatitudes.length;
    const targetTileWidth = targetDimensions.width / horizontalTileCount;
    const targetTileHeight = targetDimensions.height / verticalTileCount;

    this.targetTileDimensions = {
      width: targetTileWidth,
      height: targetTileHeight,
    };

    for (let x = 0; x < tileLayout.startLongitudes.length; x++) {
      const lon = tileLayout.startLongitudes[x];
      const tilesForX = tileLayout.groupedOrderedTiles[x];
      for (let y = 0; y < tileLayout.startLatitudes.length; y++) {
        const lat = tileLayout.startLatitudes[y];
        const tile = tilesForX.find((tile) => tile.startLat === lat);
        if (tile) {
          if (tile.startLon !== lon) {
            throw new Error(`Expected tile to have start longitude ${lon}. Actual: ${tile.startLon}`);
          }

          this.tileToPosition.set(tile, [x, y]);
        }
      }
    }
  }

  public getTargetRect(tile: EarthResourceTile): ScreenRect {
    const [xOffset, yOffset] = this.getTargetPosition({ tile, position: [0, 0] });
    const { width, height } = this.targetTileDimensions;

    return { xOffset, yOffset, width, height };
  }

  public getTargetPosition(positionOnTile: PositionOnTile): Vector2 {
    const tilePosition = this.tileToPosition.get(positionOnTile.tile);
    if (!tilePosition) {
      throw new Error(`Tile ${positionOnTile.tile.filenameBase} not recognized`);
    }

    const [tileX, tileY] = tilePosition;
    const tileDimensions = this.tileDimensions;
    const targetTileDimensions = this.targetTileDimensions;
    const [x, y] = positionOnTile.position;
    return [
      (tileX + x / tileDimensions.width) * targetTileDimensions.width,
      (tileY + y / tileDimensions.height) * targetTileDimensions.height,
    ];
  }

  public getPositionOnTile(targetPosition: Vector2): PositionOnTile {
    const [x, y] = targetPosition;
    const tileCountX = this.tileLayout.startLongitudes.length;
    const tileCountY = this.tileLayout.startLatitudes.length;

    const lonIndex = Math.floor(tileCountX * (x / this.targetDimensions.width));
    const latIndex = Math.floor(tileCountY * (y / this.targetDimensions.height));
    const lonRemainder = x - lonIndex * this.targetTileDimensions.width;
    const latRemainder = y - latIndex * this.targetTileDimensions.height;

    const startLon = this.tileLayout.startLongitudes[lonIndex];
    const startLat = this.tileLayout.startLatitudes[latIndex];
    const tilesForLon = this.tileLayout.groupedOrderedTiles[lonIndex];
    const tile = tilesForLon.find((tile) => tile.startLat === startLat);
    if (!tile) {
      throw new Error(`No tile found for startLon ${startLon} and startLat ${startLat}`);
    }

    const tileX = (lonRemainder / this.targetTileDimensions.width) * this.tileDimensions.width;
    const tileY = (latRemainder / this.targetTileDimensions.height) * this.tileDimensions.height;

    return {
      tile,
      position: [tileX, tileY],
    };
  }
}

export function getTiledAreaForTexture(
  gl: WebGL2RenderingContext,
  tileDimensions: ImageDimensions,
  tileLayout: RectangularTileLayout
): TiledArea {
  // We'll be creating a texture in which each tile is lined up horizontally.
  // Use as much width as we can to keep within the limit.
  const targetTextureWidth = Math.min(
    gl.getParameter(gl.MAX_TEXTURE_SIZE),
    tileLayout.startLongitudes.length * tileDimensions.width
  );

  const [width, height] = [targetTextureWidth, tileDimensions.height];

  return new TiledArea({ width, height }, tileDimensions, tileLayout);
}

export function getTiledAreaForMap(tileDimensions: ImageDimensions, tileLayout: RectangularTileLayout): TiledArea {
  const width = (tileLayout.startLongitudes.length + 1) * longitudeRadiansPerTile;
  const height = -(tileLayout.startLatitudes.length + 1) * latitudeRadiansPerTile;

  return new TiledArea({ width, height }, tileDimensions, tileLayout);
}
