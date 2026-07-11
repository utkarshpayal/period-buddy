import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "./theme";

type OptionAction = "report" | "save" | "share";

export default function OptionsModal({
  visible,
  onClose,
  onReport,
  onShare,
  onSave,
  isReported = false,
  isSaved = false,
}: {
  visible: boolean;
  onClose: () => void;
  onReport?: () => Promise<void> | void;
  onShare?: () => Promise<void> | void;
  onSave?: () => Promise<void> | void;
  isReported?: boolean;
  isSaved?: boolean;
}) {
  const { colors } = useTheme();
  const [pendingAction, setPendingAction] = React.useState<OptionAction | null>(
    null,
  );

  async function runAction(
    action: OptionAction,
    callback?: () => Promise<void> | void,
  ) {
    if (!callback || pendingAction) return;

    setPendingAction(action);

    try {
      await callback();
    } finally {
      setPendingAction(null);
    }
  }

  function renderAction({
    action,
    color = colors.foreground,
    disabled = false,
    icon,
    label,
    onPress,
    weight = "600",
  }: {
    action: OptionAction;
    color?: string;
    disabled?: boolean;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress?: () => Promise<void> | void;
    weight?: "600" | "700";
  }) {
    const isPending = pendingAction === action;
    const isDisabled = disabled || !onPress || Boolean(pendingAction);

    return (
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isDisabled}
        onPress={() => runAction(action, onPress)}
        style={{
          opacity: isDisabled && !isPending ? 0.45 : 1,
          paddingVertical: 12,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: colors.input,
              borderRadius: 9,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <Text style={{ color, flex: 1, fontWeight: weight }}>{label}</Text>
          {isPending ? <ActivityIndicator color={color} size="small" /> : null}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          accessibilityLabel="Close post options"
          onPress={onClose}
          style={{
            backgroundColor: colors.overlay,
            bottom: 0,
            left: 0,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
        <View
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            padding: 16,
            borderColor: colors.border,
            borderWidth: 1,
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: colors.border,
                borderRadius: 2,
                height: 4,
                width: 42,
              }}
            />
          </View>

          <Text
            style={{
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            Post Options
          </Text>

          {renderAction({
            action: "share",
            icon: "share-social-outline",
            label: "Share",
            onPress: onShare,
          })}

          {renderAction({
            action: "save",
            color: isSaved ? colors.primary : colors.foreground,
            icon: isSaved ? "bookmark" : "bookmark-outline",
            label: isSaved ? "Unsave" : "Save",
            onPress: onSave,
          })}

          {renderAction({
            action: "report",
            color: "#ef4444",
            disabled: isReported,
            icon: isReported ? "flag" : "flag-outline",
            label: isReported ? "Reported" : "Report",
            onPress: onReport,
            weight: "700",
          })}

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={{ paddingVertical: 12, marginTop: 6 }}
          >
            <Text style={{ color: colors.mutedText, textAlign: "center" }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
