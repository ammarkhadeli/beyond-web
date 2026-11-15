import { useEffect, useRef, useState, useMemo } from 'react';
import type { SpaceScene, SceneInteraction } from './scene/SpaceScene';
import type {GraphicsInfo} from './scene/createGraphicsEngine';
import type { AstronautMode } from './scene/AstronautRig';
import { createMission, normalizePlan, stepMission, act, evaluatePlan, getMaxTimeWarp, phaseLabel, type Plan, type State, type Input } from './game/simulation';
import { FlightAudio } from './game/audio';
import { conciseGuidance, contextAction, flightLesson, nextActivity } from './game/guidance';
import { Icon } from './ui/icons';
import { navigationReadout, formatNavigationRange } from './game/navigationDisplay';
import { MissionPlanner } from './ui/MissionPlanner';

import { normalizeSettings, type Settings } from './ui/settings';
type Dialog = 'pause' | 'settings' | 'controls' | 'help' | 'guide' | 'credits' | 'crew' | null;
type RadioLine = { text: string; source: string; expires: number };
type View = 'cockpit' | 'external' | 'trajectory';
const DEFAULT_PLAN: Plan = { destination: 'iss', difficulty: 'cadet', payload: 'biology', extraFuel: true, extraBattery: true, shielding: false, weather: 'clear', startMode: 'pad', vehicle: 'modern', launchSite: 'lc39a', launchTime: '2026-11-15T17:00:00Z', communications: 'standard' };
const WARP_RATES = [1, 5, 10, 50, 100, 1000, 10000];
const number = (n: number, digits = 0) => Number.isFinite(n) ? n.toFixed(digits) : '—';
function load<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ } }
function clock(seconds: number) { const s = Math.max(0, Math.floor(seconds)); return `${Math.floor(s / 3600).toString().padStart(2, '0')}:${Math.floor(s / 60) % 60 < 10 ? '0' : ''}${Math.floor(s / 60) % 60}:${(s % 60).toString().padStart(2, '0')}`; }

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<SpaceScene | null>(null);
  const audio = useRef<FlightAudio | null>(null);
  const [crewRole, setCrewRole] = useState<'navigator'|'engineer'|'science'>('navigator');
  const [ready, setReady] = useState(false);
  const [graphicsInfo, setGraphicsInfo] = useState<GraphicsInfo | null>(null);
  const [webglFallbackReason, setWebglFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan>(() => normalizePlan(load<unknown>('beyond-v2-plan', DEFAULT_PLAN)));
  const [settings, setSettings] = useState<Settings>(() => normalizeSettings(load<unknown>('beyond-v2-settings', {})));
  const [flight, setFlight] = useState(false);
  const [state, setState] = useState<State | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [view, setView] = useState<View>('cockpit');
  const [mode, setMode] = useState<AstronautMode>('seated');
  const [objective, setObjective] = useState<ReturnType<SpaceScene['getObjective']>>(null);
  const [focus, setFocus] = useState<SceneInteraction | null>(null);
  const [physicsOpen, setPhysicsOpen] = useState(false);
  const [warp, setWarp] = useState(1);
  const [cursor, setCursor] = useState(false);
  const [radio, setRadio] = useState<RadioLine | null>(null);
  const [guide, setGuide] = useState('');
  const stateRef = useRef<State | null>(null);
  const keys = useRef(new Set<string>());
  const look = useRef({ yaw: 0, pitch: 0 });
  const flags = useRef({ flight, dialog, view, warp, cursor, settings, plan, mode });
  flags.current = { flight, dialog, view, warp, cursor, settings, plan, mode };
  const unlockExpected = useRef(false);
  const ignoreLookUntil = useRef(0);
  const pointer = useRef({x: 0, y: 0});
  const gamepadButtons = useRef(new Set<number>());
  const seenGuides = useRef(new Set<string>());
  const savedResult = useRef(false);
  const hooks = useRef({ action: (_: string) => {}, show: (_: Dialog) => {}, changeView: () => {}, changeWarp: (_: number) => {}, primary: () => {}, transition: (_a: State, _b: State) => {}, unstrap: () => {}, inspect: () => {}, map: () => {} });

  function unlock() {
    if (document.pointerLockElement) { unlockExpected.current = true; document.exitPointerLock(); }
    keys.current.clear();
  }
  function lock() {
    if (window.matchMedia('(pointer: coarse)').matches) { flags.current.cursor = true; setCursor(true); return; }
    ignoreLookUntil.current = performance.now() + 300;
    flags.current.cursor = false; setCursor(false);
    try { const result = canvas.current?.requestPointerLock(); result?.catch(() => setCursor(false)); } catch { /* Hover look supports browsers without pointer lock. */ }
  }
  function show(next: Dialog) {
    flags.current.dialog = next;
    setDialog(next);
    if (next) { unlock(); audio.current?.update(stateRef.current, true); }
  }
  function resume() { flags.current.dialog = null; setDialog(null); keys.current.clear(); lock(); }
  function changeView() {
    const next: View = flags.current.view === 'cockpit' ? 'external' : 'cockpit';
    flags.current.view = next; setView(next); look.current = { yaw: 0, pitch: 0 };
    scene.current?.setView(next); scene.current?.setLook(0, 0);
  }
  function changeWarp(rate: number) {
    const max = flags.current.mode === 'seated' && stateRef.current ? getMaxTimeWarp(stateRef.current) : 1;
    const value = Math.max(1, Math.min(rate, max));
    flags.current.warp = value; setWarp(value);
  }
  function line(text: string, source = 'Mission control', duration = 11000, cue?: string) {
    const recording = cue ? audio.current?.playRadio(cue) : null;
    if (!recording) audio.current?.speak(text);
    setRadio({text: recording?.caption ?? text, source: recording ? 'Apollo mission audio' : source, expires: performance.now() + duration});
  }
  function contextual(s: State, fallback: string) { line(fallback); }
  function astronaut(next: AstronautMode) {
    if (stateRef.current) { const updated = act(stateRef.current, next === 'seated' ? 'crew:seated' : 'crew:unstrapped'); stateRef.current = updated; setState({...updated}); }
    flags.current.mode = next; setMode(next); keys.current.clear();
    if (next !== 'seated') changeWarp(1);
    scene.current?.setAstronautMode(next, next === 'eva' ? 'lunar' : next === 'station' ? 'station' : 'capsule');
    look.current = {yaw:0,pitch:0}; scene.current?.setLook(0,0);
    if (flags.current.view !== 'cockpit') { flags.current.view = 'cockpit'; setView('cockpit'); scene.current?.setView('cockpit'); }
  }
  function unstrap() {
    const current = stateRef.current;
    if (!current || flags.current.dialog) return;
    if (flags.current.mode === 'seated') {
      const safe = current.canUnstrap;
      if (!safe) { line('Remain strapped in during powered flight, approach and landing.'); return; }
      astronaut('cabin');
    } else if (flags.current.mode === 'cabin') astronaut('seated');
  }
  function map() {
    const next: View = flags.current.view === 'trajectory' ? 'cockpit' : 'trajectory';
    flags.current.view = next; setView(next); look.current = {yaw:0,pitch:0};
    scene.current?.setView(next); scene.current?.setLook(0,0);
  }
  function inspect() { const target = scene.current?.getInteraction(flags.current.cursor ? pointer.current : undefined) ?? null; setFocus(target); setPhysicsOpen(!target); show('help'); }
  function training(s: State, key: string) {
    if (s.plan.difficulty !== 'cadet' || !settings.beginnerPauses || seenGuides.current.has(key)) return false;
    seenGuides.current.add(key); setGuide(conciseGuidance(s,flags.current.mode)); show('guide'); audio.current?.speak(conciseGuidance(s,flags.current.mode)); return true;
  }
  function action(command: string) {
    if (!stateRef.current || flags.current.dialog || stateRef.current.ended) return;
    const before = stateRef.current;
    audio.current?.click();
    const next = act(before, command);
    stateRef.current = next; setState({ ...next });
    if (command === 'ignite') line('Launch sequence started. Guidance is active.');
    if (command === 'autopilot') line(next.autoPilot ? 'Approach assistance engaged.' : 'You have control.');
    if (command === 'dock' && next.phase === 'approach') line('Latch inhibited. Close within three meters and reduce relative speed below half a meter per second.');
    if (command === 'resolve' && next.eventResolved) line('Fault isolated. The experiment can resume.');
    if (command.startsWith('activity:') && next.science > before.science) line(flightLesson(next, flags.current.mode).instruction);
    if (before.phase !== next.phase || before.science !== next.science || before.eventTriggered !== next.eventTriggered) hooks.current.transition(before, next);
  }
  function primary() {
    const current = stateRef.current;
    if (!current || flags.current.dialog || current.ended) return;
    const hit = flags.current.view === 'cockpit' ? scene.current?.interact(flags.current.cursor ? pointer.current : undefined) : null;
    if (hit && hit.enabled) {
      if (hit.action === 'sit') { astronaut('seated'); return; }
      if (hit.action === 'exit-worksite') {
        if (current.phase !== 'science') { line('The worksite hatch is available after landing or docking.'); return; }
        astronaut(current.plan.destination === 'moon' ? 'eva' : 'station');
        line(flightLesson(current, current.plan.destination === 'moon' ? 'eva' : 'station').instruction); return;
      }
      if (hit.action === 'board') { astronaut('cabin'); return; }
      if (hit.action === 'guide' || hit.action === 'radio') { setPhysicsOpen(false); show('help'); return; }
      if (hit.action === 'throttle-up' || hit.action === 'throttle-down') {
        const key = hit.action === 'throttle-up' ? 'KeyW' : 'KeyS';
        keys.current.add(key); window.setTimeout(() => keys.current.delete(key), 220); return;
      }
      if (hit.action.startsWith('activity:') && !['eva','station'].includes(flags.current.mode)) return;
      if (hit.action === 'return' && flags.current.mode !== 'seated') { line('Return to the flight position and secure the restraints before departure.'); return; }
      action(hit.action); return;
    }
    if (hit) return;
    if (flags.current.mode === 'seated') { const task = contextAction(current); if (task) action(task.action); }
  }
  function transition(before: State, next: State) {
    if (before.countdown > 0 && next.countdown === 0 && next.phase === 'launch') { changeWarp(1); line('Ignition. Liftoff.', 'Mission control', 10000, 'liftoff'); }
    if (before.phase !== next.phase || before.launchStage !== next.launchStage || before.flightMode !== next.flightMode) {
      changeWarp(1);
      if (next.ended) { unlock(); return; }
      if (before.phase !== next.phase || before.flightMode !== next.flightMode) {
        if (next.phase === 'science' && next.plan.destination === 'moon') line('Touchdown confirmed.', 'Mission control', 9000, 'touchdown');
        else if (!training(next, next.phase + next.flightMode)) contextual(next, conciseGuidance(next,flags.current.mode));
      } else if (next.launchStage > before.launchStage) line(`Stage ${before.launchStage} separated. Time speed reset to one.`);
    }
    if (!before.eventTriggered && next.eventTriggered) {
      changeWarp(1);
      if (!training(next, 'fault')) void contextual(next, conciseGuidance(next,flags.current.mode));
    }
    if (before.science < before.scienceGoal && next.science >= next.scienceGoal) { changeWarp(1); void contextual(next, 'Science complete. Prepare for return.'); }
    if (!before.awaitingCrewSeat && next.awaitingCrewSeat) line(conciseGuidance(next, flags.current.mode));
    if (!before.maxQ && next.maxQ) line('Maximum dynamic pressure. Guidance is managing the air loads.');
  }
  hooks.current = { action, show, changeView, changeWarp, primary, transition, unstrap, inspect, map };

  useEffect(() => { save('beyond-v2-settings', settings); scene.current?.setQuality(settings.quality); if (audio.current) { audio.current.voice = settings.voice; audio.current.enabled = settings.sound; if (!settings.voice) audio.current.silence(); } }, [settings]);
  useEffect(() => { save('beyond-v2-plan', plan); }, [plan]);
  useEffect(()=>{
    if(!dialog)return;
    const previous=document.activeElement as HTMLElement|null;
    const panel=document.querySelector<HTMLElement>('.overlay [role="dialog"]');
    const controls=()=>Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select,textarea,[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0);
    controls()[0]?.focus();
    const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const list=controls();if(!list.length)return;const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
    document.addEventListener('keydown',trap);return()=>{document.removeEventListener('keydown',trap);if(previous?.isConnected)previous.focus();};
  },[dialog]);
  useEffect(() => {
    let renderer: SpaceScene | undefined;
    let active = true;
    void Promise.all([import('./scene/SpaceScene'),import('./scene/createGraphicsEngine')]).then(async ([sceneModule,engineModule]) => {
      if(!active)return;
      const {engine,info}=await engineModule.createGraphicsEngine(canvas.current!,webglFallbackReason);
      if (!active) { engine.dispose(); return; }
      try { renderer = new sceneModule.SpaceScene(canvas.current!,engine,info); }
      catch (error) { engine.dispose(); throw error; }
      scene.current = renderer;
      setGraphicsInfo(info);
      renderer.setFlightActive(false); renderer.setView('external'); renderer.setQuality(flags.current.settings.quality);
      await renderer.ready;
      if (active) setReady(true);
    }).catch(e => {
      if (active && e instanceof Error && e.name === 'WebGLFallbackRequired') { setWebglFallbackReason(e.message); return; }
      if (active) setError(e instanceof Error ? e.message : 'Graphics could not start. Enable hardware acceleration, then reload.');
      console.error(e);
    });
    audio.current = new FlightAudio();
    audio.current.enabled = flags.current.settings.sound; audio.current.voice = flags.current.settings.voice;
    let previous = performance.now(), publish = 0, id = 0;
    let menuState = createMission({ ...DEFAULT_PLAN, startMode: 'pad' });
    function frame(now: number) {
      if (!active) return;
      if (!renderer) { previous = now; id = requestAnimationFrame(frame); return; }
      const dt = Math.min(Math.max(0, (now - previous) / 1000), .2); previous = now;
      const f = flags.current;
      if (f.flight && stateRef.current) {
        if (!f.dialog && !stateRef.current.ended) {
          const k = keys.current;
          const flightInput: Input = { forward: Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown')), lateral: Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft')), vertical: Number(k.has('KeyR')) - Number(k.has('KeyZ')), brake: k.has('Space') };
          const pad = Array.from(navigator.getGamepads?.() ?? []).find(p => p?.connected);
          if (pad) {
            const axis = (n: number) => Math.abs(pad.axes[n] ?? 0) > .15 ? pad.axes[n] : 0;
            look.current.yaw += axis(2) * dt * 1.7 * f.settings.sensitivity;
            if (f.view === 'cockpit' && f.mode === 'seated') look.current.yaw = Math.max(-2.5,Math.min(2.5,look.current.yaw));
            look.current.pitch = Math.max(-1.42, Math.min(1.42, look.current.pitch + axis(3) * dt * 1.7 * f.settings.sensitivity));
            renderer.setLook(look.current.yaw, look.current.pitch);
            flightInput.lateral += axis(0); flightInput.forward -= axis(1);
            for (const [button, trigger] of [[2, hooks.current.primary], [3, hooks.current.unstrap], [4, hooks.current.changeView], [8, hooks.current.map], [9, () => hooks.current.show('pause')]] as const) {
              if (pad.buttons[button]?.pressed && !gamepadButtons.current.has(button)) trigger();
            }
            gamepadButtons.current = new Set(pad.buttons.map((b,i) => b.pressed ? i : -1).filter(i => i >= 0));
          }
          renderer.setAstronautInput({forward: f.mode === 'seated' ? 0 : flightInput.forward, strafe: f.mode === 'seated' ? 0 : flightInput.lateral, vertical: Number(k.has('Space')) - Number(k.has('ControlLeft') || k.has('ControlRight')), sprint: k.has('ShiftLeft') || k.has('ShiftRight'), brake:k.has('KeyX')});
          const input: Input = f.mode === 'seated' ? flightInput : {forward:0,lateral:0,vertical:0,brake:false};
          audio.current?.movement(f.mode,Math.hypot(flightInput.forward,flightInput.lateral),dt);
          const before = stateRef.current;
          const rate = f.mode === 'seated' ? Math.min(f.warp, getMaxTimeWarp(before)) : 1;
          if (rate !== f.warp) hooks.current.changeWarp(rate);
          const next = stepMission(before, input, dt * rate);
          stateRef.current = next;
          hooks.current.transition(before, next);
        }
        if (f.dialog) renderer.setAstronautInput({forward:0,strafe:0,vertical:0,sprint:false});
        renderer.update(stateRef.current, f.dialog ? 0 : dt);
        audio.current?.update(stateRef.current, !!f.dialog);
        publish += dt;
        if (publish >= .1) { setState({ ...stateRef.current }); if (!f.dialog) {setFocus(f.view === 'cockpit' ? renderer.getInteraction(f.cursor ? pointer.current : undefined) : null);setObjective(f.view === 'cockpit' && stateRef.current.plan.difficulty === 'cadet' ? renderer.getObjective() : null);} publish = 0; }
      } else {
        if (menuState.plan.weather !== f.plan.weather || menuState.plan.destination !== f.plan.destination || menuState.plan.vehicle !== f.plan.vehicle || menuState.plan.launchTime !== f.plan.launchTime || menuState.plan.launchSite !== f.plan.launchSite) menuState = createMission({ ...f.plan, startMode: 'pad' });
        menuState.elapsed += dt;
        renderer.update(menuState, dt);
        audio.current?.update(null, true);
      }
      setRadio(current => current && now > current.expires ? null : current);
      id = requestAnimationFrame(frame);
    }
    id = requestAnimationFrame(frame);
    function mouse(e: MouseEvent) {
      const f = flags.current; pointer.current = {x:e.clientX,y:e.clientY};
      if (!f.flight || f.dialog || f.cursor || stateRef.current?.ended || performance.now() < ignoreLookUntil.current) return;
      if (!document.pointerLockElement && e.target !== canvas.current) return;
      look.current.yaw += e.movementX * .0025 * f.settings.sensitivity;
      look.current.pitch += e.movementY * .0025 * f.settings.sensitivity;
      if (f.view === 'cockpit' && f.mode === 'seated') look.current.yaw = Math.max(-2.5, Math.min(2.5, look.current.yaw));
      look.current.pitch = Math.max(-1.42, Math.min(1.42, look.current.pitch));
      renderer?.setLook(look.current.yaw, look.current.pitch);
    }
    function keydown(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.matches('input,textarea,select') || !flags.current.flight) return;
      if (e.code === 'Escape') { if (!flags.current.dialog) hooks.current.show('pause'); return; }
      if (flags.current.dialog || stateRef.current?.ended) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'Tab' && !e.repeat) {
        const free = !flags.current.cursor; flags.current.cursor = free; setCursor(free);
        if (free) unlock(); else lock(); return;
      }
      if (!e.repeat) {
        if (e.code === 'KeyC') hooks.current.changeView();
        if (e.code === 'KeyH') { setPhysicsOpen(false); hooks.current.show('help'); }
        if (e.code === 'KeyI') hooks.current.inspect();
        if (e.code === 'KeyF' && flags.current.mode !== 'station') hooks.current.unstrap();
        if (e.code === 'KeyM') hooks.current.map();
        if (e.code === 'KeyE') hooks.current.primary();
        if (e.code === 'KeyN') hooks.current.action('autopilot');
        if (e.code === 'KeyV') { look.current = { yaw: 0, pitch: 0 }; renderer?.setLook(0, 0); }
        if (e.code === 'BracketRight' || e.code === 'BracketLeft') {
          const index = WARP_RATES.indexOf(flags.current.warp);
          const next = WARP_RATES[Math.max(0, Math.min(WARP_RATES.length - 1, index + (e.code === 'BracketRight' ? 1 : -1)))];
          hooks.current.changeWarp(next);
        }
      }
      keys.current.add(e.code);
    }
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const lost = () => { if (document.pointerLockElement) ignoreLookUntil.current = performance.now() + 150; if (!document.pointerLockElement) { if (unlockExpected.current) unlockExpected.current = false; else if (flags.current.flight && !flags.current.dialog && !stateRef.current?.ended) hooks.current.show('pause'); } };
    const hidden = () => { if (document.hidden && flags.current.flight && !stateRef.current?.ended) hooks.current.show('pause'); };
    window.addEventListener('mousemove', mouse); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); document.addEventListener('pointerlockchange', lost); document.addEventListener('visibilitychange', hidden);
    return () => { active = false; cancelAnimationFrame(id); renderer?.dispose(); audio.current?.dispose(); scene.current = null; window.removeEventListener('mousemove', mouse); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); document.removeEventListener('pointerlockchange', lost); document.removeEventListener('visibilitychange', hidden); };
  }, [webglFallbackReason]);

  useEffect(() => {
    if (state?.ended && !savedResult.current) {
      savedResult.current = true; audio.current?.silence(); unlock();
      const record = { destination: state.plan.destination, elapsed: state.elapsed, science: state.science, success: state.success, date: new Date().toISOString() };
      const prior=load<unknown>('beyond-v2-flights', []);
      save('beyond-v2-flights', [record, ...(Array.isArray(prior)?prior:[])].slice(0, 20));
    }
  }, [state?.ended]);

  function start() {
    if(!ready || !evaluatePlan(plan).valid || error) return;
    const next = createMission(plan);
    stateRef.current = next; setState(next); savedResult.current = false; seenGuides.current.clear();
    flags.current.flight = true; flags.current.dialog = null; flags.current.warp = 1; flags.current.cursor = false; flags.current.view = 'cockpit';
    setFlight(true); setDialog(null); setWarp(1); setCursor(false); setView('cockpit'); setRadio(null); setPhysicsOpen(false); setFocus(null); astronaut('seated');
    look.current = { yaw: 0, pitch: 0 }; keys.current.clear(); scene.current?.setFlightActive(true); scene.current?.setView('cockpit'); scene.current?.setLook(0, 0);
    void audio.current?.start().then(()=>{if(flags.current.flight && flags.current.dialog==='guide' && stateRef.current?.elapsed===next.elapsed)audio.current?.speak(conciseGuidance(next,flags.current.mode));});
    if (next.plan.difficulty === 'cadet' && settings.beginnerPauses) { seenGuides.current.add(next.phase + next.flightMode); setGuide(conciseGuidance(next,flags.current.mode)); show('guide'); } else lock();
  }
  function leave() {
    unlock(); flags.current.flight = false; flags.current.dialog = null; stateRef.current = null; setFlight(false); setState(null); setDialog(null); setRadio(null);
    audio.current?.silence(); setFocus(null); astronaut('seated'); scene.current?.setFlightActive(false); scene.current?.setView('external'); scene.current?.setLook(0, 0);
  }
  const capacity = useMemo(()=>createMission(plan),[plan]);
  const task = state ? contextAction(state) : null;
  const navigation = state ? navigationReadout(state) : null;
  const maxWarp = mode === 'seated' && state ? getMaxTimeWarp(state) : 1;
  const lesson = state ? flightLesson(state, mode) : null;
  const activity = state ? nextActivity(state) : null;
  const surfaceFrame = state?.phase === 'launch' || state?.flightMode === 'entry' || state?.plan.destination === 'moon' && ['approach','science'].includes(state.phase);
  const relativeFrame = state?.plan.destination === 'iss' && ['approach','science'].includes(state.phase);
  const speed = state ? surfaceFrame ? state.groundSpeed : relativeFrame ? Math.hypot(state.speed,state.vx,state.vy) : Math.hypot(...state.trajectory.velocity) : 0;
  const touch = (code: string) => ({ onPointerDown: (e: React.PointerEvent) => { e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); }, onPointerUp: () => keys.current.delete(code), onLostPointerCapture: () => keys.current.delete(code), onPointerCancel: () => keys.current.delete(code) });

  return <div className={`simulator ${flight ? 'flying' : 'setup'}`}>
    <canvas key={webglFallbackReason ?? "preferred"} id="space-canvas" ref={canvas} aria-label="Spacecraft flight view" onPointerDown={e => { if (e.pointerType === 'touch') e.currentTarget.setPointerCapture(e.pointerId); else if (flight && !dialog && e.button === 0) primary(); }} onWheel={e => { if (!flight || dialog) return; if (view === 'trajectory') scene.current?.zoomTrajectory(Math.exp(e.deltaY * .001)); else if (view === 'cockpit') scene.current?.zoomCockpit(Math.exp(e.deltaY * .001)); }} onPointerMove={e => { if (e.pointerType !== 'touch' || !flight || dialog || e.buttons === 0) return; look.current.yaw += e.movementX * .004; if (mode === 'seated') look.current.yaw = Math.max(-2.5, Math.min(2.5, look.current.yaw)); look.current.pitch = Math.max(-1.42, Math.min(1.42, look.current.pitch + e.movementY * .004)); scene.current?.setLook(look.current.yaw, look.current.pitch); }} />
    {error && <div className="error-banner" role="alert">{error}</div>}
    {!flight && <>
      <div className="setup-shade" />
      <MissionPlanner plan={plan} setPlan={setPlan} ready={ready} error={error} start={start} show={show} renderer={graphicsInfo?.backend}/>

    </>}
    {flight && state && !state.ended && <>
      <div className="flight-status"><span>{phaseLabel[state.phase]}</span><span className="mission-clock">{clock(state.elapsed)}</span>{dialog && <span className="paused-label">Paused</span>}{state.phase === 'launch' && state.ignited && state.countdown > 0 && <span>T − {Math.ceil(state.countdown)}</span>}</div>
      {view !== 'cockpit' && <div className="external-readouts"><span><small>ALT</small>{state.altitude >= 10000 ? `${number(state.altitude / 1000, 1)} km` : `${number(state.altitude)} m`}</span><span><small>{surfaceFrame ? 'SURF' : relativeFrame ? 'REL' : 'ECI'}</small>{number(speed, 1)} m/s</span><span><small>FUEL</small>{number(state.phase === 'launch' ? state.launchFuel : state.fuel)}%</span></div>}
      {radio && !dialog && radio.text !== lesson?.instruction && <div className="radio-caption" role="status"><Icon name="radio" size={14} /><div><small>{radio.source}</small><p>{radio.text}</p></div><button aria-label="Dismiss transmission" onClick={() => { setRadio(null); audio.current?.silence(); }}><Icon name="close" size={13} /></button></div>}
      {!dialog && <><aside className="key-reference" aria-label="Flight controls"><span><kbd>Mouse</kbd> Look</span><span><kbd>{mode === 'seated' ? 'W / S' : 'W A S D'}</kbd> {mode === 'seated' ? 'Thrust' : 'Move'}</span><span><kbd>E</kbd> Operate {(mode === 'seated' || mode === 'cabin') && <><kbd>F</kbd> {mode === 'seated' ? 'Unstrap' : 'Restrain'}</>}</span><span><kbd>C</kbd> Camera <kbd>M</kbd> Trajectory</span><span><kbd>H</kbd> Guide <kbd>Tab</kbd> Cursor</span></aside>
      <div className="current-objective"><small><span className="objective-index">OBJECTIVE</span>{lesson?.title}</small><span>{state.plan.difficulty==='expert'?'':lesson?.instruction}</span><button onClick={() => {setPhysicsOpen(true);show('help');}} aria-label="Explain current operation"><Icon name="help" size={15}/></button></div>
      {view === 'cockpit' && <>{objective && <div className={`objective-marker ${objective.offscreen ? 'offscreen' : ''}`} style={{left:objective.x,top:objective.y}}><i style={{transform:`rotate(${objective.angle}rad)`}}/><span>{objective.label} <small>{number(objective.distance,1)} m</small></span></div>}<div className="aim-point"/>{focus && <div className="interaction-prompt"><strong>{focus.label}</strong><span><kbd>E</kbd> {focus.enabled ? 'Operate' : 'Unavailable'} <kbd>I</kbd> Inspect</span></div>}</>}</>}
      <div className="reserve-strip" aria-label="Mission reserves">{[{label:'Propellant',value:state.phase==='launch'?state.launchFuel:state.fuel/capacity.fuel*100},{label:'Battery',value:state.power/capacity.power*100},{label:'Integrity',value:state.hull}].map(item=><div key={item.label} className={item.value<20?'reserve-low':''}><span>{item.label}</span><b>{number(item.value)}<small>%</small></b><meter min="0" max="100" value={item.value}/></div>)}<div><span>Science</span><b>{number(state.science)}<small>%</small></b><meter min="0" max="100" value={state.science}/></div></div>
      {view==='trajectory'&&<aside className="trajectory-summary"><span className="eyebrow">{state.plan.destination==='moon'?'LUNAR EXPEDITION':'ISS RESEARCH'}</span><ol>{(['launch','transfer','approach','science','return','debrief'] as const).map((p,i)=><li className={state.phase===p?'current':''} key={p}><span>{String(i+1).padStart(2,'0')}</span>{phaseLabel[p]}</li>)}</ol>{navigation&&<div className="navigation-range"><small>{navigation.label}</small><strong>{formatNavigationRange(navigation.rangeMeters)}</strong><small>Direct geometric separation</small></div>}<p>Position and unpowered prediction<br/>Future engine burns change this path.</p><span className="trajectory-speed">TIME {warp.toLocaleString()}×</span></aside>}
      <div className="flight-toolbar">
        <div className="flight-actions">{task && mode === 'seated' && <button className="context-action" onClick={() => action(task.action)}><kbd>E</kbd>{task.label}</button>}{state.phase === 'approach' && <button className={state.autoPilot ? 'assistance active' : 'assistance'} aria-label={state.autoPilot ? 'Disable approach assistance' : 'Enable approach assistance'} onClick={() => action('autopilot')} title="Approach assistance (N)"><Icon name="target" /><span>{state.autoPilot ? 'Assisted' : 'Assist'}</span></button>}</div>
        <div className="view-actions"><button onClick={changeView} title="Switch camera (C)" aria-label="Switch camera"><Icon name="camera" /><span>{view === 'cockpit' ? 'Cockpit' : view === 'trajectory' ? 'Trajectory' : 'External'}</span></button><label className="warp-control" title="Time speed ([ and ])"><select aria-label="Time speed" value={warp} onChange={e => changeWarp(Number(e.target.value))}>{WARP_RATES.filter(v => v <= maxWarp).map(rate => <option key={rate} value={rate}>{rate.toLocaleString()}×</option>)}</select></label><button aria-label="Trajectory map" title="Trajectory map (M)" onClick={map}><Icon name="map" /></button><button aria-label="Crew support" title="Crew support" onClick={()=>show('crew')}><Icon name="crew" /></button><button aria-label="Flight guide" title="Flight guide (H)" onClick={() => show('help')}><Icon name="radio" /></button><button aria-label="Pause" title="Pause (Esc)" onClick={() => show('pause')}><Icon name="pause" /></button><span className="cursor-hint"><kbd>Tab</kbd>{cursor ? 'Look' : 'Cursor'}</span></div>
      </div>
      <div className="touch-flight"><button {...touch('KeyA')}>A</button><button {...touch('KeyW')}>W</button><button {...touch('KeyS')}>S</button><button {...touch('KeyD')}>D</button>{state.plan.destination === 'iss' && <><button {...touch('KeyR')}>R</button><button {...touch('KeyZ')}>Z</button></>}<button {...touch('Space')}>{mode === 'seated' ? 'Brake' : 'Up'}</button><button onClick={primary}>E</button><button onClick={unstrap}>Harness</button></div>
    </>}
    {flight && state?.ended && <div className="overlay"><section className="dialog debrief" role="dialog" aria-label="Flight result"><h2>{state.success ? 'Mission complete' : 'Flight ended'}</h2>{!state.success && <p>{state.failureReason}</p>}<p>{state.success?'Crew and scientific results recovered.':'Review the flight record and adjust the next mission.'}</p><dl><div><dt>Science</dt><dd>{number(state.science)}%</dd></div><div><dt>Elapsed</dt><dd>{clock(state.elapsed)}</dd></div><div><dt>Data recovered</dt><dd>{state.success?state.dataStoredMb:0} MB</dd></div></dl><div className="debrief-design"><h3>Design review</h3><p>{state.plan.extraFuel?'Full propellant reserves increased maneuver margin.':'Reduced tank loading saved mass but limited maneuver margin.'} {state.plan.extraBattery?'The backup battery increased electrical reserves.':'Standard battery capacity left less time for science and faults.'}</p><p>{state.plan.payload==='imaging'?'Imaging reduced payload mass and increased power demand.':state.plan.payload==='geology'?'The heavier geology payload enabled returned sample science.':'The biology payload required powered research operations.'} {state.plan.communications==='redundant'?'The redundant radio reduced communication-fault recovery cost.':'A single radio kept mass and budget lower.'}</p><div className="design-summary"><span>Battery remaining <b>{number(state.power/capacity.power*100)}%</b></span><span>Budget <b>{evaluatePlan(state.plan).cost} / 100</b></span></div></div><details className="flight-record"><summary>Flight record</summary><ol>{state.log.map((entry,i)=><li key={i}>{entry}</li>)}</ol></details><button className="secondary report-download" onClick={()=>{const blob=new Blob([JSON.stringify({team:'Batata Warriors',mission:state.plan,success:state.success,science:state.science,dataRecoveredMb:state.success?state.dataStoredMb:0,elapsedSeconds:state.elapsed,powerRemaining:state.power,reason:state.failureReason,flightRecord:state.log},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='beyond-flight-report.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export flight report</button><button className="primary" onClick={start}>Fly again</button><button className="secondary" onClick={leave}>Flight setup</button></section></div>}
    {dialog && !state?.ended && <div className={`overlay ${dialog === 'guide' ? 'training-overlay' : ''}`}><section className={`dialog ${dialog === 'help' ? 'guide-dialog' : ''}`} role="dialog" aria-modal="true" aria-label={dialog === 'guide' ? 'Flight guidance' : dialog}>
      <div className="dialog-title"><h2>{{ pause: 'Paused', settings: 'Settings', controls: 'Controls', help: 'Flight guide', guide: 'Flight guidance', credits: 'Sources & credits', crew: 'Crew support' }[dialog]}</h2>{dialog !== 'guide' && <button className="icon-button" aria-label="Close menu" onClick={() => flight ? resume() : show(null)}><Icon name="close" /></button>}</div>
      {dialog === 'pause' && <div className="pause-options"><button className="primary" onClick={resume}>Resume</button><button onClick={() => show('controls')}>Controls</button><button onClick={() => show('settings')}>Settings</button><button onClick={() => { show(null); action('abort'); }}>Abort and return</button><button onClick={leave}>End flight</button></div>}
      {dialog === 'settings' && <div className="settings-form">{graphicsInfo && <div className="configuration-numbers" style={{margin:'0 0 20px',borderTop:0,paddingTop:0}}><span>Renderer</span><span>{graphicsInfo.backend}</span></div>}<label className="field">Graphics<select aria-label="Graphics" value={settings.quality} onChange={e => setSettings(s => ({ ...s, quality: e.target.value as Settings['quality'] }))}><option value="high">High</option><option value="low">Low</option></select></label><label className="field">Mouse sensitivity<input aria-label="Mouse sensitivity" type="range" min=".3" max="4" step=".1" value={settings.sensitivity} onChange={e => setSettings(s => ({ ...s, sensitivity: Number(e.target.value) }))} /></label>{([{ key: 'voice', label: 'Mission control voice' }, { key: 'sound', label: 'Sound effects' }, { key: 'beginnerPauses', label: 'Pause for beginner guidance' }] as const).map(item => <label className="checkbox" key={item.key}><input type="checkbox" checked={settings[item.key]} onChange={e => setSettings(s => ({ ...s, [item.key]: e.target.checked }))} />{item.label}</label>)}</div>}
      {dialog === 'controls' && <><dl className="controls-list">{[['Mouse', 'Look'], ['Mouse wheel', 'Instrument / trajectory zoom'], ['C', 'Cockpit / external camera'], ['V', 'Center view'], ['W / S', 'Throttle or forward / reverse thrust'], ['A / D', 'Pitch trim or lateral thrust'], ['R / Z', 'Vertical thrust (ISS)'], ['Space', 'Stabilize / brake'], ['E', 'Context action'], ['N', 'Flight assistance'], ['F', 'Release / secure restraints'], ['E / click', 'Operate the control you are looking at'], ['I', 'Inspect instrument / physics'], ['M', 'Trajectory view'], ['W A S D', 'Move when unstrapped'], ['Space / Ctrl', 'Jump / float up or down'], ['X', 'Stop at handrail (station)'], ['[ / ]', 'Decrease / increase time speed'], ['H', 'Flight guide'], ['Tab', 'Release / capture cursor'], ['Esc', 'Pause']].map(([key, meaning]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{meaning}</dd></div>)}</dl></>}
      {dialog === 'guide' && <><p className="guide-copy">{guide}</p><div className="guide-options"><button className="primary" onClick={resume}>Continue</button><button className="secondary" onClick={() => { setPhysicsOpen(true); show('help'); }}>Explain</button></div></>}
      {dialog === 'help' && lesson && <><div className="lesson-heading"><span>{focus?.label ?? lesson.title}</span></div><div className="lesson-tabs"><button className={!physicsOpen ? 'selected' : ''} onClick={() => setPhysicsOpen(false)}>Procedure</button><button className={physicsOpen ? 'selected' : ''} onClick={() => setPhysicsOpen(true)}>Physics</button></div><p className="guide-copy">{physicsOpen ? lesson.physics : focus?.description || lesson.instruction}</p>{focus && state && <dl className="instrument-values"><div><dt>Altitude</dt><dd>{number(state.altitude)} m</dd></div><div><dt>Vertical speed</dt><dd>{number(state.verticalSpeed,1)} m/s</dd></div><div><dt>Thrust command</dt><dd>{number(state.throttle*100)}%</dd></div><div><dt>Dynamic pressure</dt><dd>{number(state.dynamicPressure/1000,1)} kPa</dd></div></dl>}<a className="reference-link" href={lesson.reference} target="_blank" rel="noreferrer">Reference ↗</a></>}
      {dialog === 'crew' && state && <><div className="lesson-tabs">{(['navigator','engineer','science'] as const).map(role=><button key={role} className={crewRole===role?'selected':''} onClick={()=>setCrewRole(role)}>{role==='navigator'?'Navigator':role==='engineer'?'Engineer':'Science officer'}</button>)}</div><p className="guide-copy">{crewRole==='navigator'?conciseGuidance(state,mode):crewRole==='engineer'?(state.event&&!state.eventResolved?`${state.event}. Isolate the affected system before resuming the experiment.`:`Propellant ${number(state.fuel)}%. Battery ${number(state.power)}%. ${state.power<25?'Limit nonessential operations and prepare to return.':'Reserves are available. Preserve a margin for return.'}`):(state.science>=100?'Results secured. Return to the spacecraft and prepare for departure.':activity?.instruction??'Complete the destination science tasks and secure the results.')}</p><p className="setting-note">Authored crew guidance</p>{crewRole==='navigator'&&state.phase==='approach'&&<button className="primary" onClick={()=>{show(null);action('autopilot');}}>{state.autoPilot?'Take manual control':'Engage approach assistance'}</button>}</>}
      {dialog === 'credits' && <div className="credits-copy"><p>Batata Warriors</p><p>Columbia scan: Smithsonian, CC0. Saturn V and lunar module: NASA / Michael D. Carbajal. ISS: NASA VTAD and Astrobee. Earth and Moon imagery: NASA, LROC and LOLA. Launch terrain: USGS. Surface detail: Poly Haven.</p><p>Reference-based Apollo flight model and original ISS training vehicle. Modern training cockpit and reconstructed lunar cabin. Simplified orbital planes, atmosphere, thermal model and procedures. Original visual models are not certified spacecraft replicas.</p><p>AI-assisted code and original model development. NASA and credited third-party imagery are identified in the asset record. Guidance is authored text, with optional browser-generated speech and credited archival audio. No LLM or Azure service is used.</p><a href="https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/" target="_blank" rel="noreferrer">Flight physics references ↗</a><br /><a href="https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/" target="_blank" rel="noreferrer">Space Mission Design Game challenge ↗</a><br /><a href="/assets/credits.json" target="_blank" rel="noreferrer">Asset credits ↗</a><br /><a href="/source.zip" download>Source code (ZIP)</a></div>}
    </section></div>}
  </div>;
}
