import type { State } from './simulation';

export interface RadioRecording { src: string; caption: string; credit: string; source: string; start?: number; end?: number; }
/** Cabin/engine synthesis, source-credited mission recordings, and optional
 * browser speech of authored captions. No language model service is used. */
export class FlightAudio {
  private context: AudioContext | null = null;
  private noise: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private radio: HTMLAudioElement | null = null;
  private clips: Record<string, RadioRecording> = {};
  private stopRadio: ReturnType<typeof setTimeout> | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private lastCountdown = -1;
  private strideTime = 0;
  private paused = false;
  enabled = true;
  voice = true;
  constructor() {
    void fetch('/assets/radio/manifest.json').then(r => r.ok ? r.json() : {}).then(data => { this.clips = data; }).catch(() => {});
  }
  async start() {
    try {
      if (!this.context) {
        const ctx = this.context = new AudioContext();
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const samples = buffer.getChannelData(0);
        let previous = 0;
        for (let i = 0; i < samples.length; i++) { previous = (previous + (Math.random() * 2 - 1) * .035) / 1.035; samples[i] = previous * 3.5; }
        this.noise = ctx.createBufferSource(); this.noise.buffer = buffer; this.noise.loop = true;
        this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 120;
        this.gain = ctx.createGain(); this.gain.gain.value = 0;
        this.noise.connect(this.filter).connect(this.gain).connect(ctx.destination); this.noise.start();
      }
      await this.context.resume();
    } catch { /* Captions and flight controls work without audio permission. */ }
  }
  update(state: State | null, paused: boolean) {
    if (paused && !this.paused) this.silence();
    this.paused = paused;
    if (!this.voice) this.silence();
    if (!this.context || !this.gain || !this.filter) return;
    const burning = state && state.throttle > 0 && !state.trajectory.landed && state.countdown <= 0;
    const landing = state?.phase === 'approach' && state.plan.destination === 'moon';
    const power = burning ? state!.throttle * (state!.phase === 'launch' ? 1 : .28) : landing ? state!.throttle * .3 : .018;
    this.gain.gain.setTargetAtTime(this.enabled && state && !paused && !state.ended ? .32 * power : 0, this.context.currentTime, .15);
    this.filter.frequency.setTargetAtTime(90 + power * 170, this.context.currentTime, .2);
    const countdown = state?.ignited && state.countdown > 0 ? Math.ceil(state.countdown) : -1;
    if (!paused && countdown > 0 && countdown <= 5 && countdown !== this.lastCountdown) this.speak(String(countdown));
    this.lastCountdown = countdown;
  }
  playRadio(cue: string): RadioRecording | null {
    const clip = this.clips[cue];
    if (!clip || !this.voice) return null;
    this.silence();
    const player = this.radio = new Audio(clip.src); player.volume = .85;
    const begin = () => {
      if (this.radio !== player) return;
      player.currentTime = clip.start ?? 0;
      void player.play().catch(() => { if (this.radio === player) this.speak(clip.caption); });
      if (clip.end) this.stopRadio = setTimeout(() => this.silence(), Math.max(0, clip.end - (clip.start ?? 0)) * 1000);
    };
    player.addEventListener('loadedmetadata', begin, {once:true});
    player.addEventListener('error', () => { if (this.radio === player) this.speak(clip.caption); }, {once:true});
    return clip;
  }
  /** Returns whether the browser accepted a spoken caption. Captions remain the
   * authoritative fallback when voices are missing or synthesis is blocked. */
  speak(text: string): boolean {
    if (!this.voice || !text.trim() || typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return false;
    this.silence();
    try {
      const message = this.utterance = new SpeechSynthesisUtterance(text);
      message.lang = 'en-US'; message.rate = .96; message.pitch = .95; message.volume = .85;
      const voices = window.speechSynthesis.getVoices();
      // Prefer installed voices. Some browsers expose only a network voice;
      // that remains a browser feature, independent of game state and results.
      const voice = voices.find(v => /^en(-|_)/i.test(v.lang) && v.localService) ?? voices.find(v => /^en(-|_)/i.test(v.lang));
      if (voice) message.voice = voice;
      message.onend = message.onerror = () => { if (this.utterance === message) this.utterance = null; };
      window.speechSynthesis.speak(message);
      return true;
    } catch { this.utterance = null; return false; }
  }
  /** Suit-transmitted footsteps/rustle, not sound propagating through vacuum. */
  movement(mode:string,amount:number,dt:number) {
    if(!this.enabled||this.paused||!this.context||this.context.state!=='running'||mode==='seated'||!Number.isFinite(amount)||amount<.1||!Number.isFinite(dt)||dt<=0){this.strideTime=0;return;}
    this.strideTime+=dt;
    const period=mode==='eva'?.75:.6;
    if(this.strideTime<period)return;
    this.strideTime=0;
    const ctx=this.context,now=ctx.currentTime,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.14),ctx.sampleRate),samples=buffer.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*(1-i/samples.length);
    const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=mode==='eva'?260:700;gain.gain.setValueAtTime(mode==='station'?.012:.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+.14);source.connect(filter).connect(gain).connect(ctx.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  /** Short cockpit confirmation tone; never depends on a downloaded audio file. */
  click() {
    if (!this.enabled || !this.context || this.context.state !== 'running') return;
    const oscillator = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(880, now); oscillator.frequency.exponentialRampToValueAtTime(660, now + .055);
    gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .065);
    oscillator.connect(gain).connect(this.context.destination); oscillator.start(); oscillator.stop(now + .07);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  silence() { if (this.stopRadio) clearTimeout(this.stopRadio); this.stopRadio = null; this.radio?.pause(); this.radio = null; if (this.utterance && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel(); this.utterance = null; }
  dispose() { this.silence(); this.noise?.stop(); void this.context?.close(); }
}
