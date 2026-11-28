import type { WeatherMode } from '../types/game';

export type DayPeriod = 'night' | 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface DayNightState {
  timeOfDay: number; // normalized [0, 24)
  period: DayPeriod;
  periodLabel: string;
  formattedTime: string;
  // Celestial unit directions
  sunDir: [number, number, number];
  moonDir: [number, number, number];
  sunElevation: number; // -1..1
  // Atmospheric factors [0..1]
  dayFactor: number;
  nightFactor: number;
  dawnFactor: number;
  duskFactor: number;
  twilightFactor: number;
  rainFactor: number;
  starStrength: number;
  moonStrength: number;
  sunStrength: number;
  lanternGlow: number;
  windowGlow: number;
  // Colors (0..1 linear-ish sRGB hex values computed cleanly)
  skyZenith: number;
  skyMid: number;
  skyHorizon: number;
  skySunGlow: number;
  skyGround: number;
  fogColor: number;
  fogDensity: number;
  sunLightColor: number;
  sunLightIntensity: number;
  hemiSkyColor: number;
  hemiGroundColor: number;
  hemiIntensity: number;
  bounceLightColor: number;
  bounceLightIntensity: number;
  rimLightColor: number;
  rimLightIntensity: number;
  cloudTopColor: number;
  cloudBotColor: number;
  exposure: number;
  envIntensity: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: number): RgbColor {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

function rgbToHex(c: RgbColor): number {
  const r = Math.round(clamp01(c.r) * 255);
  const g = Math.round(clamp01(c.g) * 255);
  const b = Math.round(clamp01(c.b) * 255);
  return (r << 16) | (g << 8) | b;
}

function lerpHex(hexA: number, hexB: number, t: number): number {
  const f = clamp01(t);
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  });
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return 10.5;
  const m = hour % 24;
  return m < 0 ? m + 24 : m;
}

export function getLocalTimeOfDay(date: Date = new Date()): number {
  return normalizeHour(
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
  );
}

