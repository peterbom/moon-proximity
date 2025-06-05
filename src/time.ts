const secondsPerDay = 86400;
const unixEpochInJulianDays = 2440587.5; // Julian days until 1970-01-01T00:00:00Z
const j2000InJulianDays = 2451545; // TODO: Account for j2000 epoch starting at 11:58:55.816 ?

export type AstronomicalTime = {
  date: Date;
  unixSeconds: number;
  unixDays: number;
  julianDays: number;
  j2000Days: number;
};

export function getAstronomicalTime(date: Date): AstronomicalTime {
  const unixSeconds = date.getTime() / 1000;
  const unixDays = unixSeconds / secondsPerDay;
  const julianDays = unixEpochInJulianDays + unixDays;
  const j2000Days = julianDays - j2000InJulianDays;
  return { date, unixSeconds, unixDays, julianDays, j2000Days };
}

export function julianDaysToDate(julianDays: number): Date {
  const unixDays = julianDays - unixEpochInJulianDays;
  const unixSeconds = unixDays * secondsPerDay;
  return new Date(unixSeconds * 1000);
}

export function incrementTime(time: AstronomicalTime, amountSeconds: number): AstronomicalTime {
  const amountDays = amountSeconds / secondsPerDay;
  return {
    date: new Date(time.date.getTime() + amountSeconds * 1000),
    unixSeconds: time.unixSeconds + amountSeconds,
    unixDays: time.unixDays + amountDays,
    julianDays: time.julianDays + amountDays,
    j2000Days: time.j2000Days + amountDays,
  };
}
