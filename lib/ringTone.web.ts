/**
 * A two-tone phone ring made with Web Audio (no sound file), plus a buzz on
 * devices that can vibrate. Returns a function that stops it. Browsers keep
 * audio blocked until the page has had a click or key press, so a ring on a
 * page nobody touched yet is silent (the call screen still shows).
 */
export function startRingTone(): () => void {
  const vibrate = (pattern: number[] | number) => {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      /* not supported */
    }
  };
  const Ctx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext | null = null;
  try {
    ctx = Ctx ? new Ctx() : null;
  } catch {
    ctx = null;
  }
  ctx?.resume?.().catch(() => undefined);

  const beep = (audio: AudioContext, at: number) => {
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.18, at + 0.03);
    gain.gain.setValueAtTime(0.18, at + 0.36);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    gain.connect(audio.destination);
    for (const freq of [440, 480]) {
      const osc = audio.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + 0.42);
    }
  };
  const ring = () => {
    vibrate([900, 300, 900]);
    if (!ctx || ctx.state === "closed") return;
    const now = ctx.currentTime;
    beep(ctx, now);
    beep(ctx, now + 0.6);
  };
  ring();
  const timer = window.setInterval(ring, 2400);
  return () => {
    window.clearInterval(timer);
    vibrate(0);
    ctx?.close().catch(() => undefined);
  };
}
