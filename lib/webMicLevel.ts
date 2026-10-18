/**
 * Live microphone level on web, in dBFS (about -100 quiet … 0 loud).
 * expo-audio's web recorder reports no `metering`, so voice mode's
 * "you stopped talking" detection (hooks/useVoiceInput.ts) reads this
 * instead: a second getUserMedia stream on the same mic, measured with a
 * Web Audio AnalyserNode. Native platforms never call it.
 */
type Meter = { read: () => number | undefined; stop: () => void };

export async function startWebMicLevel(): Promise<Meter | null> {
  if (typeof window === "undefined" || !navigator?.mediaDevices?.getUserMedia) return null;
  const AudioCtx: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const context = new AudioCtx();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    return {
      read: () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
        return rms > 0 ? Math.max(-100, 20 * Math.log10(rms)) : -100;
      },
      stop: () => {
        stream.getTracks().forEach((track) => track.stop());
        source.disconnect();
        void context.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}
