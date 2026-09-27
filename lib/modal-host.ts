import { Alert, Linking } from "react-native";
import type {
  AlertRequest,
  LaunchSheetRequest,
  ModalButtonSpec,
  ModalRequest,
  ModalVariant,
  PermissionRequest,
} from "../components/modals/types";

type Listener = (request: ModalRequest | null) => void;

let listener: Listener | null = null;
let nextId = 0;

/** Called once by AppModalHost on mount; never call this from screen code. */
export function registerModalListener(fn: Listener) {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

function inferVariant(buttons: ModalButtonSpec[]): ModalVariant {
  return buttons.some((b) => b.style === "destructive") ? "danger" : "default";
}

/**
 * Drop-in replacement for Alert.alert's call shape. Renders a themed modal
 * instead of the native dialog (which react-native-web stubs out entirely),
 * so this works the same on iOS, Android, and web.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: ModalButtonSpec[],
  options?: { variant?: ModalVariant; icon?: AlertRequest["icon"] },
) {
  const resolvedButtons = buttons && buttons.length > 0 ? buttons : [{ text: "OK" }];

  if (!listener) {
    // Host isn't mounted yet — fall back to native Alert so the message is
    // never silently dropped (matches this function's pre-existing behavior).
    Alert.alert(title, message, buttons);
    return;
  }

  listener({
    kind: "alert",
    id: ++nextId,
    title,
    message,
    variant: options?.variant ?? inferVariant(resolvedButtons),
    icon: options?.icon,
    buttons: resolvedButtons,
  });
}

/** Themed "needs permission" dialog with a direct path to the OS settings screen. */
export function showPermissionModal(opts: {
  title: string;
  message: string;
  icon?: PermissionRequest["icon"];
  settingsLabel?: string;
  cancelLabel?: string;
  onOpenSettings?: () => void;
  onCancel?: () => void;
}) {
  if (!listener) return;

  listener({
    kind: "permission",
    id: ++nextId,
    settingsLabel: opts.settingsLabel ?? "Open Settings",
    cancelLabel: opts.cancelLabel ?? "Not Now",
    ...opts,
  });
}

/**
 * The Coming soon / Paused sheet for a locked App CMS feature: from its tile,
 * or from the route guard (lib/launchGuard.ts) when a link points at it.
 * Returns false if the host isn't mounted yet, so the caller can decide.
 */
export function showLaunchSheet(opts: Omit<LaunchSheetRequest, "kind" | "id">): boolean {
  if (!listener) return false;
  listener({ kind: "launch", id: ++nextId, ...opts });
  return true;
}

export function dismissModal() {
  listener?.(null);
}

export function openAppSettings() {
  Linking.openSettings().catch(() => {});
}