export function formatHourClock(hour: number): string {
  const h = normalizeHour(hour);
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function getChineseShichenLabel(hour: number): { period: DayPeriod; label: string } {
  const h = normalizeHour(hour);
  if (h >= 5.0 && h < 7.5) return { period: 'dawn', label: '卯时 · 晨曦' };
  if (h >= 7.5 && h < 11.2) return { period: 'morning', label: '辰巳 · 晨光' };
  if (h >= 11.2 && h < 14.5) return { period: 'noon', label: '午时 · 晴昼' };
  if (h >= 14.5 && h < 17.2) return { period: 'afternoon', label: '未申 · 午后' };
  if (h >= 17.2 && h < 19.6) return { period: 'dusk', label: '酉时 · 暮霞' };
  if (h >= 19.6 && h < 23.0) return { period: 'night', label: '戌亥 · 灯夜' };
  return { period: 'night', label: '子丑 · 静夜' };
}

/**
 * Pure deterministic 24-hour solar/lunar trajectory & atmospheric lighting model
 * driving sun/moon light, sky dome, fog, clouds, lanterns, and water reflection colors.
 */
export function computeDayNightState(rawHour: number, weather: WeatherMode): DayNightState {
  const h = normalizeHour(rawHour);
  const rainFactor = weather === 'rain' ? 1.0 : 0.0;
  const { period, label: periodLabel } = getChineseShichenLabel(h);

  // Solar angle: 06:00 sunrise (+X East), 12:00 zenith (high South-Southeast), 18:00 sunset (-X West)
  const sunAngle = ((h - 6) / 24) * Math.PI * 2;
  const sunElev = Math.sin(sunAngle); // -1 at midnight, +1 at noon
  const sunEastWest = Math.cos(sunAngle); // +1 at 06:00 East, -1 at 18:00 West

  // Keep a pleasant Southern Lingnan solar declination (+Z south) so front facade gets rich sunlit relief
  const sunRawX = sunEastWest * 0.84;
  const sunRawY = sunElev * 0.86;
  const sunRawZ = 0.42 * Math.max(0.25, Math.abs(sunElev) + 0.35);
  const sunLen = Math.hypot(sunRawX, sunRawY, sunRawZ) || 1;
  const sunDir: [number, number, number] = [sunRawX / sunLen, sunRawY / sunLen, sunRawZ / sunLen];

  // Moon moves opposite the sun, arched gracefully over northern/rear sky at night
  const moonAngle = sunAngle + Math.PI;
  const moonElev = Math.sin(moonAngle);
  const moonRawX = Math.cos(moonAngle) * 0.68;
  const moonRawY = Math.max(0.12, moonElev * 0.78 + 0.08);
  const moonRawZ = -0.58;
  const moonLen = Math.hypot(moonRawX, moonRawY, moonRawZ) || 1;
  const moonDir: [number, number, number] = [moonRawX / moonLen, moonRawY / moonLen, moonRawZ / moonLen];

  // Smooth twilight & day/night curves
  const dayFactor = smoothstep(-0.08, 0.24, sunElev);
  const nightFactor = 1.0 - smoothstep(-0.22, 0.08, sunElev);
  const dawnFactor =
    smoothstep(4.8, 6.2, h) * (1.0 - smoothstep(6.6, 8.4, h));
  const duskFactor =
    smoothstep(16.6, 18.1, h) * (1.0 - smoothstep(18.5, 20.1, h));
  const twilightFactor = clamp01(Math.max(dawnFactor, duskFactor));

  // Clear sky palette interpolated across Night -> Dawn/Dusk -> Clear Day
  let skyZenith = lerpHex(0x09132b, 0x2672bc, dayFactor);
  let skyMid = lerpHex(0x162b52, 0x61b0e2, dayFactor);
  let skyHorizon = lerpHex(0x283658, 0xf2e4c8, dayFactor);
  let skySunGlow = lerpHex(0x4a4362, 0xfff0c8, dayFactor);
  let skyGround = lerpHex(0x121d30, 0x86b5a4, dayFactor);

  // Infuse vivid crimson-apricot-gold dawn/dusk twilight glows (晨昏霞光)
  if (twilightFactor > 0.001) {
    const isDawn = dawnFactor >= duskFactor;
    skyZenith = lerpHex(skyZenith, isDawn ? 0x2c4b7c : 0x283868, twilightFactor * 0.65);
    skyMid = lerpHex(skyMid, isDawn ? 0x8e7294 : 0x9b5d76, twilightFactor * 0.72);
    skyHorizon = lerpHex(skyHorizon, isDawn ? 0xf6a976 : 0xf28252, twilightFactor * 0.92);
    skySunGlow = lerpHex(skySunGlow, isDawn ? 0xffcfa0 : 0xff9f5c, twilightFactor * 0.96);
    skyGround = lerpHex(skyGround, 0x6e5f64, twilightFactor * 0.55);
  }

  // Blend celadon overcast rain atmosphere when weather === 'rain'
  if (rainFactor > 0.001) {
    const rainZen = lerpHex(0x0f1a28, 0x52748e, dayFactor);
    const rainMid = lerpHex(0x1b2a3c, 0x829eb0, dayFactor);
    const rainHor = lerpHex(0x273545, 0xc4d4d4, dayFactor);
    const rainGlow = lerpHex(0x2f3c4c, 0xd8e2e0, dayFactor);
    const rainGnd = lerpHex(0x141d26, 0x6a8482, dayFactor);
    skyZenith = lerpHex(skyZenith, rainZen, rainFactor * 0.88);
    skyMid = lerpHex(skyMid, rainMid, rainFactor * 0.88);
    skyHorizon = lerpHex(skyHorizon, rainHor, rainFactor * 0.88);
    skySunGlow = lerpHex(skySunGlow, rainGlow, rainFactor * 0.9);
    skyGround = lerpHex(skyGround, rainGnd, rainFactor * 0.88);
  }

  const sunStrength = clamp01(smoothstep(-0.04, 0.14, sunElev) * (1.0 - rainFactor * 0.88));
  const moonStrength = clamp01(smoothstep(-0.02, 0.18, moonElev) * nightFactor * (1.0 - rainFactor * 0.75));
  const starStrength = clamp01(nightFactor * (1.0 - rainFactor * 0.92));

  // Lantern & interior window emissive automation (warm lanterns glow at dusk, night, or gloomy rain)
  const lanternGlow = clamp01(Math.max(nightFactor, twilightFactor * 0.78, rainFactor * 0.48));
  const windowGlow = clamp01(Math.max(nightFactor * 0.95, twilightFactor * 0.65, rainFactor * 0.42));

  // Primary directional light color & intensity (tracks Sun in daytime, Moon at night)
  let sunLightColor = lerpHex(0x88a8de, 0xfff0cf, dayFactor);
  if (twilightFactor > 0.001) {
    sunLightColor = lerpHex(sunLightColor, 0xffad6c, twilightFactor * 0.85);
  }
  if (rainFactor > 0.001) {
    sunLightColor = lerpHex(sunLightColor, lerpHex(0x526b88, 0xd8e6ee, dayFactor), rainFactor * 0.85);
  }

  const clearSunIntensity = lerpNum(0.68, 2.85, dayFactor) + twilightFactor * 0.35;
  const rainSunIntensity = lerpNum(0.45, 1.32, dayFactor);
  const sunLightIntensity = lerpNum(clearSunIntensity, rainSunIntensity, rainFactor);

  // Hemisphere, bounce, and sky rim lights
  let hemiSkyColor = lerpHex(0x3a5688, 0x98ccf0, dayFactor);
  let hemiGroundColor = lerpHex(0x4a2e1a, 0xa88a60, dayFactor);
  if (twilightFactor > 0.001) {
    hemiSkyColor = lerpHex(hemiSkyColor, 0xd48e82, twilightFactor * 0.65);
    hemiGroundColor = lerpHex(hemiGroundColor, 0x8a5f42, twilightFactor * 0.5);
  }
  if (rainFactor > 0.001) {
    hemiSkyColor = lerpHex(hemiSkyColor, lerpHex(0x2d3f54, 0xa8c2d0, dayFactor), rainFactor * 0.85);
    hemiGroundColor = lerpHex(hemiGroundColor, lerpHex(0x283034, 0x5c6862, dayFactor), rainFactor * 0.85);
  }
  const hemiIntensity = lerpNum(
    lerpNum(0.52, 0.74, dayFactor),
    lerpNum(0.48, 0.88, dayFactor),
    rainFactor
  );

  let bounceLightColor = lerpHex(0xd47634, 0xf6cfa0, dayFactor);
  if (rainFactor > 0.001) {
    bounceLightColor = lerpHex(bounceLightColor, lerpHex(0x6e5440, 0x9cb4b2, dayFactor), rainFactor * 0.8);
  }
  const bounceLightIntensity = lerpNum(
    lerpNum(0.42, 0.64, dayFactor),
    lerpNum(0.26, 0.36, dayFactor),
    rainFactor
  );

  let rimLightColor = lerpHex(0x6b92d4, 0x9bd2f8, dayFactor);
  if (twilightFactor > 0.001) {
    rimLightColor = lerpHex(rimLightColor, 0xf6b086, twilightFactor * 0.65);
  }
  const rimLightIntensity = lerpNum(0.34, 0.46, dayFactor) * (1 - rainFactor * 0.22);

  // Fog & Clouds
  let fogColor = lerpHex(0x182640, 0xd8e5e2, dayFactor);
  if (twilightFactor > 0.001) {
    fogColor = lerpHex(fogColor, 0xdba082, twilightFactor * 0.75);
  }
  if (rainFactor > 0.001) {
    fogColor = lerpHex(fogColor, lerpHex(0x1f2b38, 0xa4bac0, dayFactor), rainFactor * 0.88);
  }
  const fogDensity = lerpNum(lerpNum(0.0042, 0.0021, dayFactor), 0.0062, rainFactor);

  let cloudTopColor = lerpHex(0x3a4d70, 0xfff8e8, dayFactor);
  let cloudBotColor = lerpHex(0x1d2a44, 0xefd1b8, dayFactor);
  if (twilightFactor > 0.001) {
    cloudTopColor = lerpHex(cloudTopColor, 0xffd2a6, twilightFactor * 0.88);
    cloudBotColor = lerpHex(cloudBotColor, 0xc8746a, twilightFactor * 0.85);
  }
  if (rainFactor > 0.001) {
    cloudTopColor = lerpHex(cloudTopColor, lerpHex(0x273444, 0x9eb2be, dayFactor), rainFactor * 0.92);
    cloudBotColor = lerpHex(cloudBotColor, lerpHex(0x131b26, 0x455666, dayFactor), rainFactor * 0.94);
  }

  const exposure = lerpNum(lerpNum(1.14, 1.06, dayFactor), lerpNum(1.04, 1.02, dayFactor), rainFactor);
  const envIntensity = lerpNum(lerpNum(0.36, 0.68, dayFactor), lerpNum(0.32, 0.64, dayFactor), rainFactor);

  return {
    timeOfDay: h,
    period,
    periodLabel,
    formattedTime: formatHourClock(h),
    sunDir,
    moonDir,
    sunElevation: sunElev,
    dayFactor,
    nightFactor,
    dawnFactor,
    duskFactor,
    twilightFactor,
    rainFactor,
    starStrength,
    moonStrength,
    sunStrength,
    lanternGlow,
    windowGlow,
    skyZenith,
    skyMid,
    skyHorizon,
    skySunGlow,
    skyGround,
    fogColor,
    fogDensity,
    sunLightColor,
    sunLightIntensity,
    hemiSkyColor,
    hemiGroundColor,
    hemiIntensity,
    bounceLightColor,
    bounceLightIntensity,
    rimLightColor,
    rimLightIntensity,
    cloudTopColor,
    cloudBotColor,
    exposure,
    envIntensity,
  };
}
