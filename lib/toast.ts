// App-wide toast: a short message that drops in from the top of the screen
// and hides itself. Form errors go here instead of a line under the inputs,
// so they're seen even with the keyboard up. Shown by components/ToastHost.tsx,
// mounted once in app/_layout.tsx and inline inside BottomSheet (and other
// native Modals that need it), since a native Modal draws over the root host.
// Hosts stack like lib/modal-host.ts: the newest mounted one shows the toast.
import { Alert } from "react-native";

export type ToastVariant = "error" | "success" | "info";
export type ToastRequest = { id: number; message: string; title?: string; variant: ToastVariant };
type Listener = (toast: ToastRequest) => void;

const listeners: Listener[] = [];
let nextId = 1;

export function registerToastListener(fn: Listener) {
  listeners.push(fn);
  return () => {
    const index = listeners.lastIndexOf(fn);
    if (index !== -1) listeners.splice(index, 1);
  };
}

export function showToast(message: string, options: { variant?: ToastVariant; title?: string } = {}) {
  const text = message.trim();
  if (!text) return;
  const listener = listeners[listeners.length - 1];
  if (!listener) {
    // No host mounted yet: never drop the message silently.
    Alert.alert(options.title ?? "", text);
    return;
  }
  listener({ id: nextId++, message: text, title: options.title, variant: options.variant ?? "info" });
}

/** A form or action failed: what went wrong, in one or two short sentences. */
export function showErrorToast(message: string, title?: string) {
  showToast(message, { variant: "error", title });
}
