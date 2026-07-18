import { Alert, Platform } from "react-native";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

/**
 * react-native-web's Alert.alert is a literal no-op (`static alert() {}`), so
 * every confirm dialog and info toast in this app silently did nothing when
 * running on web. This shim matches Alert.alert's call signature so existing
 * call sites only need `Alert.alert(...)` swapped for `alert(...)`, and falls
 * back to window.alert/confirm on web. Only 1-button (info) and 2-button
 * (cancel + destructive/confirm) shapes are used anywhere in this app.
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const fullMessage = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length === 0) {
    window.alert(fullMessage);
    return;
  }

  if (buttons.length === 1) {
    window.alert(fullMessage);
    buttons[0].onPress?.();
    return;
  }

  const cancelButton = buttons.find((b) => b.style === "cancel");
  const confirmButton = buttons.find((b) => b !== cancelButton) ?? buttons[buttons.length - 1];

  if (window.confirm(fullMessage)) {
    confirmButton.onPress?.();
  } else {
    cancelButton?.onPress?.();
  }
}
