import type { Ionicons } from "@expo/vector-icons";

export type ModalIconName = keyof typeof Ionicons.glyphMap;

export type ModalVariant = "default" | "info" | "success" | "warning" | "danger" | "permission";

export type ModalButtonSpec = {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: "default" | "cancel" | "destructive";
};

export type AlertRequest = {
  kind: "alert";
  id: number;
  title: string;
  message?: string;
  variant: ModalVariant;
  icon?: ModalIconName;
  buttons: ModalButtonSpec[];
};

export type PermissionRequest = {
  kind: "permission";
  id: number;
  title: string;
  message: string;
  icon?: ModalIconName;
  settingsLabel: string;
  cancelLabel: string;
  onOpenSettings?: () => void;
  onCancel?: () => void;
};

export type ModalRequest = AlertRequest | PermissionRequest;
