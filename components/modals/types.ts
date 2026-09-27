import type { Ionicons } from "@expo/vector-icons";
import type { LaunchSheetInfo, TileColorKey } from "../../lib/appConfig";

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

/** The Coming soon / Paused bottom sheet for a locked App CMS feature (components/LaunchSheet.tsx). */
export type LaunchSheetRequest = {
  kind: "launch";
  id: number;
  /** Launch item key: a feature key or `link:<tileId>`. */
  itemKey: string;
  title: string;
  description: string;
  icon: string;
  colorKey: TileColorKey;
  /** Built-in features get the GenZ label swap, like their tiles. */
  builtIn: boolean;
  access: "soon" | "paused";
  sheet: LaunchSheetInfo;
};

export type ModalRequest = AlertRequest | PermissionRequest | LaunchSheetRequest;
