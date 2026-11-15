/** Continuous SI flight. Physical assumptions and source constants are in orbital.ts and orbitalVehicle.ts. */
import { initializeTrajectory, advanceMission, missionAction, missionMaxTimeWarp, vehicleConfiguration, type OrbitalFields } from './orbitalMission';
import { DEFAULT_LAUNCH_TIME, validateWeatherSnapshot, type LaunchSite, type WeatherSnapshot } from './environment';
export { requiredActivities } from './orbitalMission';
export { sampleTrajectory } from './orbital';
export type Destination = 'iss' | 'moon';
export type Difficulty = 'cadet' | 'commander' | 'expert';
export type Phase = 'launch' | 'transfer' | 'approach' | 'science' | 'return' | 'debrief';
export type Weather = 'clear' | 'overcast' | 'crosswind';
export interface Plan {
  destination: Destination;
  difficulty: Difficulty;
  payload: 'biology' | 'geology' | 'imaging';
  extraBattery: boolean;
  extraFuel: boolean;
  shielding: boolean;
  weather?: Weather;
  startMode?: 'pad' | 'approach';
  launchSite?: LaunchSite;
  /** Interior choice. Modern is an original training-capsule refit, not a certified vehicle model. */
  vehicle?: 'modern' | 'heritage';
  launchTime?: string;
  weatherSnapshot?: WeatherSnapshot;
  communications?: 'standard' | 'redundant';
  launcher?: 'orbital' | 'saturnv';
}
/** Local storage and imported settings are untrusted inputs. Defaults are
 * explicit; only a newly started flight may retain a verified fresh snapshot. */
export function normalizePlan(value: unknown, keepFreshWeather = false): Plan {
  const p = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const pick = <const T extends string>(item: unknown, allowed: readonly T[], fallback:T):T => typeof item === 'string' && allowed.includes(item as T) ? item as T : fallback;
  const bool = (item: unknown, fallback: boolean) => typeof item === 'boolean' ? item : fallback;
  const destination=pick(p.destination,['iss','moon'],'iss'),launchSite=pick(p.launchSite,['lc39a','lc39b'],'lc39a');
  const parsed=typeof p.launchTime==='string'?Date.parse(p.launchTime):NaN;
  const weatherSnapshot=keepFreshWeather?validateWeatherSnapshot(p.weatherSnapshot,launchSite):undefined;
  return {
    destination,launchSite,difficulty:pick(p.difficulty,['cadet','commander','expert'],'cadet'),payload:pick(p.payload,['biology','geology','imaging'],destination==='moon'?'geology':'biology'),
    extraFuel:bool(p.extraFuel,true),extraBattery:bool(p.extraBattery,true),shielding:bool(p.shielding,false),
    weather:weatherSnapshot?.weather??pick(p.weather,['clear','overcast','crosswind'],'clear'),startMode:pick(p.startMode,['pad','approach'],'pad'),
    vehicle:pick(p.vehicle,['modern','heritage'],'modern'),communications:pick(p.communications,['standard','redundant'],'standard'),
    launcher:pick(p.launcher,['orbital','saturnv'],destination==='moon'?'saturnv':'orbital'),
    launchTime:Number.isFinite(parsed)?new Date(parsed).toISOString():DEFAULT_LAUNCH_TIME,weatherSnapshot,
  };
}
export interface Input { forward: number; lateral: number; vertical: number; brake: boolean }
export interface State extends OrbitalFields {
  plan: Plan; phase: Phase; elapsed: number; phaseTime: number;
  fuel: number; power: number; hull: number; science: number; scienceGoal: number;
  distance: number; speed: number; x: number; y: number; vx: number; vy: number;
  altitude: number; verticalSpeed: number; throttle: number;
  event: string | null; eventKind: 'power' | 'communications' | 'radiation' | null;
  eventResolved: boolean; eventTriggered: boolean; eventAt: number;
  success: boolean; ended: boolean; failureReason: string | null; log: string[];
  autoPilot: boolean; scienceActive: boolean; returnProgress: number; ignited: boolean;
  score: number; assisted: boolean;
  /** Scenario science records, archived only by the final physical stow task. */
  dataStoredMb: number;
  /** Launcher state; pitch is radians from local vertical toward downrange. */
  launchStage: number; launchFuel: number; stageFuel: number; vehicleMass: number;
  horizontalSpeed: number; downrange: number; pitch: number; dynamicPressure: number;
  gForce: number; wind: number; maxQ: boolean; orbitalSpeed: number;
  transferDuration: number; countdown: number; attitudeOffset: number; commandThrottle: number;
  /** Deprecated compatibility telemetry; trajectory is authoritative. */
  coastStartAltitude: number; coastStartSpeed: number;
}
export type MissionState = State;
export const phaseLabel: Record<Phase, string> = {
  launch: 'Launch', transfer: 'Flight', approach: 'Approach', science: 'Science', return: 'Return', debrief: 'Debrief',
};
export const EARTH_RADIUS = 6_371_000;
export const EARTH_MU = 3.986004418e14;
export const STANDARD_GRAVITY = 9.80665;
export const LUNAR_GRAVITY = 1.62;
const BOOSTER_PROPELLANT = 400_000;
const UPPER_PROPELLANT = 95_000;
const TOTAL_LAUNCH_PROPELLANT = BOOSTER_PROPELLANT + UPPER_PROPELLANT;
/** Original game payloads, not real spacecraft specifications. Shared field
 * equipment remains available; selection sets the primary experiment focus. */
