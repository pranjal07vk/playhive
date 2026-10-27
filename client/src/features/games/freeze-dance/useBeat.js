import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * A tiny original groove made with the Web Audio API: kick on every beat,
 * hi-hat on the off-beats and a bouncy bass line. No audio files.
 * Browsers only allow sound after a tap, so enable() must be called from a
 * click handler. Sound plays only while `active` is true (the dancing phase).
 */
const STEPS = 16;
// Bass line in semitones above A1 (55 Hz); null = rest.
const BASS = [0, null, null, 0, null, null, 7, null, 5, null, 3, 0, null, null, 10, null];
const LOOKAHEAD = 0.12; // seconds of audio scheduled ahead
const TICK_MS = 25;

function createEngine() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return { ctx, master, noise, timer: null, step: 0, nextTime: 0 };
}

function kick(e, t) {
  const osc = e.ctx.createOscillator();
  const gain = e.ctx.createGain();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  gain.gain.setValueAtTime(0.9, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(gain).connect(e.master);
  osc.start(t);
  osc.stop(t + 0.32);
}

function hat(e, t, level) {
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  const filter = e.ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 7000;
  const gain = e.ctx.createGain();
  gain.gain.setValueAtTime(level, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  src.connect(filter).connect(gain).connect(e.master);
  src.start(t);
  src.stop(t + 0.06);
}

function bass(e, t, semitones, length) {
  const osc = e.ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = 55 * 2 ** (semitones / 12);
  const filter = e.ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 650;
  const gain = e.ctx.createGain();
  gain.gain.setValueAtTime(0.28, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(filter).connect(gain).connect(e.master);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function start(e, bpm) {
  if (e.timer) return;
  const sixteenth = 60 / bpm / 4;
  const now = e.ctx.currentTime;
  e.master.gain.cancelScheduledValues(now);
  e.master.gain.setValueAtTime(0, now);
  e.master.gain.linearRampToValueAtTime(0.7, now + 0.05);
  e.step = 0;
  e.nextTime = now + 0.05;
  const schedule = () => {
    while (e.nextTime < e.ctx.currentTime + LOOKAHEAD) {
      const s = e.step;
      if (s % 4 === 0) kick(e, e.nextTime);
      if (s % 4 === 2) hat(e, e.nextTime, 0.3);
      else if (s % 2 === 1) hat(e, e.nextTime, 0.1);
      if (BASS[s] !== null) bass(e, e.nextTime, BASS[s], sixteenth * 1.6);
      e.nextTime += sixteenth;
      e.step = (s + 1) % STEPS;
    }
  };
  schedule();
  e.timer = setInterval(schedule, TICK_MS);
}

// Cut the music instantly (it is a freeze, after all).
function stop(e) {
  if (e.timer) clearInterval(e.timer);
  e.timer = null;
  const now = e.ctx.currentTime;
  e.master.gain.cancelScheduledValues(now);
  e.master.gain.setValueAtTime(e.master.gain.value, now);
  e.master.gain.linearRampToValueAtTime(0, now + 0.03);
}

export function useBeat(active, bpm = 118) {
  const engine = useRef(null);
  const [on, setOn] = useState(false);
  const supported = typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext);

  const enable = useCallback(() => {
    if (!engine.current) engine.current = createEngine();
    if (!engine.current) return;
    engine.current.ctx.resume();
    setOn(true);
  }, []);
  const disable = useCallback(() => setOn(false), []);

  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    if (on && active) start(e, bpm);
    else stop(e);
  }, [on, active, bpm]);

  useEffect(
    () => () => {
      const e = engine.current;
      if (!e) return;
      if (e.timer) clearInterval(e.timer);
      e.ctx.close();
      engine.current = null;
    },
    [],
  );

  return { on, supported, enable, disable };
}
