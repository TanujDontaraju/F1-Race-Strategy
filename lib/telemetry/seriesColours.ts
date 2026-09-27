// Chart colours for the compared drivers. Each driver keeps their team's hue, but
// team colours aren't a chart palette: teammates share one, and some teams are
// near twins (Ferrari/Audi, Haas/Cadillac). So a teammate of a driver already on
// the chart is drawn dashed, and a colour too close to one already there has its lightness
// (then hue) nudged until the pair is distinguishable, with normal vision and
// with red-green colour blindness, measured rather than eyeballed.

import { teamColour } from "@/lib/telemetry/format";
import { Driver } from "@/lib/telemetry/types";

/** The glass card surface the charts sit on. */
export const CHART_SURFACE = "#18181d";
// OKLab ΔE×100 below which two series read as the same colour: the dataviz skill's
// normal-vision floor (with a little margin) and its colour-blind target.
const MIN_DELTA_E = 15.5;
const MIN_CVD_DELTA_E = 8;
const MIN_CONTRAST = 3;

// Machado, Oliveira & Fernandes (2009) protan and deutan simulations at full severity, on linear RGB.
const CVD = [
  [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
];

export interface SeriesStyle {
  driver: Driver;
  colour: string;
  /** A teammate of a driver picked earlier: dashed so the pair stay apart without relying on colour. */
  dashed: boolean;
}

/** Stroke pattern for a dashed series. */
export const DASH = "6 4";

type Lab = [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function hexOf(rgb: number[]): string {
  return `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function oklab(hex: string, simulate?: number[][]): Lab {
  let [r, g, b] = rgbOf(hex).map(toLinear);
  if (simulate) [r, g, b] = simulate.map((row) => clamp01(row[0] * r + row[1] * g + row[2] * b));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, a, b]: Lab): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return hexOf(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(toGamma)
  );
}

function deltaE(x: string, y: string, simulate?: number[][]) {
  const [a, b] = [oklab(x, simulate), oklab(y, simulate)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 100;
}

function luminance(hex: string) {
  const [r, g, b] = rgbOf(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(x: string, y: string) {
  const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (a + 0.05) / (b + 0.05);
}

/** How distinct a colour is from those already taken, as a share of the thresholds (1 just clears them). */
function separation(colour: string, taken: string[]): number {
  return Math.min(
    Infinity,
    ...taken.map((t) =>
      Math.min(deltaE(colour, t) / MIN_DELTA_E, ...CVD.map((m) => deltaE(colour, t, m) / MIN_CVD_DELTA_E))
    )
  );
}

/** The same colour with its OKLCH lightness and hue moved. */
function shifted(hex: string, dL: number, dHue: number): string {
  const [L, a, b] = oklab(hex);
  const chroma = Math.hypot(a, b);
  const hue = Math.atan2(b, a) + (dHue * Math.PI) / 180;
  return fromOklab([Math.min(0.97, Math.max(0.3, L + dL)), chroma * Math.cos(hue), chroma * Math.sin(hue)]);
}

// Nudges to try, smallest first: lightness in steps of 0.04, hue in steps of 12 degrees.
const NUDGES = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8]
  .flatMap((l) => [0, 1, -1, 2, -2, 3, -3].map((h) => ({ dL: l * 0.04, dHue: h * 12, cost: Math.abs(l) + Math.abs(h) })))
  .sort((x, y) => x.cost - y.cost);

/**
 * The smallest change that keeps a colour legible on the surface and clear of
 * the ones already on the chart; failing that (four greys, say), the most
 * distinct shade found. Dashes, labels and the legend carry identity either way.
 */
function separate(colour: string, taken: string[]): string {
  let best = colour;
  let bestScore = -1;
  for (const { dL, dHue } of NUDGES) {
    const shade = shifted(colour, dL, dHue);
    if (contrast(shade, CHART_SURFACE) < MIN_CONTRAST) continue;
    const score = separation(shade, taken);
    if (score >= 1) return shade;
    if (score > bestScore) [best, bestScore] = [shade, score];
  }
  return best;
}

/**
 * Styles for the compared drivers, in the order they were picked: earlier picks
 * keep their colour, so adding a driver never repaints the ones already shown.
 */
export function seriesStyles(compare: number[], drivers: Driver[]): SeriesStyle[] {
  const byNumber = new Map(drivers.map((d) => [d.driver_number, d]));
  const taken: string[] = [];
  const teams = new Set<string>();
  return compare.flatMap((n) => {
    const driver = byNumber.get(n);
    if (!driver) return [];
    const colour = separate(teamColour(driver), taken);
    const dashed = teams.has(driver.team_name);
    taken.push(colour);
    teams.add(driver.team_name);
    return [{ driver, colour, dashed }];
  });
}
