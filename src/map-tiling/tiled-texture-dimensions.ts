import { makeScale } from "../common/math";
import type { EarthResourceTile, ImageDimensions, RectangularTileLayout, TileToTextureScale } from "./tile-types";

export class TiledTextureDimensions {
  public readonly targetTextureDimensions: ImageDimensions;
  private readonly targetTileDimensions: ImageDimensions;

  constructor(
    gl: WebGL2RenderingContext,
    private readonly tileDimensions: ImageDimensions,
    private readonly tileLayout: RectangularTileLayout
  ) {
    const maxTextureWidth = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), 4096);

    // We'll be creating a texture in which each tile is lined up horizontally.
    // Use as much width as we can to keep within the limit.
    const targetTextureWidth = Math.floor(maxTextureWidth / tileDimensions.width) * tileDimensions.width;
    const targetTextureHeight = tileDimensions.height;

    this.targetTextureDimensions = {
      width: targetTextureWidth,
      height: targetTextureHeight,
    };

    const horizontalTileCount = tileLayout.startLongitudes.length;
    const verticalTileCount = tileLayout.startLatitudes.length;
    const targetTileWidth = targetTextureWidth / horizontalTileCount;
    const targetTileHeight = targetTextureHeight / verticalTileCount;

    this.targetTileDimensions = {
      width: targetTileWidth,
      height: targetTileHeight,
    };
  }

  public getTileToTextureScale(tile: EarthResourceTile): TileToTextureScale {
    const tileXIndex = this.tileLayout.startLongitudes.indexOf(tile.startLon);
    const tileYIndex = this.tileLayout.startLatitudes.indexOf(tile.startLat);

    // TODO: Flip Y index?
    const xOffset = tileXIndex * this.targetTextureDimensions.width;
    const yOffset = tileYIndex * this.targetTextureDimensions.height;

    return {
      scaleX: makeScale([0, this.tileDimensions.width], [xOffset, xOffset + this.targetTileDimensions.width]),
      scaleY: makeScale([0, this.tileDimensions.height], [yOffset, yOffset + this.targetTileDimensions.height]),
    };
  }
}
