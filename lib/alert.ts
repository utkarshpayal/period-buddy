import { showAlert } from "./modal-host";

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
