import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightAudio } from '../src/game/audio';
import { createMission } from '../src/game/simulation';

/** These browser-boundary tests observe API calls, not actual sound output. */
async function browser(run: (h: ReturnType<typeof installBrowser>) => Promise<void> | void) {
  const harness=installBrowser();
  try { await run(harness); } finally { harness.restore(); }
}
function installBrowser() {
  const previous=new Map<string,PropertyDescriptor|undefined>();
  const set=(key:string,value:unknown)=>{previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
  const spoken:string[]=[],players:FakeAudio[]=[],contexts:FakeContext[]=[],instances:FlightAudio[]=[];
  let cancellations=0,rejectPlayback=false;
  class Param { value=0; setTargetAtTime(value:number){this.value=value;} setValueAtTime(value:number){this.value=value;} exponentialRampToValueAtTime(value:number){this.value=value;} }
  class Node { started=0;stopped=0;disconnected=false;onended:(()=>void)|null=null;buffer:unknown;loop=false;type='';frequency=new Param();gain=new Param();connect<T>(target:T){return target;}disconnect(){this.disconnected=true;}start(){this.started++;}stop(){this.stopped++;} }
  class FakeContext {
    sampleRate=1000;currentTime=0;state='suspended';destination=new Node();sources:Node[]=[];oscillators:Node[]=[];gains:Node[]=[];
    constructor(){contexts.push(this);}
    createBuffer(_channels:number,size:number){const data=new Float32Array(size);return{getChannelData:()=>data};}
    createBufferSource(){const node=new Node();this.sources.push(node);return node;}
    createBiquadFilter(){return new Node();}
    createGain(){const node=new Node();this.gains.push(node);return node;}
    createOscillator(){const node=new Node();this.oscillators.push(node);return node;}
    async resume(){this.state='running';}
    async close(){this.state='closed';}
  }
  class FakeSpeech {lang='';rate=1;pitch=1;volume=1;voice:unknown;onend:(()=>void)|null=null;onerror:(()=>void)|null=null;constructor(public text:string){} }
  class FakeAudio extends EventTarget {
    volume=1;currentTime=0;paused=false;playCalls=0;
    constructor(public src:string){super();players.push(this);}
    async play(){this.playCalls++;if(rejectPlayback)throw new Error('Decoder unavailable');}
    pause(){this.paused=true;}
  }
  set('AudioContext',FakeContext);set('SpeechSynthesisUtterance',FakeSpeech);set('Audio',FakeAudio);
  set('window',{speechSynthesis:{getVoices:()=>[{lang:'en-US',localService:true}],speak:(utterance:FakeSpeech)=>spoken.push(utterance.text),cancel:()=>{cancellations++;}}});
  set('fetch',async()=>new Response(JSON.stringify({liftoff:{src:'/assets/radio/test.ogg',caption:'Liftoff confirmed.',credit:'Fixture',source:'Test fixture'}})));
  return {spoken,players,contexts,get cancellations(){return cancellations;},setRejectPlayback:(value:boolean)=>{rejectPlayback=value;},
    audio:()=>{const instance=new FlightAudio();instances.push(instance);return instance;},
    settle:()=>new Promise<void>(resolve=>setImmediate(resolve)),
    restore:()=>{for(const instance of instances)instance.dispose();for(const[key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}},
  };
}
const flight=()=>createMission({destination:'iss',difficulty:'cadet',payload:'biology',extraFuel:true,extraBattery:true,shielding:false});

test('voice and effects switches operate independently',async()=>browser(async h=>{
  const audio=h.audio();await audio.start();audio.enabled=false;
  assert.equal(audio.speak('Navigation ready.'),true);audio.click();assert.deepEqual(h.spoken,['Navigation ready.']);assert.equal(h.contexts[0].oscillators.length,0);
  audio.enabled=true;audio.voice=false;assert.equal(audio.speak('Muted voice'),false);audio.click();assert.equal(h.contexts[0].oscillators.length,1);
}));
test('pause and disposal cancel active speech and archival playback',async()=>browser(async h=>{
  const audio=h.audio();await audio.start();await h.settle();audio.speak('Approaching station.');
  audio.update(flight(),true);assert.equal(h.cancellations,1);
  audio.update(flight(),false);assert.ok(audio.playRadio('liftoff'));const player=h.players.at(-1)!;player.dispatchEvent(new Event('loadedmetadata'));assert.equal(player.playCalls,1);
  audio.update(flight(),true);assert.equal(player.paused,true);
  audio.speak('Guidance while paused.');audio.dispose();assert.equal(h.cancellations,2);assert.equal(h.contexts[0].state,'closed');assert.equal(h.contexts[0].sources[0].stopped,1);
}));
test('frame updates announce each countdown number once and suppress paused speech',async()=>browser(async h=>{
  const audio=h.audio();await audio.start();const state=flight();state.ignited=true;state.countdown=5;
  for(let i=0;i<60;i++)audio.update(state,false);
  state.countdown=4.8;audio.update(state,false);state.countdown=4;audio.update(state,false);audio.update(state,false);
  assert.deepEqual(h.spoken,['5','4']);state.countdown=3;audio.update(state,true);assert.deepEqual(h.spoken,['5','4']);
}));
test('archival decoder or playback rejection falls back to its caption',async()=>browser(async h=>{
  const audio=h.audio();await h.settle();assert.ok(audio.playRadio('liftoff'));h.players.at(-1)!.dispatchEvent(new Event('error'));assert.deepEqual(h.spoken,['Liftoff confirmed.']);
  h.setRejectPlayback(true);assert.ok(audio.playRadio('liftoff'));h.players.at(-1)!.dispatchEvent(new Event('loadedmetadata'));await h.settle();assert.deepEqual(h.spoken,['Liftoff confirmed.','Liftoff confirmed.']);
}));
test('late archival failures cannot restart speech after cancellation',async()=>browser(async h=>{
  const audio=h.audio();await h.settle();audio.playRadio('liftoff');const player=h.players.at(-1)!;audio.silence();player.dispatchEvent(new Event('error'));player.dispatchEvent(new Event('loadedmetadata'));await h.settle();assert.deepEqual(h.spoken,[]);assert.equal(player.playCalls,0);
}));
test('movement is silent when seated, paused, idle or effects-muted and resumes on movement',async()=>browser(async h=>{
  const audio=h.audio();await audio.start();const ctx=h.contexts[0],baseline=ctx.sources.length;
  audio.movement('seated',1,1);audio.movement('eva',0,1);assert.equal(ctx.sources.length,baseline);
  audio.movement('eva',1,.3);assert.equal(ctx.sources.length,baseline);audio.movement('eva',1,.5);assert.equal(ctx.sources.length,baseline+1);
  audio.update(flight(),true);audio.movement('eva',1,1);assert.equal(ctx.sources.length,baseline+1);
  audio.update(flight(),false);audio.enabled=false;audio.movement('station',1,1);assert.equal(ctx.sources.length,baseline+1);
  audio.enabled=true;audio.voice=false;audio.movement('station',1,.7);assert.equal(ctx.sources.length,baseline+2);
  audio.movement('station',NaN,1);audio.movement('station',1,NaN);assert.equal(ctx.sources.length,baseline+2);
}));
test('engine effects gain responds to thrust and becomes zero when paused or effects-muted',async()=>browser(async h=>{
  const audio=h.audio();await audio.start();const state=flight();state.countdown=0;state.throttle=1;state.trajectory.landed=false;
  audio.update(state,false);const gain=h.contexts[0].gains[0].gain;assert.ok(gain.value>.3);
  audio.update(state,true);assert.equal(gain.value,0);audio.enabled=false;audio.update(state,false);assert.equal(gain.value,0);
}));
test('missing browser speech capability preserves caption fallback without throwing',async()=>browser(async h=>{
  const audio=h.audio();const old=(globalThis as {window?:unknown}).window;
  Object.defineProperty(globalThis,'window',{value:{},configurable:true,writable:true});
  assert.equal(audio.speak('Caption only.'),false);assert.doesNotThrow(()=>audio.silence());
  Object.defineProperty(globalThis,'window',{value:old,configurable:true,writable:true});
}));
