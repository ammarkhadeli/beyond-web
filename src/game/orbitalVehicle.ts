/** Reference numbers are separate from guidance tuning.
 * Saturn V masses: Apollo 11 flight-evaluation ignition weights, NASA SP-4029:
 * https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_18-19_Ground_Ignition_Weights.htm
 * F-1/J-2 nominal thrust/Isp: NASA Stages to Saturn engine chart, reproduced in
 * https://ntrs.nasa.gov/api/citations/20240002646/downloads/05-LV_Loads_Sizing.pdf
 * F-1 vacuum Isp 304.1 s (rounded here): NASA SP-4545 Appendix C,
 * https://www.nasa.gov/wp-content/uploads/2023/04/sp-4545.pdf
 * SPS/DPS/APS thrust: Apollo 11 press kit pp. 91ff.
 * https://science.nasa.gov/wp-content/uploads/2023/09/Apollo_11.pdf
 * Rounded engine performance and pressure-interpolated F-1 performance are
 * modelling approximations. Guidance represents fractional burns by average
 * thrust over a bounded step; real engine minimum burn times and restart limits
 * are not represented. This is not an
 * Apollo 11 trajectory reconstruction. The ISS launch vehicle is fictional.
 */
export interface EngineStage { dryMass:number; propellant:number; thrust:number; isp:number; vacuumIsp?:number; name:string }
const LB=.45359237,LBF=4.4482216152605;
export const SATURN_V:EngineStage[]=[
  {name:'S-IC',dryMass:(287531+11477+5442+8910)*LB,propellant:(3305786+1424889)*LB,thrust:5*1522000*LBF,isp:263,vacuumIsp:304},
  {name:'S-II',dryMass:(79714+8076+1260)*LB,propellant:(819050+158116)*LB,thrust:5*230000*LBF,isp:421},
  {name:'S-IVB',dryMass:(24852+1656+4275+3951)*LB,propellant:(192497+43608)*LB,thrust:230000*LBF,isp:421},
];
export const ORBITAL_LAUNCHER:EngineStage[]=[
  {name:'Booster',dryMass:25000,propellant:400000,thrust:7600000,isp:295},
  {name:'Upper stage',dryMass:4000,propellant:95000,thrust:980000,isp:355},
];
export const APOLLO={csmMass:63507*LB,lmMass:33278*LB,spsPropellant:18400,spsThrust:20500*LBF,spsIsp:314.9,descentPropellant:8200,descentThrust:9870*LBF,descentIsp:304.1,ascentPropellant:2353,ascentThrust:3500*LBF,ascentIsp:311};
/** Apollo escape motor: 147,000 lbf for 3.2 s; the 4,700 lb motor was about
 * two-thirds propellant. NASA/North American Spacecraft News Reference:
 * https://www.nasa.gov/wp-content/uploads/static/history/alsj/CSM_News_Reference_H_Missions.pdf
 * Total tower mass uses the Apollo 11 ignition-weight table above. Effective
 * Isp is derived from those rounded impulse/propellant figures, not a separate
 * measured engine specification. The fictional ISS trainer uses this same
 * simplified escape performance; tower pitch motors and canards are omitted.
 */
export const ESCAPE={thrust:147000*LBF,duration:3.2,propellant:4700*LB*2/3,towerMass:8910*LB,capsuleMass:5560};
export const GUIDANCE={parkingAltitude:185000,parkingRadialTolerance:45,lunarOrbitAltitude:100000,lunarFlightTime:3*86400,correctionInterval:21600,lunarCaptureRadius:18000000,landingCorridorAltitude:1500};
