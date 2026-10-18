/**
 * Dev-only switch that opens the real update sheet (components/AppGate.tsx)
 * with the CMS's current text, so its look can be checked without bumping
 * `latestVersion` for every user. Closing the preview stores nothing, so the
 * real prompt behaves exactly as before. Nothing calls `showUpdatePreview()`
 * by default; call it from a dev-only button or the console when needed.
 */
import { useSyncExternalStore } from "react";

let open = false;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

export const showUpdatePreview = () => set(true);
export const hideUpdatePreview = () => set(false);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useUpdatePreview(): boolean {
  return useSyncExternalStore(subscribe, () => open, () => false);
}
