// Ring sounds generated with the Web Audio API (no audio files needed).
let ctx: AudioContext | null = null;
let timer: number | undefined;
let current: 'ring' | 'ringback' | null = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

/** Browsers only allow sound after the user touched the page once. Call this from a click/key handler. */
export function unlockAudio() {
  const c = getCtx();
  if (c.state === 'suspended') void c.resume();
}

function tone(freqs: number[], durationMs: number, volume: number) {
  const c = getCtx();
  const now = c.currentTime;
  const end = now + durationMs / 1000;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  gain.gain.setValueAtTime(volume, end - 0.03);
  gain.gain.linearRampToValueAtTime(0, end);
  gain.connect(c.destination);
  for (const f of freqs) {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(now);
    osc.stop(end + 0.05);
  }
}

function loop(kind: 'ring' | 'ringback', periodMs: number, fn: () => void) {
  stopRingtone();
  current = kind;
  unlockAudio();
  fn();
  timer = window.setInterval(fn, periodMs);
}

/** Incoming call: 4-note melody every 2.4 s + vibration on phones. */
export function startRingtone() {
  loop('ring', 2400, () => {
    [880, 1046.5, 880, 1046.5].forEach((freq, i) =>
      window.setTimeout(() => current === 'ring' && tone([freq], 180, 0.25), i * 220),
    );
    navigator.vibrate?.([300, 150, 300]);
  });
}

/** Outgoing call: "tuuu... tuuu..." until the other side answers. */
export function startRingback() {
  loop('ringback', 5000, () => tone([440, 480], 1500, 0.12));
}

export function stopRingtone() {
  window.clearInterval(timer);
  current = null;
  navigator.vibrate?.(0);
}
