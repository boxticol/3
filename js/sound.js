// Sonido de "clic" de la rueda, generado con Web Audio (sin archivos).
let ctx = null;
let buffer = null;
let enabled = localStorage.getItem('ipod.clicker') !== 'off';

export const isEnabled = () => enabled;
export function setEnabled(on) {
  enabled = on;
  localStorage.setItem('ipod.clicker', on ? 'on' : 'off');
}

/** Llamar en el primer gesto del usuario (política de autoplay). */
export function unlock() {
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = Math.floor(ctx.sampleRate * 0.004);
      buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    ctx = null;
  }
}

export function click() {
  if (!enabled || !ctx || !buffer) return;
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  src.buffer = buffer;
  filter.type = 'highpass';
  filter.frequency.value = 1800;
  gain.gain.value = 0.35;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
}
