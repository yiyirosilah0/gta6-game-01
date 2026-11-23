// Meridian Heat — sound, all synthesized with WebAudio: no audio files, no
// network. Engine hum follows the car's speed, a two-tone siren plays while the
// police are close, and short blips mark pickups, punches and mission wins.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;
  let muted = false;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 720;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, cutoff) {
    if (!ctx || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff || 900;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  return {
    unlock,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
    /** Called every frame: engine follows speed, siren follows the chase. */
    update(dt, speedRatio, sirenOn) {
      if (!ctx) return;
      if (engineOsc && engineGain) {
        engineGain.gain.value = muted ? 0 : 0.05 + 0.075 * speedRatio;
        engineOsc.frequency.value = 50 + 130 * speedRatio;
        engineOsc2.frequency.value = 26 + 60 * speedRatio;
      }
      if (sirenOsc && sirenGain) {
        sirenTimer += dt;
        if (sirenTimer > 0.42) {
          sirenTimer = 0;
          sirenHigh = !sirenHigh;
          sirenOsc.frequency.value = sirenHigh ? 950 : 700;
        }
        sirenGain.gain.value = muted || !sirenOn ? 0 : 0.045;
      }
    },
    blip() { tone(880, 0.12, 'sine', 0.22); tone(1320, 0.1, 'sine', 0.14, 0.08); },
    punch() { noise(0.12, 0.3, 500); tone(120, 0.1, 'triangle', 0.25); },
    crash() { noise(0.25, 0.35, 700); },
    steal() { tone(520, 0.09, 'square', 0.12); tone(660, 0.12, 'square', 0.12, 0.09); },
    jingle() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, i * 0.11));
    },
    busted() { [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, i * 0.16)); },
  };
}
