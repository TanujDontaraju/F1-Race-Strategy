import { Driver } from "@/lib/telemetry/types";

export interface Portrait {
  src: string;
  width: number;
  height: number;
  /** Full-length season portrait that needs cropping to head and shoulders. */
  fullBody: boolean;
}

// formula1.com publishes a full-length portrait for every driver + team pairing
// each season (a mid-season move gets its own kit), and 404s when one doesn't
// exist. OpenF1's headshot_url lags behind in last year's kit and is missing
// for some drivers, so it's only the fallback.
const SEASON_PORTRAIT_BASE =
  "https://media.formula1.com/image/upload/c_lfill,w_440/q_auto/v1740000001/common/f1";

/** F1's driver id, e.g. "lannor01"; embedded in OpenF1's headshot URL when present. */
function f1DriverId(driver: Driver): string {
  const fromHeadshot = driver.headshot_url?.match(/\/([a-z]{6}\d{2})\.png/)?.[1];
  if (fromHeadshot) return fromHeadshot;
  const part = (name: string) =>
    name.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toLowerCase();
  return `${part(driver.first_name)}${part(driver.last_name)}01`;
}

/** Portrait candidates in preference order; try the next one when an image fails to load. */
export function driverPortraits(driver: Driver, year: number): Portrait[] {
  const team = driver.team_name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id = f1DriverId(driver);
  const portraits: Portrait[] = [
    {
      src: `${SEASON_PORTRAIT_BASE}/${year}/${team}/${id}/${year}${team}${id}right.webp`,
      width: 440,
      height: 1265,
      fullBody: true,
    },
  ];
  if (driver.headshot_url) {
    // OpenF1 returns the 93px "1col" size; "4col" is the same image at 432px.
    portraits.push({ src: driver.headshot_url.replace("/1col/", "/4col/"), width: 432, height: 432, fullBody: false });
  }
  return portraits;
}
