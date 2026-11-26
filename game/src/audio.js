// Canyon Courier — procedural WebAudio. One job: engine hum, wind, ring chime, landing thud.
// No audio files: every sound is synthesized, and the engine pitch follows the throttle.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let unlocked = false;

  function unlock() {
    if (unlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      unlocked = true;
      // Engine: two detuned saws through a lowpass, gain follows throttle.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 62;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 93;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(lp);
      engineOsc2.connect(lp);
      lp.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise buffer through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSource = ctx.createBufferSource();
      windSource.buffer = buf;
      windSource.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSource.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSource.start();
    } catch {
      ctx = null;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  // Called every frame while flying: engine pitch + wind loudness follow speed and throttle.
  function setEngine(throttle, speed, inThermal) {
    if (!ctx || muted) return;
    resume();
    const t = ctx.currentTime;
    const freq = 58 + throttle * 66 + (inThermal ? -6 : 0);
    engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
    engineOsc2.frequency.setTargetAtTime(freq * 1.5, t, 0.08);
    engineGain.gain.setTargetAtTime(0.02 + throttle * 0.05, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0011), t, 0.15);
    windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function ring() {
    blip(880, 0.35, 'sine', 0.16);
    blip(1318, 0.5, 'sine', 0.12, 0.08);
  }

  function drop() {
    blip(520, 0.2, 'triangle', 0.14);
    blip(340, 0.3, 'triangle', 0.1, 0.1);
  }

  function thud() {
    blip(70, 0.4, 'sine', 0.3);
    blip(45, 0.5, 'sine', 0.2, 0.05);
  }

  function crash() {
    blip(90, 0.7, 'sawtooth', 0.22);
    blip(55, 0.9, 'sine', 0.25, 0.1);
  }

  function click() {
    blip(660, 0.08, 'square', 0.06);
  }

  function setMuted(value) {
    muted = value;
    if (ctx) {
      const t = ctx.currentTime;
      if (engineGain) engineGain.gain.setTargetAtTime(0, t, 0.05);
      if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  function silence() {
    if (ctx) {
      const t = ctx.currentTime;
      if (engineGain) engineGain.gain.setTargetAtTime(0, t, 0.05);
      if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  return { unlock, resume, setEngine, ring, drop, thud, crash, click, setMuted, silence, isMuted: () => muted };
}
