import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";

/** Eases a number towards `target` on the JS thread (the tree is re-drawn per frame). */
export function useTween(target: number, duration: number) {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const frame = useRef<number | null>(null);
  const run = useCallback(
    (from: number, to: number, ms: number) => {
      if (frame.current) cancelAnimationFrame(frame.current);
      if (reduced || ms <= 0 || Math.abs(to - from) < 0.002) {
        valueRef.current = to;
        setValue(to);
        return;
      }
      const start = Date.now();
      let lastPaint = 0;
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / ms);
        const next = from + (to - from) * (1 - Math.pow(1 - t, 3));
        valueRef.current = next;
        // ~30 fps is plenty for growth and keeps the SVG work light.
        if (t === 1 || Date.now() - lastPaint > 32) {
          lastPaint = Date.now();
          setValue(next);
        }
        if (t < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [reduced],
  );
  useEffect(() => {
    run(valueRef.current, target, duration);
  }, [target, duration, run]);
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );
  const targetRef = useRef(target);
  targetRef.current = target;
  const replay = useCallback((ms: number) => run(0, targetRef.current, ms), [run]);
  const jump = useCallback((v: number) => run(v, v, 0), [run]);
  return { value, replay, jump };
}
