import { showAlert } from "./modal-host";
import { getFriendlyErrorMessage } from "./api";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

/**
 * App-wide replacement for Alert.alert. Renders a themed modal (via
 * AppModalHost, mounted once in app/_layout.tsx) instead of the native
 * dialog, so every call site gets consistent styling on iOS, Android, and
 * web — react-native-web's Alert.alert is a no-op, so this used to silently
 * do nothing on web before this shim existed.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  const normalized = buttons?.map((button) => ({
    text: button.text ?? "OK",
    onPress: button.onPress,
    style: button.style,
  }));

  showAlert(title, message, normalized);
}

/**
 * A day log the server didn't accept. The entry still shows on screen, but on
 * a phone that copy lives only in memory, so saying nothing meant a log made
 * offline quietly vanished on the next launch.
 */
export function alertLogNotSaved(err: unknown) {
  alert("Log not saved", `${getFriendlyErrorMessage(err)}\nPlease try saving it again.`);
}
