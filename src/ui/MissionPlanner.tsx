import React, { useState, useRef, useEffect } from 'react';
import { evaluatePlan, type Plan } from '../game/simulation';
import { fetchLaunchWeather, LAUNCH_SITES } from '../game/environment';
import { Icon } from './icons';

type Props = { plan: Plan; setPlan: (fn:(p:Plan)=>Plan)=>void; ready:boolean; error:string; start:()=>void; show:(dialog:'settings'|'controls'|'credits')=>void; renderer?:string };
export function MissionPlanner({plan,setPlan,ready,error,start,show,renderer}:Props) {
  const [tab,setTab]=useState<'mission'|'vehicle'|'environment'>('mission');
  const [weatherLoading,setWeatherLoading]=useState(false);
  const [weatherMessage,setWeatherMessage]=useState('');
  const r=evaluatePlan(plan);
  const lunar=plan.destination==='moon';
  const change=<K extends keyof Plan>(key:K,value:Plan[K])=>setPlan(p=>({...p,[key]:value}));
  const weatherRequest=useRef<AbortController|null>(null);
  useEffect(()=>()=>weatherRequest.current?.abort(),[]);
  function cancelWeather(){weatherRequest.current?.abort();weatherRequest.current=null;setWeatherLoading(false);setWeatherMessage('');}
  async function liveWeather(){
    weatherRequest.current?.abort();const controller=new AbortController();weatherRequest.current=controller;
    const site=plan.launchSite??'lc39a';setWeatherLoading(true);setWeatherMessage('');
    try{
      const snapshot=await fetchLaunchWeather(site,controller.signal);
      if(controller.signal.aborted||weatherRequest.current!==controller)return;
      setPlan(p=>(p.launchSite??'lc39a')===snapshot.site?({...p,weather:snapshot.weather,weatherSnapshot:snapshot,launchTime:snapshot.status==='live'?new Date().toISOString():p.launchTime}):p);
      setWeatherMessage(snapshot.status==='live'?`Weather model · ${snapshot.temperatureC?.toFixed(0)}°C · ${snapshot.windMs.toFixed(1)} m/s · observed ${new Date(snapshot.observedAt!).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:snapshot.message);
    }catch{if(!controller.signal.aborted)setWeatherMessage('Weather unavailable. Preset retained.');}
    finally{if(weatherRequest.current===controller){weatherRequest.current=null;setWeatherLoading(false);}}
  }

  return <>
    <header className="menu-header"><a className="wordmark" href="/" aria-label="Beyond home"><span className="brand-orbit"/>BEYOND</a><span className="team-label">BATATA WARRIORS</span><button className="menu-settings" onClick={()=>show('settings')}><Icon name="settings"/><span>Settings</span></button></header>
    <main className="flight-setup">
      <div className="setup-heading"><h1>Mission setup</h1></div>
      <nav className="planner-tabs" aria-label="Mission planning"><button aria-current={tab==='mission'?'step':undefined} onClick={()=>setTab('mission')}>01 <span>Mission</span></button><button aria-current={tab==='vehicle'?'step':undefined} onClick={()=>setTab('vehicle')}>02 <span>Vehicle</span></button><button aria-current={tab==='environment'?'step':undefined} onClick={()=>setTab('environment')}>03 <span>Launch</span></button></nav>
      <form onSubmit={e=>{e.preventDefault();if(ready&&r.valid&&!error)start();}}>
        <section className="planner-content" hidden={tab!=='mission'}>
          <fieldset><legend>Destination</legend><div className="destination-cards">
            <button type="button" aria-label="ISS" aria-pressed={!lunar} onClick={()=>setPlan(p=>({...p,destination:'iss',payload:'biology',launcher:'orbital'}))}><span className="mission-illustration station-icon"><i/><i/><i/></span><span className="destination-copy"><strong>ISS</strong><small>Orbital research</small></span><span className="selection-dot"/></button>
            <button type="button" aria-label="Moon" aria-pressed={lunar} onClick={()=>setPlan(p=>({...p,destination:'moon',payload:'geology',launcher:'saturnv'}))}><span className="mission-illustration moon-icon"/><span className="destination-copy"><strong>Moon</strong><small>Surface expedition</small></span><span className="selection-dot"/></button>
          </div></fieldset>
          <div className="mission-brief"><span>OBJECTIVE</span><p>{lunar?'Land, deploy instruments, collect samples, and return to Earth.':'Dock, operate a microgravity experiment, and return the results to Earth.'}</p></div>
          <div className="field-grid"><label className="field">Difficulty<select aria-label="Difficulty" value={plan.difficulty} onChange={e=>change('difficulty',e.target.value as Plan['difficulty'])}><option value="cadet">Cadet · beginner</option><option value="commander">Commander · intermediate</option><option value="expert">Expert</option></select></label><label className="field">Start<select aria-label="Start location" value={plan.startMode} onChange={e=>change('startMode',e.target.value as Plan['startMode'])}><option value="pad">Full mission · launchpad</option><option value="approach">{lunar?'Practice · lunar descent':'Practice · station approach'}</option></select></label></div>
          <p className="setting-note">{plan.difficulty==='cadet'?'Step-by-step guidance and optional training pauses.':plan.difficulty==='commander'?'On-demand guidance. Reduced resource margins.':'Manual approach. Guidance available on request.'}</p>
          <button type="button" className="text-next" onClick={()=>setTab('vehicle')}>Configure vehicle <Icon name="arrow" size={15}/></button>
        </section>
        <section className="planner-content" hidden={tab!=='vehicle'}>
          <div className="field-grid"><label className="field">Cabin<select aria-label="Cabin" value={plan.vehicle??'modern'} onChange={e=>change('vehicle',e.target.value as Plan['vehicle'])}><option value="modern">Modern training cockpit</option><option value="heritage">Apollo reference cockpit</option></select></label><label className="field">Science payload<select value={plan.payload} aria-label="Payload" onChange={e=>change('payload',e.target.value as Plan['payload'])}><option value={lunar?'geology':'biology'}>{lunar?'Geology · 230 kg':'Biology · 160 kg'}</option><option value="imaging">Imaging · 120 kg</option></select></label></div>
          <label className="field">Launch vehicle<select aria-label="Launch vehicle" value={plan.launcher??(lunar?'saturnv':'orbital')} onChange={e=>change('launcher',e.target.value as Plan['launcher'])}><option value="orbital">Orbital trainer · ISS</option><option value="saturnv">Saturn V reference · Moon</option></select></label>
          <p className="vehicle-model">{lunar?'Saturn V / Apollo flight model · separate lunar lander':'Two-stage orbital trainer · original vehicle'}</p>
          <div className="equipment-list">
            <label><span><strong>Full propellant reserve</strong><small>More maneuver margin · +280 kg / 11 credits</small></span><input type="checkbox" checked={plan.extraFuel} onChange={e=>change('extraFuel',e.target.checked)}/></label>
            <label><span><strong>Backup battery</strong><small>More electrical reserve · +130 kg / 9 credits</small></span><input type="checkbox" checked={plan.extraBattery} onChange={e=>change('extraBattery',e.target.checked)}/></label>
            <label><span><strong>Redundant radio</strong><small>Communication resilience · +90 kg / 8 credits</small></span><input type="checkbox" checked={plan.communications==='redundant'} onChange={e=>change('communications',e.target.checked?'redundant':'standard')}/></label>
            <label><span><strong>Instrument shielding</strong><small>Lower radiation-fault recovery cost · +210 kg / 13 credits</small></span><input type="checkbox" checked={plan.shielding} onChange={e=>change('shielding',e.target.checked)}/></label>
          </div>
          <p className="setting-note">{plan.payload==='imaging'?'A lighter camera payload uses more electrical power. Site documentation accompanies the destination’s core science tasks.':lunar?'Geology adds mass; the returned sample provides the mission’s scientific result.':'Biology adds a powered experiment; protect reserves for both research and return.'}</p>
          <button type="button" className="text-next" onClick={()=>setTab('environment')}>Set launch conditions <Icon name="arrow" size={15}/></button>
        </section>
        <section className="planner-content" hidden={tab!=='environment'}>
          <label className="field">Launch site<select aria-label="Launch site" value={plan.launchSite??'lc39a'} onChange={e=>{cancelWeather();change('launchSite',e.target.value as Plan['launchSite']);change('weatherSnapshot',undefined);}}>{Object.entries(LAUNCH_SITES).map(([id,site])=><option key={id} value={id}>{site.name}</option>)}</select></label>
          <div className="field-grid"><label className="field">Weather<select aria-label="Weather" value={plan.weather} onChange={e=>{cancelWeather();setPlan(p=>({...p,weather:e.target.value as Plan['weather'],weatherSnapshot:undefined}));}}><option value="clear">Clear</option><option value="overcast">Overcast</option><option value="crosswind">Crosswind</option></select></label><label className="field">Launch time · UTC<input aria-label="Launch time UTC" type="datetime-local" value={(plan.launchTime??'2026-11-15T17:00:00Z').slice(0,16)} onChange={e=>{if(e.target.value)change('launchTime',e.target.value+':00Z');}}/></label></div>
          <div className="weather-tools"><button type="button" className="secondary" disabled={weatherLoading} onClick={()=>void liveWeather()}>{weatherLoading?'Checking weather…':'Use current site weather'}</button><button type="button" className="secondary" onClick={()=>change('launchTime',new Date().toISOString())}>Current time</button></div>
          <p className="setting-note" role="status">{weatherMessage||'Weather presets are simulated. Current conditions require a connection.'}</p>
          <p className="setting-note">Launch complex geometry and orbital planes are simplified. Time sets solar lighting; it does not select a real launch window.</p>
        </section>
        <section className="readiness" aria-label="Design constraints"><div className="readiness-title"><span>DESIGN CHECK</span><span className={r.valid?'status-good':'status-warn'}>{r.valid?'Ready':'Review configuration'}</span></div><div className="budget-grid">{[{label:'Design mass',value:r.mass,max:2800,unit:'kg'},{label:'Budget',value:r.cost,max:100,unit:'cr'}].map(m=><div key={m.label}><span>{m.label}<b>{m.value.toLocaleString()} <em>/ {m.max.toLocaleString()} {m.unit}</em></b></span><meter min="0" max={m.max} value={m.value} className={m.value>m.max?'over':''}/></div>)}</div><div className="design-summary"><span className={r.power>r.powerCapacity?'status-warn':''}>Power <b>{r.power.toLocaleString()} / {r.powerCapacity.toLocaleString()} W</b></span><span>Science data <b>{r.dataMb} MB</b></span></div></section>
        {!r.valid&&<p className="validation-error" role="alert">{r.warnings.join(' ')}</p>}
        <button type="submit" className="primary launch-button" disabled={!ready||!r.valid||!!error}><span>{error?'Graphics unavailable':ready?'Start flight':'Loading spacecraft…'}</span><Icon name="arrow" size={20}/></button>
      </form>
      <div className="setup-links"><button onClick={()=>show('controls')}>Controls</button><button onClick={()=>show('credits')}>Sources & credits</button><a href="/presentation.html" target="_blank" rel="noreferrer">Presentation ↗</a></div>
    </main>
    <aside className="launch-location"><span className="eyebrow">KENNEDY SPACE CENTER</span><strong>{plan.launchSite==='lc39b'?'Launch complex 39B':'Launch complex 39A'}</strong><span>FLORIDA, UNITED STATES</span></aside>
    <footer className="menu-footer"><span><i/>{renderer??'INITIALIZING GRAPHICS'}</span><span>NASA SPACE APPS · 2026</span><span>KEYBOARD + MOUSE</span></footer>
  </>;
}
