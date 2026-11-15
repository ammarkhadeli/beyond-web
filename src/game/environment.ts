/** Launch-site and environment inputs. Weather is a current model estimate,
 * not launch clearance. The flight model uses a simplified horizontal wind.
 * Sources: https://open-meteo.com/en/docs
 * Solar approximation: https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 */
export type LaunchSite = 'lc39a' | 'lc39b';
export const LAUNCH_SITES = {
  lc39a: { name: 'Kennedy · LC-39A', latitude: 28.6084, longitude: -80.6043 },
  lc39b: { name: 'Kennedy · LC-39B', latitude: 28.6272, longitude: -80.6208 },
} as const;
export const DEFAULT_LAUNCH_TIME = '2026-11-15T17:00:00.000Z';
export interface WeatherSnapshot {
  status: 'live' | 'fallback';
  site: LaunchSite;
  weather: 'clear' | 'overcast' | 'crosswind';
  windMs: number;
  cloudCover: number;
  temperatureC: number | null;
  observedAt: string | null;
  fetchedAt: string;
  message: string;
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
/** Used at the boundary of saved settings and new flights. A prior fetched
 * snapshot is never trusted just because its stored status says "live". */
export function validateWeatherSnapshot(value: unknown, site: LaunchSite, now = Date.now()): WeatherSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const snapshot = value as Partial<WeatherSnapshot>;
  if (snapshot.status !== 'live' || snapshot.site !== site || !['clear','overcast','crosswind'].includes(snapshot.weather ?? '') || !finite(snapshot.windMs) || !finite(snapshot.cloudCover) || !finite(snapshot.temperatureC) || typeof snapshot.observedAt !== 'string' || typeof snapshot.fetchedAt !== 'string') return undefined;
  const observed = Date.parse(snapshot.observedAt), fetched = Date.parse(snapshot.fetchedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(fetched) || Math.abs(now - observed) > 3 * 3600000 || Math.abs(now - fetched) > 3 * 3600000) return undefined;
  return { status:'live',site,weather:snapshot.weather!,windMs:bounded(snapshot.windMs,0,60),cloudCover:bounded(snapshot.cloudCover,0,100),temperatureC:bounded(snapshot.temperatureC,-90,60),observedAt:new Date(observed).toISOString(),fetchedAt:new Date(fetched).toISOString(),message:'Current weather model · Open-Meteo' };
}
export function fallbackWeather(site: LaunchSite, message = 'Weather unavailable. Clear preset selected.'): WeatherSnapshot {
  return { status: 'fallback', site, weather: 'clear', windMs: 2, cloudCover: 15, temperatureC: null, observedAt: null, fetchedAt: new Date().toISOString(), message };
}
/** Abort after eight seconds, and never label a fallback as live. Request URLs
 * are fixed to this public service; no credentials or user location are sent. */
export async function fetchLaunchWeather(site: LaunchSite, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) return fallbackWeather(site, 'Weather request cancelled. Clear preset selected.');
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const { latitude, longitude } = LAUNCH_SITES[site];
    const query = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,cloud_cover,wind_speed_10m', wind_speed_unit: 'ms', timezone: 'UTC', forecast_days: '1' });
    const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: controller.signal });
    if (!response.ok) throw new Error('Weather service unavailable');
    const data: unknown = await response.json();
    const current = (data as { current?: Record<string, unknown> })?.current;
    if (!current || !finite(current.wind_speed_10m) || !finite(current.cloud_cover) || !finite(current.temperature_2m) || typeof current.time !== 'string') throw new Error('Invalid weather data');
    const observed = Date.parse(current.time.endsWith('Z') ? current.time : current.time + 'Z');
    if (!Number.isFinite(observed) || Math.abs(Date.now() - observed) > 3 * 3600000) throw new Error('Weather data is stale');
    const windMs = bounded(current.wind_speed_10m, 0, 60), cloudCover = bounded(current.cloud_cover, 0, 100);
    return { status: 'live', site, weather: windMs >= 12 ? 'crosswind' : cloudCover >= 65 ? 'overcast' : 'clear', windMs, cloudCover, temperatureC: bounded(current.temperature_2m, -90, 60), observedAt: new Date(observed).toISOString(), fetchedAt: new Date().toISOString(), message: 'Current weather model · Open-Meteo' };
  } catch {
    return fallbackWeather(site);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

/** Unit vector in Earth-fixed coordinates: X Greenwich/equator, Y 90°E,
 * Z north. NOAA fractional-year approximation, no atmospheric refraction.
 * This supplies illumination only; it is not an ephemeris for navigation. */
export function solarDirectionUTC(iso: string, elapsedSeconds = 0): [number, number, number] {
  const parsed = Date.parse(iso);
  const date = new Date((Number.isFinite(parsed) ? parsed : Date.parse(DEFAULT_LAUNCH_TIME)) + (Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0) * 1000);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const day = Math.floor((date.getTime() - start) / 86400000) + 1;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const yearDays = (Date.UTC(date.getUTCFullYear() + 1, 0, 1) - start) / 86400000;
  const gamma = 2 * Math.PI / yearDays * (day - 1 + (hours - 12) / 24);
  const equation = 229.18 * (.000075 + .001868 * Math.cos(gamma) - .032077 * Math.sin(gamma) - .014615 * Math.cos(2 * gamma) - .040849 * Math.sin(2 * gamma));
  const declination = .006918 - .399912 * Math.cos(gamma) + .070257 * Math.sin(gamma) - .006758 * Math.cos(2 * gamma) + .000907 * Math.sin(2 * gamma) - .002697 * Math.cos(3 * gamma) + .00148 * Math.sin(3 * gamma);
  const longitude = (720 - hours * 60 - equation) / 4 * Math.PI / 180;
  return [Math.cos(declination) * Math.cos(longitude), Math.cos(declination) * Math.sin(longitude), Math.sin(declination)];
}
export function localSunDirection(iso: string, elapsedSeconds = 0, site: LaunchSite = 'lc39a'): { east: number; up: number; north: number } {
  const [x, y, z] = solarDirectionUTC(iso, elapsedSeconds);
  const latitude = LAUNCH_SITES[site].latitude * Math.PI / 180, longitude = LAUNCH_SITES[site].longitude * Math.PI / 180;
  return {
    east: -Math.sin(longitude) * x + Math.cos(longitude) * y,
    up: Math.cos(latitude) * Math.cos(longitude) * x + Math.cos(latitude) * Math.sin(longitude) * y + Math.sin(latitude) * z,
    north: -Math.sin(latitude) * Math.cos(longitude) * x - Math.sin(latitude) * Math.sin(longitude) * y + Math.cos(latitude) * z,
  };
}
