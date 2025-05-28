import path from "path";
import fs from "fs/promises";
import { SectionMap, SeriesCopyMetadata, SeriesSection, SourceBlock } from "./ephem-gen-types";
import { testDestEphemeris } from "./ephem-test";
import { Ephemeris, MetadataMap, SeriesMetadata, SeriesType } from "../src/ephemeris";
import { JPLDE } from "./jplde";
import { testAll } from "./jplde-test";

const srcEphemerisPath = path.join(process.cwd(), "src/resources/linux_p1550p2650.440");
const destEphemerisPath = path.join(process.cwd(), "src/resources/ephemeris.dat");

const ncoeff = 1018; // From header NCOEFF
const blockByteCount = ncoeff * 8;
const headerByteCount = blockByteCount * 2;

/*
see https://www.celestialprogramming.com/jpl-ephemeris-format/jpl-ephemeris-format.html
From header GROUP 1030
---
  2287184.50  2688976.50         32.
---
*/

const srcStartJulianDate = 2287184.5;
const srcDaysPerBlock = 32;

/*
From header GROUP 1050

     0     1     2     3     4     5     6     7     8     9    10    11    12    13    14
  Merc   Ven   EMB  Mars   Jup   Sat    Ur   Nep   Plu  Moon   Sun   Nut   LML  LMAV TT-TDB
   xyz   xyz   xyz   xyz   xyz   xyz   xyz   xyz   xyz   xyz   xyz   p/e ph/t/ps o-xyz   s
---
     3   171   231   309   342   366   387   405   423   441   753   819   899  1019  1019    # Start offset in block
    14    10    13    11     8     7     6     6     6    13    11    10    10     0     0    # Coeff count per property
     4     2     2     1     1     1     1     1     1     8     2     4     4     0     0    # Subinterval count
---
*/

const metadataItems: SeriesCopyMetadata[] = [
  {
    seriesType: SeriesType.SsbToEmb,
    seriesIndex: 2,
    propCount: 3, // x,y,z
    blockStartOffset: 231,
    srcCoeffCount: 13,
    destCoeffCount: 13,
    subintervalDuration: srcDaysPerBlock / 2,
  },
  {
    seriesType: SeriesType.EarthToMoon,
    seriesIndex: 9,
    propCount: 3, // x,y,z
    blockStartOffset: 441,
    srcCoeffCount: 13,
    destCoeffCount: 13,
    subintervalDuration: srcDaysPerBlock / 8,
  },
  {
    seriesType: SeriesType.SsbToSun,
    seriesIndex: 10,
    propCount: 3, // x,y,z
    blockStartOffset: 753,
    srcCoeffCount: 11,
    destCoeffCount: 4,
    subintervalDuration: srcDaysPerBlock / 2,
  },
  // {
  //   seriesType: SeriesType.Nutation,
  //   seriesIndex: 11,
  //   propCount: 2, // psi,epsilon
  //   blockStartOffset: 819,
  //   srcCoeffCount: 10,
  //   destCoeffCount: 10,
  //   subintervalDuration: srcDaysPerBlock / 4,
  // },
];

const includeStartDate = toJulianDate(new Date("2000-01-01T00:00:00Z"));
const includeEndDate = toJulianDate(new Date("2099-12-31T00:00:00Z"));

const readFirstBlock = getSourceBlock(includeStartDate);
const readLastBlock = getSourceBlock(includeEndDate);
const readBlockCount = readLastBlock.index - readFirstBlock.index + 1;
const destDuration = readLastBlock.startJulianDate - readFirstBlock.startJulianDate + srcDaysPerBlock;

(async function () {
  // Load and run all tests on the source ephemeris to validate the data we'll be copying.
  const jplde = await readSourceEphemeris();
  testAll(jplde);

  // Calculate the section sizes for each data series.
  const sectionMap = buildSectionMap();

  // Copy selected data to destination ephemeris data file.
  await buildDestEphemeris(jplde.data, sectionMap);

  // Load and test the newly built ephemeris.
  const ephem = await loadDestEphemeris(sectionMap);
  testDestEphemeris(ephem);

  // Log the parameters needed to create the new ephemeris.
  const metadataMap = createMetadataMap(sectionMap);
  metadataMap.forEach((metadata) => {
    console.log(`${SeriesType[metadata.seriesType]}: ${JSON.stringify(metadata, null, 2)}`);
  });

  const destStartDate = readFirstBlock.startJulianDate;
  console.log(`Start date: ${destStartDate} (${toJSDate(destStartDate).toISOString()})`);
})();

function buildSectionMap(): SectionMap {
  const sectionMap = new Map<SeriesType, SeriesSection>();
  let offset = 0;
  metadataItems.forEach((metadata) => {
    const sizeInBytes = getDestSeriesSizeInBytes(metadata);
    sectionMap.set(metadata.seriesType, { offset, sizeInBytes });
    offset += sizeInBytes;
  });

  return sectionMap;
}

