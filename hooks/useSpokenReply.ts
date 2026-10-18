import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { speechApi, type LanguageCode } from "../lib/api";
import { releaseAudioUri, resolveAudioUri } from "../lib/audio";
import { cleanForSpeech, splitForSpeech } from "../lib/voiceSpeech";

type Prepared = { player: AudioPlayer; uri: string };

/** Longest a single chunk may play before we move on (a stuck player must not hang voice mode). */
const CHUNK_WATCHDOG_MS = 45_000;

/**
 * Speaks a reply out loud through Sarvam TTS (`speechApi.synthesize`), a
 * sentence-sized chunk at a time (lib/voiceSpeech.ts): chunk 1 is
 * synthesized and starts playing while chunk 2 is being made and loaded, so
 * the voice starts after one short request instead of after the whole
 * answer. `stop()` cuts it off at once (barge-in, leaving voice mode,
 * tapping the same message again).
 *
 * Before playing it switches the audio session out of recording mode:
 * on iOS a session that allows recording plays through the quiet earpiece,
 * and `playsInSilentMode` keeps replies audible with the ring switch off.
 */
export function useSpokenReply(language: LanguageCode) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const runRef = useRef(0);
  const liveRef = useRef(new Set<Prepared>());
  const finishRef = useRef<(() => void) | null>(null);

  const dispose = useCallback((item: Prepared) => {
    liveRef.current.delete(item);
    try {
      item.player.pause();
      item.player.release();
    } catch {
      // Already released.
    }
    releaseAudioUri(item.uri);
  }, []);

  const stop = useCallback(() => {
    runRef.current += 1;
    liveRef.current.forEach(dispose);
    finishRef.current?.();
    finishRef.current = null;
    setPlayingId(null);
    setPreparingId(null);
  }, [dispose]);

  useEffect(() => stop, [stop]);

  const prepare = useCallback(
    async (text: string, run: number): Promise<Prepared | null> => {
      const { audioBase64, audioCodec } = await speechApi.synthesize({ languageCode: language, text });
      const uri = await resolveAudioUri(audioBase64, audioCodec);
      if (run !== runRef.current) {
        releaseAudioUri(uri);
        return null;
      }
      // Created now so it loads while the previous chunk is still playing.
      const item = { player: createAudioPlayer({ uri }), uri };
      liveRef.current.add(item);
      return item;
    },
    [language],
  );

  const play = useCallback(
    (item: Prepared) =>
      new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(watchdog);
          subscription.remove();
          if (finishRef.current === finish) finishRef.current = null;
          resolve();
        };
        const watchdog = setTimeout(finish, CHUNK_WATCHDOG_MS);
        const subscription = item.player.addListener("playbackStatusUpdate", (status) => {
          if (status.didJustFinish) finish();
        });
        finishRef.current = finish;
        item.player.play();
      }),
    [],
  );

  /** Resolves when the reply has finished (or was stopped). Throws only if nothing could be played. */
  const speak = useCallback(
    async (id: string, text: string) => {
      stop();
      const run = runRef.current;
      const chunks = splitForSpeech(cleanForSpeech(text));
      if (chunks.length === 0) return;
      setPreparingId(id);
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});

      let next: Promise<Prepared | null> | null = prepare(chunks[0], run);
      let started = false;
      try {
        for (let index = 0; index < chunks.length && next; index += 1) {
          let item: Prepared | null;
          try {
            item = await next;
          } catch (error) {
            // A later chunk failing just ends the reply early; the first one is a real error.
            if (!started) throw error;
            break;
          }
          next = index + 1 < chunks.length ? prepare(chunks[index + 1], run) : null;
          // Keep a rejected prefetch from surfacing as an unhandled rejection.
          next?.catch(() => {});
          if (!item || run !== runRef.current) return;
          if (!started) {
            started = true;
            setPreparingId(null);
            setPlayingId(id);
          }
          await play(item);
          dispose(item);
          if (run !== runRef.current) return;
        }
      } finally {
        if (run === runRef.current) {
          setPlayingId(null);
          setPreparingId(null);
        }
      }
    },
    [dispose, play, prepare, stop],
  );

  return { speak, stop, playingId, preparingId };
}
