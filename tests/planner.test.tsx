import { normalizeSettings } from '../src/ui/settings';
import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { MissionPlanner } from '../src/ui/MissionPlanner';
import { evaluatePlan, type Plan } from '../src/game/simulation';
const plan:Plan={destination:'iss',difficulty:'cadet',payload:'biology',extraFuel:true,extraBattery:true,shielding:false,communications:'standard',weather:'clear',startMode:'pad',vehicle:'modern',launchSite:'lc39a'};
const render=(p:Plan,ready=true)=>renderToStaticMarkup(<MissionPlanner plan={p} setPlan={()=>{}} ready={ready} error="" start={()=>{}} show={()=>{}} renderer="WebGL 2"/>);
test('planner exposes destination, constraints and genuinely optional reserve choices',()=>{const html=render(plan);for(const label of ['aria-label="ISS"','aria-label="Moon"','Design mass','Budget','Power <b>','Science data','Full propellant reserve','Backup battery','Redundant radio','Instrument shielding','Launch time UTC','Launch site'])assert.ok(html.includes(label),label);assert.ok(html.includes('Ready'));assert.ok(html.includes('Modern training cockpit'));assert.ok(html.includes('Cadet'));assert.ok(html.includes('Commander'));assert.ok(html.includes('Expert'));});
test('overcapacity and missing-renderer plans cannot submit',()=>{const heavy={...plan,shielding:true,communications:'redundant' as const};assert.equal(evaluatePlan(heavy).valid,false);assert.match(render(heavy),/type="submit"[^>]*disabled/);assert.match(render(plan,false),/type="submit"[^>]*disabled/);assert.match(render(plan,false),/Loading spacecraft/);});
test('lunar objective requires return and separates full flight from practice',()=>{const html=render({...plan,destination:'moon',payload:'geology'});assert.ok(html.includes('collect samples, and return to Earth'));assert.ok(html.includes('Full mission'));assert.ok(html.includes('Practice'));assert.ok(html.includes('separate lunar lander'));});
test('current weather is opt-in and default conditions are labelled simulated',()=>{const html=render(plan);assert.ok(html.includes('Use current site weather'));assert.ok(html.includes('Weather presets are simulated'));assert.ok(html.includes('does not select a real launch window'));});

test('power and launcher compatibility have explicit readiness feedback',()=>{const badPower={...plan,payload:'imaging' as const,extraBattery:false};assert.equal(evaluatePlan(badPower).valid,false);assert.match(render(badPower),/Power demand exceeds/);const badLauncher={...plan,launcher:'saturnv' as const};assert.equal(evaluatePlan(badLauncher).valid,false);assert.match(render(badLauncher),/type="submit"[^>]*disabled/);});

test('corrupt saved settings cannot create nonfinite camera movement',()=>{for(const value of [null,[],{sensitivity:'fast'},{sensitivity:NaN},{sensitivity:Infinity}]){const settings=normalizeSettings(value);assert.equal(settings.sensitivity,1.6);assert.equal(settings.quality,'high');}assert.equal(normalizeSettings({sensitivity:99,quality:'low',voice:false}).sensitivity,4);assert.equal(normalizeSettings({sensitivity:-2}).sensitivity,.3);assert.equal(normalizeSettings({voice:false,sound:true}).voice,false);});