function createMetadataMap(sectionMap: SectionMap): MetadataMap {
  const metadataMap = new Map<SeriesType, SeriesMetadata>();
  metadataItems.forEach((metadata) => {
    const section = sectionMap.get(metadata.seriesType)!;
    metadataMap.set(metadata.seriesType, {
      seriesType: metadata.seriesType,
      intervalDurationDays: metadata.subintervalDuration,
      propertyCount: metadata.propCount,
      coeffCount: metadata.destCoeffCount,
      offset: section.offset,
      sizeInBytes: section.sizeInBytes,
    });
  });

  return metadataMap;
}

async function readSourceEphemeris() {
  const srcBuffer = await fs.readFile(srcEphemerisPath);
  const srcDataView = new DataView(srcBuffer.buffer);
  return new JPLDE(srcDataView);
}

async function loadDestEphemeris(sectionMap: SectionMap): Promise<Ephemeris> {
  const buffer = await fs.readFile(destEphemerisPath);
  const dataView = new DataView(buffer.buffer);
  return new Ephemeris(dataView, createMetadataMap(sectionMap), readFirstBlock.startJulianDate);
}

async function buildDestEphemeris(srcDataView: DataView, sectionMap: SectionMap) {
  const destFileSize = [...sectionMap.values()].reduce((len, curr) => Math.max(len, curr.offset + curr.sizeInBytes), 0);
  const destBuffer = new ArrayBuffer(destFileSize);
  const destDataView = new DataView(destBuffer);

  for (const metadata of metadataItems) {
    const section = sectionMap.get(metadata.seriesType)!;
    for (let blockIndex = 0; blockIndex < readBlockCount; blockIndex++) {
      copyBlock(metadata, section, srcDataView, destDataView, blockIndex);
    }
  }

  await fs.writeFile(destEphemerisPath, destDataView, "binary");
}

function getDestSeriesSizeInBytes(metadata: SeriesCopyMetadata): number {
  const intervalByteCount = getSubintervalSizeInBytes(metadata.destCoeffCount, metadata.propCount);
  const intervalCount = Math.floor(destDuration / metadata.subintervalDuration);
  return intervalByteCount * intervalCount;
}

function copyBlock(
  metadata: SeriesCopyMetadata,
  section: SeriesSection,
  srcDataView: DataView,
  destDataView: DataView,
  blockIndex: number
) {
  const subintervalCount = srcDaysPerBlock / metadata.subintervalDuration;

  const srcBlockIndex = readFirstBlock.index + blockIndex;
  const srcBlockStartOffset = headerByteCount + srcBlockIndex * blockByteCount;
  const srcBodyStartOffset = srcBlockStartOffset + (metadata.blockStartOffset - 1) * 8;
  const srcIntervalSize = getSubintervalSizeInBytes(metadata.srcCoeffCount, metadata.propCount);
  const srcPropertySize = metadata.srcCoeffCount * 8;

  const destIntervalSize = getSubintervalSizeInBytes(metadata.destCoeffCount, metadata.propCount);
  const destBlockStartOffset = section.offset + blockIndex * subintervalCount * destIntervalSize;
  const destPropertySize = metadata.destCoeffCount * 8;

  for (let intervalIndex = 0; intervalIndex < subintervalCount; intervalIndex++) {
    const srcIntervalStartOffset = srcBodyStartOffset + intervalIndex * srcIntervalSize;
    const destIntervalStartOffset = destBlockStartOffset + intervalIndex * destIntervalSize;

    // Each interval contains coefficients for 1st property; then coefficients for 2nd property; etc.
    for (let propertyIndex = 0; propertyIndex < metadata.propCount; propertyIndex++) {
      const srcOffset = srcIntervalStartOffset + propertyIndex * srcPropertySize;
      const destOffset = destIntervalStartOffset + propertyIndex * destPropertySize;
      if (destOffset % 8 !== 0 || srcOffset % 8 !== 0) {
        console.log("wrong");
      }
      copyFloat64s(srcDataView, destDataView, srcOffset, destOffset, metadata.destCoeffCount);
    }
  }
}

function getSubintervalSizeInBytes(coeffCount: number, propCount: number) {
  const valueCount = coeffCount * propCount;
  return 8 * valueCount; // 64-bit coefficients
}

function toJSDate(julianDate: number): Date {
  const unixDays = julianDate - 2440587.5;
  const unixSeconds = unixDays * 86400;
  return new Date(unixSeconds * 1000);
}

function toJulianDate(date: Date): number {
  const unixSeconds = date.getTime() / 1000;
  const unixDays = unixSeconds / 86400;
  return 2440587.5 + unixDays;
}

function getSourceBlock(julianDate: number): SourceBlock {
  const jdOffset = julianDate - srcStartJulianDate;
  const index = Math.floor(jdOffset / srcDaysPerBlock);
  const startJulianDate = srcStartJulianDate + index * srcDaysPerBlock;
  return { index, startJulianDate };
}

function copyFloat64s(
  srcDataView: DataView,
  destDataView: DataView,
  srcStartOffset: number,
  destStartOffset: number,
  count: number
) {
  for (let i = 0; i < count; i++) {
    const srcOffset = srcStartOffset + i * 8;
    const destOffset = destStartOffset + i * 8;
    const value = srcDataView.getFloat64(srcOffset, true);
    destDataView.setFloat64(destOffset, value, true);
  }
}
