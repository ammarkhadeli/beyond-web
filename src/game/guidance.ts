import type { State } from './simulation';

export type CrewLocation = 'seated' | 'cabin' | 'eva' | 'station';
export type Lesson = { id: string; title: string; instruction: string; physics: string; reference: string };
export type Activity = { id: string; label: string; instruction: string; explanation: string };
const FLIGHT_REFERENCE = 'https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/flight-equations-with-drag/';
const APOLLO_REFERENCE = 'https://ntrs.nasa.gov/api/citations/20220005666/downloads/SC_design_for_man_cntl_2.pdf';
const MOON_REFERENCE = 'https://science.nasa.gov/moon/weather-on-the-moon/';
export const ACTIVITIES: Record<'iss'|'moon', Activity[]> = {
  moon: [
    {id:'deploy-seismometer',label:'Deploy seismometer',instruction:'Walk to the seismometer case. Look at it and press E to deploy it.',explanation:'A seismometer measures ground motion. Coupling the instrument to the surface helps it detect vibrations rather than movement of its own housing.'},
    {id:'collect-sample',label:'Collect a sample',instruction:'Walk to the marked sample. Look at the rock and press E.',explanation:'A rock sample preserves geological evidence. Its location and the surrounding surface give the sample scientific context.'},
    {id:'record-panorama',label:'Record the site',instruction:'Use the survey camera to record the terrain around the sample site.',explanation:'A site panorama records the relationships between rocks, craters and terrain. Images complement measurements and returned samples.'},
    {id:'stow-samples',label:'Stow the sample',instruction:'Return to the sample container beside the lander and secure the collected material.',explanation:'Samples must remain contained during ascent and return. Keeping a record of where each sample came from preserves its value.'},
  ],
  iss: [
    {id:'install-sample',label:'Install sample cartridge',instruction:'Enter the station and place the sample cartridge in the experiment rack.',explanation:'The station and its contents are falling around Earth together. Their shared free fall produces microgravity; gravity itself has not disappeared.'},
    {id:'power-experiment',label:'Power the experiment',instruction:'Find the experiment power panel and switch the rack on.',explanation:'Experiment racks draw from a shared power system. Switching only the required equipment on protects electrical reserves.'},
    {id:'record-observation',label:'Record an observation',instruction:'Use the observation console to record the experiment result.',explanation:'A useful experiment needs both a controlled procedure and an observation. The flight record connects the result to its operating conditions.'},
    {id:'stow-results',label:'Secure the results',instruction:'Take the result cartridge to the return locker and secure it.',explanation:'Equipment and samples must be restrained before undocking. Loose objects continue moving until another force acts on them.'},
  ],
};
function completed(s: State): string[] { return (s as State & {completedActivities?: string[]}).completedActivities ?? []; }
export function nextActivity(s: State) { return ACTIVITIES[s.plan.destination].find(a => !completed(s).includes(a.id)); }
export function flightLesson(s: State, location: CrewLocation = 'seated'): Lesson {
  const lesson = (id: string, title: string, instruction: string, physics: string, reference = FLIGHT_REFERENCE): Lesson => ({id,title,instruction,physics,reference});
  if (s.ended) return lesson('recovery','Recovery',s.success ? 'The crew and scientific results have returned.' : s.failureReason || 'The flight has ended.','Mission success includes the safe return of the crew and the required results.');
  if (s.awaitingCrewSeat) return lesson('crew-seat','Burn preparation',location === 'eva' || location === 'station'
    ? 'Return to the spacecraft hatch and press E to board. Then press F inside the cabin to secure the restraints. The next burn is held until you are restrained.'
    : location === 'cabin'
      ? 'Press F to return to the flight position and secure the restraints. The next burn is held until you are restrained.'
      : 'Remain restrained. Guidance is preparing the next maneuver.',
    'Unrestrained crew and equipment continue moving when the spacecraft accelerates. Guidance keeps coasting until the crew is ready for thrust.');
  if (s.flightMode === 'escape') return lesson('launch-escape','Launch abort','Remain restrained. The escape motor is pulling the capsule clear of the launch vehicle.','The escape motor supplies a short, finite thrust. The capsule retains its velocity after cutoff and must descend through the atmosphere for recovery.',APOLLO_REFERENCE);
  if (s.navigation.returnRequested && ['tli','translunar','lunar-capture','lunar-orbit'].includes(s.flightMode)) return lesson('lunar-abort','Return planned','The landing is cancelled. Continue through the lunar encounter before the Earth-return burn.','After a committed lunar departure, reversing immediately can require more propellant than is available. Guidance continues the existing trajectory to the Moon and targets an Earth return from there.');
  if (s.event && !s.eventResolved) return lesson('fault-'+s.eventKind,'System fault',`${s.event}. ${location === 'station' ? 'Operate the experiment breaker.' : location === 'eva' ? 'Use the surface equipment reset.' : 'Inspect the caution control.'}`,s.eventKind === 'power' ? 'Electrical equipment shares a finite energy reserve. Isolating a failed load reduces the drain on the battery.' : s.eventKind === 'radiation' ? 'Radiation outside Earth’s protective environment can affect equipment. Reducing exposure and protecting sensitive equipment preserves margin.' : 'Antenna alignment and available power affect communication. A fault in the communication system does not remove the spacecraft’s momentum.');
  if (s.phase === 'launch') {
    if (!s.ignited) return lesson('prelaunch','Prelaunch','Remain strapped in. Inspect the instruments, then start the countdown.','Launch guidance normally controls the booster. The crew monitors vehicle state, checks systems and can initiate an abort. Simulator throttle inputs are training assists, not a replica of every booster control.',APOLLO_REFERENCE);
    if (s.countdown > 0) return lesson('countdown','Countdown','Watch the countdown. The vehicle remains on the pad until ignition.','Liftoff begins when thrust overcomes weight and the vehicle is released. Thrust and gravity act in opposite directions during vertical ascent.');
    if (s.dynamicPressure > 22000) return lesson('max-q','Air loads','Watch dynamic pressure. Reduce thrust if air loads or acceleration rise above the flight director’s limits.','Dynamic pressure is q = ½ρv². Air density falls with altitude while speed increases, producing a peak in aerodynamic loading during ascent.');
    if (s.launchStage > 1) return lesson('upper-stage','Upper-stage flight','Watch horizontal speed as the upper stage builds orbital velocity. C shows the separated booster.','Dropping an empty stage reduces the mass that must be accelerated. Separation does not erase its momentum; both pieces continue along their own paths.');
    return lesson('ascent','Ascent','Monitor altitude, speed and propellant. W/S changes the training throttle; A/D adjusts pitch trim.','Thrust changes velocity. As propellant is consumed, mass decreases; the same thrust then produces more acceleration. Guidance gradually turns thrust toward the horizon.');
  }
  const mode = (s as State & {flightMode?: string}).flightMode ?? '';
  if (mode === 'tli' || mode === 'translunar') return lesson(mode,'Lunar transfer',mode === 'tli' ? 'The departure burn is raising the far side of the orbit toward the Moon. Watch the burn and trajectory view.' : 'The spacecraft is coasting toward the Moon. M shows the trajectory; [ and ] change time speed.','A departure burn changes the orbit’s energy. The Moon moves during the coast, so guidance targets where the Moon will be at arrival, not its current position.');
  if (mode === 'lunar-capture' || mode === 'lunar-orbit') return lesson(mode,'Lunar arrival','Watch the Moon grow in view. The braking burn reduces speed relative to the Moon before descent.','A spacecraft arriving at the Moon still has substantial relative velocity. A braking burn removes orbital energy and allows capture instead of a flyby.');
  if (mode === 'parking') return lesson('parking','Parking orbit','Engine cutoff. Check the orbit and reserves before the departure maneuver. M opens the trajectory view.','Orbital motion needs sufficient sideways speed, not just altitude. The ISS circles Earth about every 90 minutes, much faster than Earth’s roughly 24-hour rotation. A low perigee can still intersect the atmosphere even when the spacecraft is high above Earth.');
  if (mode === 'rendezvous' && s.phase !== 'approach') return lesson('rendezvous','Orbital rendezvous','Guidance is matching the station’s orbit. Watch closing range and relative speed as the station comes into view.','Changing orbital energy also changes orbital period. Rendezvous requires matching the station’s position and velocity at the same time.');
  if (mode === 'launch-window') return lesson('launch-window','Ascent preparation','Remain restrained. Ascent waits for the orbiting command module to reach the departure window.','A lunar launch must be timed to the carrier’s moving orbit. Launching at the wrong time can require more propellant than the ascent stage carries.');
  if (mode === 'lunar-ascent' || mode === 'carrier-rendezvous') return lesson(mode,'Lunar ascent',mode === 'lunar-ascent' ? 'The descent stage remains on the Moon. Monitor ascent while the upper stage builds orbital speed.' : 'Match the command module’s position and velocity before the crew transfers.','The ascent stage leaves the landing structure behind to reduce mass. A rendezvous still requires both position and velocity to match.');
  if (mode === 'tei-wait' || mode === 'tei' || mode === 'lunar-escape') return lesson(mode,'Earth departure','Monitor the Earth-return burn and trajectory. Remain restrained until the engine cuts off.','A correctly directed departure burn raises orbital energy enough to escape the Moon and reach an Earth entry corridor.');
  if (s.phase === 'transfer') return lesson('coast-'+mode,'Coast','Follow the flight director and monitor reserves. M opens the trajectory view. Time acceleration keeps the same flight path.','Orbit is continuous free fall. A coasting spacecraft keeps its momentum while gravity bends its path. Engines are used to change that path.');
  if (s.phase === 'approach') return s.plan.destination === 'iss'
    ? lesson('docking','Station approach','Use A/D and R/Z to align. W/S changes closing speed. Space brakes; dock below 0.5 m/s. N enables flight assistance.','Docking depends on relative motion. Your orbital speed can be thousands of metres per second while your closing speed against the station is almost zero.')
    : lesson('descent','Lunar descent','Watch altitude, descent rate and lateral drift. Adjust thrust with W/S and aim for a gentle, nearly vertical touchdown.','The Moon has no substantial atmosphere to brake the descent. The engine must reduce both vertical and horizontal velocity; lunar gravity continues accelerating the vehicle downward.',MOON_REFERENCE);
  if (s.phase === 'science') {
    if (s.science >= s.scienceGoal) return lesson('work-complete','Return preparation',location === 'seated' ? 'Crew secured. Select Prepare return to begin departure.' : location === 'cabin' ? 'Press F to secure the restraints before departure.' : 'Return through the spacecraft hatch with the scientific results.','Completing the surface or station work is one part of the mission. The vehicle still needs enough resources for departure and crew recovery.');
    if (location === 'seated') return lesson('unstrap','Release restraints','The vehicle is secure. Press F to unstrap, then approach the hatch.','Remain restrained during thrust, landing and docking. After the vehicle is secure, the crew can move to the worksite.');
    if (location === 'cabin') return lesson('hatch','Enter the worksite',s.plan.destination === 'moon' ? 'Approach the hatch and press E to begin the surface EVA.' : 'Approach the hatch and press E to enter the station.','A hatch separates environments. The game simplifies pressure equalization and suit preparation; it does not reproduce a complete operational airlock checklist.');
    const activity = nextActivity(s);
    return lesson(activity?.id ?? 'work','Science operation',activity?.instruction ?? 'Return to the spacecraft.',activity?.explanation ?? 'Record and secure the results before returning.');
  }
  if (mode === 'entry') return lesson('entry','Atmospheric entry','Remain strapped in. Monitor altitude and speed while the vehicle descends through the atmosphere.','Air resistance converts kinetic energy into heat. Entry attitude, speed, air density and ballistic properties determine the loads. This model simplifies aerothermal heating.');
  return lesson('return-'+mode,'Return','Remain at the flight controls and monitor the return trajectory. M shows the path to Earth.','Returning requires the correct departure direction and arrival conditions. The same gravitational forces continue acting throughout the coast.');
}
export function conciseGuidance(s: State, location: CrewLocation = 'seated'): string { return flightLesson(s, location).instruction; }
export function contextAction(s: State): { label: string; action: string } | null {
  if (s.ended) return null;
  if (s.event && !s.eventResolved) return {label:'Isolate fault',action:'resolve'};
  if (s.phase === 'launch' && !s.ignited) return {label:'Start countdown',action:'ignite'};
  if (s.phase === 'approach' && s.plan.destination === 'iss') return {label:'Dock',action:'dock'};
  if (s.phase === 'science' && s.science >= s.scienceGoal) return {label:'Prepare return',action:'return'};
  return null;
}
