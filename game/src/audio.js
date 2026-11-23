// Every sound in Meridian Heat is synthesized with WebAudio: no audio files,
// no network, just oscillators and filtered noise. The engine hum follows the
// car's speed, the siren is a two-tone wail near the police, and the rest are
// short blips and bursts. M mutes everything.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      // The engine: a low sawtooth whose pitch follows speed, always on.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // The siren: a sine that an LFO swings between two tones.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 750;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenLfo = ctx.createOscillator();
      sirenLfo.type = 'square';
      sirenLfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      sirenLfo.connect(lfoGain);
      lfoGain.connect(sirenOsc.frequency);
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      sirenLfo.start();
      unlocked = true;
      return true;
    } catch {
      return false;
    }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    unlock,
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    // Called every frame with the player's speed (0 on foot) and the nearest
    // cop distance (Infinity when there is no heat).
    update(speed, nearestCop) {
      if (!ctx || muted) return;
      const t = ctx.currentTime;
      engineGain.gain.setTargetAtTime(speed > 5 ? 0.05 + Math.min(0.09, speed / 4000) : 0, t, 0.1);
      engineOsc.frequency.setTargetAtTime(50 + Math.abs(speed) * 0.35, t, 0.1);
      const near = nearestCop < 600;
      sirenGain.gain.setTargetAtTime(near ? 0.05 : 0, t, 0.2);
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.25, 990);
    },
    steal() {
      blip(220, 0.18, 'square', 0.18, 110);
    },
    punch() {
      noise(0.12, 0.35, 900);
    },
    crash() {
      noise(0.3, 0.4, 700);
    },
    jingle() {
      if (!ensure() || muted) return;
      [523, 659, 784, 1047].forEach((f, i) => {
        setTimeout(() => blip(f, 0.22, 'triangle', 0.28), i * 110);
      });
    },
    sting() {
      blip(196, 0.5, 'sawtooth', 0.3, 98);
      noise(0.4, 0.25, 500);
    },
  };
}
