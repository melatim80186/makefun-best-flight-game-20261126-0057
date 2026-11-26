// Skylark Archipelago — sound: everything is synthesised, no audio files.
// One job: engine hum, wind, and the chimes that mark a good (or bad) moment.

export function makeAudio() {
  return {
    ctx: null, master: null, engineOsc: null, engineOsc2: null,
    engineGain: null, engineFilter: null, windGain: null, windSource: null,
    muted: false, started: false,
  };
}

function ensureContext(a) {
  if (a.ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    a.ctx = new AC();
    a.master = a.ctx.createGain();
    a.master.gain.value = 0.5;
    a.master.connect(a.ctx.destination);
    // Engine: two detuned saws through a low-pass, pitch follows the throttle.
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 55;
    a.engineOsc2 = a.ctx.createOscillator();
    a.engineOsc2.type = 'sawtooth';
    a.engineOsc2.frequency.value = 82.5;
    a.engineFilter = a.ctx.createBiquadFilter();
    a.engineFilter.type = 'lowpass';
    a.engineFilter.frequency.value = 420;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0;
    a.engineOsc.connect(a.engineFilter);
    a.engineOsc2.connect(a.engineFilter);
    a.engineFilter.connect(a.engineGain);
    a.engineGain.connect(a.master);
    a.engineOsc.start();
    a.engineOsc2.start();
    // Wind: looped noise through a band-pass, loudness follows airspeed.
    const len = a.ctx.sampleRate * 2;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    a.windSource = a.ctx.createBufferSource();
    a.windSource.buffer = buf;
    a.windSource.loop = true;
    const windFilter = a.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    a.windGain = a.ctx.createGain();
    a.windGain.gain.value = 0;
    a.windSource.connect(windFilter);
    windFilter.connect(a.windGain);
    a.windGain.connect(a.master);
    a.windSource.start();
    a.started = true;
    return true;
  } catch {
    return false;
  }
}

export function unlockAudio(a) {
  if (!ensureContext(a)) return;
  if (a.ctx.state === 'suspended') a.ctx.resume();
}

// Call every frame: engine pitch follows throttle, wind follows speed.
export function updateAudio(a, plane) {
  if (!a.ctx || a.muted) return;
  const t = a.ctx.currentTime;
  const throttle = plane.onGround && plane.speed < 1 ? plane.throttle * 0.4 : plane.throttle;
  a.engineGain.gain.setTargetAtTime(0.02 + throttle * 0.10, t, 0.1);
  a.engineOsc.frequency.setTargetAtTime(48 + throttle * 70, t, 0.1);
  a.engineOsc2.frequency.setTargetAtTime(72 + throttle * 105, t, 0.1);
  a.engineFilter.frequency.setTargetAtTime(300 + throttle * 900, t, 0.1);
  a.windGain.gain.setTargetAtTime(Math.min(0.16, (plane.speed / 96) * 0.16), t, 0.15);
}

function blip(a, freq, dur, type, vol, when = 0) {
  if (!a.ctx || a.muted) return;
  const t = a.ctx.currentTime + when;
  const osc = a.ctx.createOscillator();
  const gain = a.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(a.master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export function playChime(a) {
  blip(a, 880, 0.35, 'sine', 0.22);
  blip(a, 1318, 0.5, 'sine', 0.18, 0.09);
}

export function playThud(a) {
  blip(a, 70, 0.4, 'sine', 0.4);
  blip(a, 45, 0.5, 'triangle', 0.35, 0.02);
}

export function playCrash(a) {
  blip(a, 160, 0.7, 'sawtooth', 0.3);
  blip(a, 55, 0.9, 'sine', 0.4, 0.05);
}

export function playClick(a) {
  blip(a, 660, 0.08, 'square', 0.08);
}

export function playWarning(a) {
  blip(a, 1046, 0.16, 'square', 0.1);
  blip(a, 1046, 0.16, 'square', 0.1, 0.22);
}

export function toggleMute(a) {
  a.muted = !a.muted;
  if (a.master) a.master.gain.value = a.muted ? 0 : 0.5;
  return a.muted;
}
