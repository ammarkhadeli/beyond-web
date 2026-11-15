import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createMission, stepMission, type Plan } from '../src/game/simulation';
import { flightLesson, conciseGuidance } from '../src/game/guidance';

const idle = { forward: 0, lateral: 0, vertical: 0, brake: false };
for (const destination of ['iss', 'moon'] as const) test(`${destination} abort guidance returns an unrestrained worksite crew through the hatch before reseating`, () => {
  const plan: Plan = { destination, difficulty: 'cadet', payload: 'biology', extraFuel: true, extraBattery: true, shielding: false, startMode: 'approach' };
  let state = act(createMission(plan), 'autopilot');
  for (let i = 0; i < 200 && !state.ended && state.phase !== 'science'; i++) state = stepMission(state, idle, 2);
  assert.equal(state.phase, 'science');
  assert.equal(state.canUnstrap, true);
  state = act(state, 'crew:unstrapped');
  assert.equal(state.crewSeated, false);
  state = act(state, 'abort');
  assert.equal(state.phase, 'return');
  assert.equal(state.awaitingCrewSeat, true);
  const outside = flightLesson(state, destination === 'moon' ? 'eva' : 'station').instruction;
  assert.match(outside, /hatch.*press E to board/i, 'F has no boarding action in either worksite');
  assert.ok(outside.indexOf('press E') < outside.indexOf('press F'), 'boarding must precede reseating');
  assert.equal(conciseGuidance(state, destination === 'moon' ? 'eva' : 'station'), outside, 'paused guide and radio must retain the crew location');
  assert.match(flightLesson(state, 'cabin').instruction, /^Press F/);
  assert.match(conciseGuidance(state, 'cabin'), /^Press F/);
  state = act(state, 'crew:seated');
  assert.equal(state.awaitingCrewSeat, false);
  assert.notEqual(flightLesson(state, 'seated').id, 'crew-seat');
});