export const PAYLOADS = {
  biology: { name: 'Biology', power: 380, dataMb: 48, actionEnergy: 1.2, result: 'Biological sample observations' },
  geology: { name: 'Geology', power: 240, dataMb: 32, actionEnergy: .9, result: 'Mineral and seismic survey records' },
  imaging: { name: 'Imaging', power: 460, dataMb: 160, actionEnergy: 1.8, result: 'Calibrated science images' },
} as const;
export function atmosphericDensity(altitude: number) { return 1.225 * Math.exp(-Math.max(0, altitude) / 8500); }
export function gravityAtAltitude(altitude: number) { return EARTH_MU / (EARTH_RADIUS + Math.max(0, altitude)) ** 2; }
export function getMaxTimeWarp(s: State) { return missionMaxTimeWarp(s); }
export function evaluatePlan(plan: Plan) {
  const launcher = plan.launcher ?? (plan.destination === 'moon' ? 'saturnv' : 'orbital');
  const launcherCompatible = plan.destination === 'moon' ? launcher === 'saturnv' : launcher === 'orbital';
  const payloadMass = { biology: 160, geology: 230, imaging: 120 }[plan.payload];
  const mass = 2020 + payloadMass + (plan.extraFuel ? 280 : 0) + (plan.extraBattery ? 130 : 0) + (plan.shielding ? 210 : 0) + (plan.communications === 'redundant' ? 90 : 0);
  const power = PAYLOADS[plan.payload].power + 680 + (plan.communications === 'redundant' ? 25 : 0);
  // Original trainer power-bus ratings. The backup pack supplies an additional
  // parallel output margin as well as stored energy; these are game values.
  const powerCapacity = 1100 + (plan.extraBattery ? 150 : 0);
  const cost = 52 + { biology: 14, geology: 18, imaging: 12 }[plan.payload] + (plan.extraFuel ? 11 : 0) + (plan.extraBattery ? 9 : 0) + (plan.shielding ? 13 : 0) + (plan.communications === 'redundant' ? 8 : 0);
  const warnings: string[] = [];
  if (!launcherCompatible) warnings.push(plan.destination === 'moon' ? 'Lunar missions require the Saturn V / Apollo stack.' : 'ISS missions require the orbital trainer stack.');
  if (mass > 2800) warnings.push('Mass exceeds 2,800 kg.');
  if (cost > 100) warnings.push('Budget exceeds 100 credits.');
  if (power > powerCapacity) warnings.push(`Power demand exceeds ${powerCapacity.toLocaleString()} W. Add the backup battery or choose a lower-power payload.`);
  if (!plan.extraFuel) warnings.push('Standard propellant reserve.');
  if (!plan.extraBattery) warnings.push('Standard battery capacity.');
  return { mass, power, powerCapacity, powerMargin:powerCapacity-power, cost, launcherCompatible, dataMb: PAYLOADS[plan.payload].dataMb, valid: launcherCompatible && mass <= 2800 && cost <= 100 && power <= powerCapacity, warnings, ...vehicleConfiguration(plan) };
}
export function createMission(plan: Plan): State {
  plan = normalizePlan(plan, true);
  const reserve = { cadet: 100, commander: 88, expert: 76 }[plan.difficulty];
  const state = {
    plan: { ...plan, weather: plan.weather ?? 'clear', startMode: plan.startMode ?? 'pad', launchSite: plan.launchSite ?? 'lc39a', vehicle: plan.vehicle ?? 'modern', launchTime: plan.launchTime ?? DEFAULT_LAUNCH_TIME, communications: plan.communications ?? 'standard' },
    phase: 'launch', elapsed: 0, phaseTime: 0,
    fuel: reserve + (plan.extraFuel ? 18 : 0), power: reserve + (plan.extraBattery ? 24 : 0), hull: 100,
    science: 0, scienceGoal: 100, distance: 0, speed: 0, x: 0, y: 0, vx: 0, vy: 0,
    altitude: 0, verticalSpeed: 0, throttle: 0, commandThrottle: 1,
    event: null, eventKind: null, eventResolved: false, eventTriggered: false,
    eventAt: plan.payload === 'imaging' ? 24 : plan.payload === 'geology' ? 42 : 34,
    success: false, ended: false, failureReason: null, log: ['Prelaunch checks complete.'], dataStoredMb: 0,
    autoPilot: false, scienceActive: false, returnProgress: 0, ignited: false, score: 0, assisted: false,
    launchStage: 1, launchFuel: 100, stageFuel: BOOSTER_PROPELLANT,
    vehicleMass: 25000 + 4000 + 10000 + evaluatePlan(plan).mass + TOTAL_LAUNCH_PROPELLANT,
    horizontalSpeed: 0, downrange: 0, pitch: 0, dynamicPressure: 0, gForce: 1,
    wind: plan.weather === 'crosswind' ? 18 : plan.weather === 'overcast' ? 6 : 2,
    maxQ: false, orbitalSpeed: Math.sqrt(EARTH_MU / EARTH_RADIUS),
    transferDuration: plan.destination === 'moon' ? 259200 : 5400,
    countdown: 10, attitudeOffset: 0, coastStartAltitude: 0, coastStartSpeed: 0,
  } as State;
  if (plan.startMode === 'approach') state.log = ['Approach practice.'];
  return initializeTrajectory(state);
}
export function act(state: State, action: string): State {
  if (action === 'ignite' && !evaluatePlan(state.plan).valid) return { ...state, log: [...state.log, 'Launch inhibited. Check launcher compatibility, mass, power and budget.'] };
  return missionAction(state, action);
}
export function stepMission(state: State, input: Input, dt: number): State { return advanceMission(state, input, dt); }
export function getGuidance(s: State): { title: string; body: string; physics: string } {
  if (s.ended) return { title: s.success ? 'Recovery confirmed' : 'Flight ended', body: s.failureReason ?? 'Crew and science recovered.', physics: 'A complete mission needs both its science objective and a safe return.' };
  if (s.power < 18 || s.fuel < 14) return { title: 'Low reserve', body: 'Prepare to return. Abort if science is incomplete.', physics: 'Braking, corrections and the return burn all require propellant.' };
  if (s.event && !s.eventResolved) return { title: s.event, body: 'Resolve the fault before resuming science.', physics: s.eventKind === 'radiation' ? 'Lunar radiation exposure is greater without Earth’s atmosphere and global magnetic field.' : 'A shared power supply means an instrument fault can affect other spacecraft systems.' };
  if (s.phase === 'launch') {
    if (!s.ignited) return { title: 'Prelaunch', body: 'Start the countdown when ready.', physics: 'Thrust must exceed weight for liftoff. Payload mass and atmospheric conditions affect acceleration.' };
    if (s.countdown > 0) return { title: 'Countdown', body: 'Guidance is ready. Hold for ignition.', physics: 'The engines start when the countdown reaches zero.' };
    if (s.maxQ) return { title: 'Aerodynamic loading', body: 'Keep pitch changes small through maximum dynamic pressure.', physics: 'Dynamic pressure is half the air density times airspeed squared. Air becomes thinner as the vehicle climbs.' };
    return { title: s.launchStage === 1 ? 'Ascent' : 'Upper stage', body: 'Guidance controls pitch. W/S changes throttle; Space restores guidance settings.', physics: 'Propellant loss reduces mass. Thrust accelerates the vehicle while gravity and atmospheric drag oppose its motion.' };
  }
  if (s.phase === 'transfer') return { title: 'Coast', body: 'Choose a time rate. Acceleration stops at the approach.', physics: 'Position and velocity evolve continuously under Earth and Moon gravity. Finite engine burns change orbital energy and angular momentum.' };
  if (s.phase === 'approach' && s.plan.destination === 'iss') return { title: s.autoPilot ? 'Approach assistance' : 'Docking', body: s.autoPilot ? 'Assistance is flying. Take control at any time.' : 'Align the port. Dock within 3 m at less than 0.5 m/s.', physics: 'Thrusters change velocity. Releasing a key stops thrust, not motion; opposing thrust slows the spacecraft.' };
  if (s.phase === 'approach') return { title: s.autoPilot ? 'Descent assistance' : 'Descent', body: s.autoPilot ? 'Assistance is landing. Take control at any time.' : 'Use W/S for throttle and A/D to center the site. Touch down below 3 m/s.', physics: 'Lunar gravity is about 1.62 m/s². With negligible atmosphere, engine thrust must slow descent.' };
  if (s.phase === 'science') return { title: s.science >= s.scienceGoal ? 'Science complete' : 'Science', body: s.science >= s.scienceGoal ? 'Begin return when ready.' : 'Complete the next instrument task.', physics: 'Scientific instruments consume power. An unresolved fault increases the electrical load.' };
  return { title: 'Return', body: 'Choose a time rate. Recovery is automatic.', physics: 'Return burns change the trajectory toward Earth. Atmospheric drag and parachutes reduce speed before recovery.' };
}
