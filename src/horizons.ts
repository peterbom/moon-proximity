import { maxByProperty } from "./common/iteration";
import { getAstronomicalTime, julianDaysToDate } from "./time";

export type HorizonsParams = {
  date: Date;
  timeWindowSeconds: number;
  sampleCount: number;
  longitudeDegrees: number;
  latitudeDegrees: number;
  altitudeInM: number;
};

export type HorizonsResultRecord = {
  date: Date;
  range: number;
  rangeRate: number;
};

export async function getMinimumRangeFromHorizons(options: HorizonsParams): Promise<HorizonsResultRecord | null> {
  const plusMinusSeconds = options.timeWindowSeconds / 2;
  const oneSecondInDays = 1 / (24 * 60 * 60);
  const plusMinusDays = plusMinusSeconds * oneSecondInDays;
  const time = getAstronomicalTime(options.date);
  const startTime = time.julianDays - plusMinusDays;
  const stopTime = time.julianDays + plusMinusDays;

  const params = new URLSearchParams();
  params.append("format", "json");
  params.append("COMMAND", "'301'");
  params.append("CENTER", "'coord@399'");
  params.append("OBJ_DATA", "'NO'");
  params.append("MAKE_EPHEM", "'YES'");
  params.append("EPHEM_TYPE", "'VECTORS'");
  params.append("START_TIME", `'JD ${startTime.toString()}'`);
  params.append("STOP_TIME", `'JD ${stopTime.toString()}'`);
  params.append(
    "SITE_COORD",
    `'${options.longitudeDegrees.toFixed(4)},${options.latitudeDegrees.toFixed(4)},${(
      options.altitudeInM / 1000
    ).toFixed()}'`
  );
  params.append("STEP_SIZE", "'128'");
  params.append("TIME_DIGITS", "'SECONDS'");

  const uri = `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;
  const request = new Request(`https://corsproxy.io/?url=${encodeURIComponent(uri)}`);

  const response = await fetch(request);
  if (!response.ok) {
    throw new Error(`Response status: ${response.status}`);
  }

  const responseData = await response.json();
  const records = parseResponse(responseData);

  return getMinimumRangeRecord(records);
}

function parseResponse(responseData: any): HorizonsResultRecord[] {
  const responseText: string = responseData.result;

  // https://ssd.jpl.nasa.gov/horizons/manual.html#output
  const vectorContent = responseText.match(/\$\$SOE(.*?)\$\$EOE/s); // "start of ephemeris", "end of ephemeris"
  if (vectorContent === null) {
    throw new Error("Unexpected output: ephemeris start/end tags not found");
  }

  // Each record is a group of 4 lines
  const lines = vectorContent[1].trim().split("\n");
  const records = lines.reduce<string[][]>((groups, line, i) => {
    if (i % 4 === 0) {
      groups.push([line]);
    } else {
      groups[groups.length - 1].push(line);
    }

    return groups;
  }, []);

  return records.map(createHorizonRecord);
}

function createHorizonRecord(lines: string[]): HorizonsResultRecord {
  // 2464292.375509259 = A.D. 2034-Nov-25 21:00:44.0000 TDB
  const timeLine = lines[0];
  const timeMatch = timeLine.match(/^\d+\.?\d*/);
  if (timeMatch === null) {
    throw new Error(`Line does not start with Julian date. Line: ${timeLine}`);
  }

  const julianDate = parseFloat(timeMatch[0]);
  const date = julianDaysToDate(julianDate);

  //  LT= 1.167733156222665E+00 RG= 3.500775931920906E+05 RR=-2.304642686552487E-02
  const rangeLine = lines[3];
  const rangeMatch = rangeLine.match(/RG\s*=\s*(\d+\.?\d+E[\+\-]\d\d)/);
  if (rangeMatch === null) {
    throw new Error(`Line does not contain range (RG) value. Line: ${rangeLine}`);
  }

  const range = parseFloat(rangeMatch[1]); // The captured group, not the entire match.

  const rangeRateMatch = rangeLine.match(/RR\s*=\s*(\-?\d+\.?\d+E[\+\-]\d\d)/);
  if (rangeRateMatch === null) {
    throw new Error(`Line does not contain range (RG) value. Line: ${rangeLine}`);
  }

  const rangeRate = parseFloat(rangeRateMatch[1]); // The captured group, not the entire match.
  return {
    date,
    range,
    rangeRate,
  };
}

function getMinimumRangeRecord(records: HorizonsResultRecord[]): HorizonsResultRecord | null {
  if (records.length === 0) {
    return null;
  }

  let prevRecord = records[0];
  if (prevRecord.rangeRate > 0) {
    // We're at the start of the data and the range is already increasing: no minimum here.
    return null;
  }

  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    if (record.rangeRate < 0) {
      prevRecord = record;
    } else {
      // We've reached or passed the minimum. Choose either this record or the previous.
      return maxByProperty([prevRecord, record], (r) => -r.range).item;
    }
  }

  // We've reached the end of the data and the range hasn't started increasing. No minimum here.
  return null;
}
