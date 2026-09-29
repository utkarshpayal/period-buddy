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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./theme";

type OptionAction = "delete" | "report" | "save" | "share";

export default function OptionsModal({
  visible,
  onClose,
  onDelete,
  onReport,
  onShare,
  onSave,
  isReported = false,
  isSaved = false,
}: {
  visible: boolean;
  onClose: () => void;
  onDelete?: () => Promise<void> | void;
  onReport?: () => Promise<void> | void;
  onShare?: () => Promise<void> | void;
  onSave?: () => Promise<void> | void;
  isReported?: boolean;
  isSaved?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
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
    description,
    disabled = false,
    icon,
    iconBackground = colors.input,
    label,
    onPress,
    statusLabel,
    weight = "600",
  }: {
    action: OptionAction;
    color?: string;
    description: string;
    disabled?: boolean;
    icon: keyof typeof Ionicons.glyphMap;
    iconBackground?: string;
    label: string;
    onPress?: () => Promise<void> | void;
    statusLabel?: string;
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
          paddingVertical: 13,
        }}
      >
        <View style={{ alignItems: "center", flexDirection: "row", gap: 12 }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: iconBackground,
              borderRadius: 9,
              height: 34,
              justifyContent: "center",
              width: 34,
            }}
          >
            <Ionicons name={icon} size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color, fontFamily: fonts.body, fontWeight: weight }}>{label}</Text>
            <Text
              style={{
                color: colors.mutedText,
                fontFamily: fonts.body,
                fontSize: 12.5,
                fontWeight: "600",
                lineHeight: 16,
                marginTop: 2,
              }}
            >
              {description}
            </Text>
          </View>
          {statusLabel ? (
            <View
              style={{
                backgroundColor: colors.input,
                borderColor: colors.border,
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  color: colors.mutedText,
                  fontFamily: fonts.body,
                  fontSize: 12.5,
                  fontWeight: "800",
                }}
              >
                {statusLabel}
              </Text>
            </View>
          ) : null}
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
            paddingBottom: Math.max(16, insets.bottom + 10),
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
              fontFamily: fonts.heading,
              fontSize: 16,
              fontWeight: "800",
              marginBottom: 8,
            }}
          >
            Post Options
          </Text>

          {renderAction({
            action: "share",
            description: "Share this post.",
            icon: "share-social-outline",
            label: "Share",
            onPress: onShare,
          })}

          {renderAction({
            action: "save",
            color: isSaved ? colors.primary : colors.foreground,
            description: isSaved
              ? "Remove this post from your saved community list."
              : "Keep this post in your saved community list.",
            icon: isSaved ? "bookmark" : "bookmark-outline",
            label: isSaved ? "Unsave" : "Save",
            onPress: onSave,
            statusLabel: isSaved ? "Saved" : undefined,
          })}

          {renderAction({
            action: "report",
            color: colors.danger,
            description: isReported
              ? "This post has already been sent for review."
              : "Flag unsafe, spammy, or harmful content for review.",
            disabled: isReported,
            icon: isReported ? "flag" : "flag-outline",
            iconBackground: colors.dangerLight,
            label: isReported ? "Reported" : "Report",
            onPress: onReport,
            statusLabel: isReported ? "Done" : "Safety",
            weight: "700",
          })}

          {onDelete && renderAction({
            action: "delete",
            color: colors.danger,
            description: "This can't be undone.",
            icon: "trash-outline",
            iconBackground: colors.dangerLight,
            label: "Delete Post",
            onPress: onDelete,
            weight: "700",
          })}

          <View
            style={{
              backgroundColor: colors.input,
              borderColor: colors.border,
              borderRadius: 14,
              borderWidth: 1,
              marginTop: 4,
              padding: 12,
            }}
          >
            <Text
              style={{
                color: colors.foreground,
                fontFamily: fonts.body,
                fontSize: 12,
                fontWeight: "800",
              }}
            >
              Anonymous community safety
            </Text>
            <Text
              style={{
                color: colors.mutedText,
                fontFamily: fonts.body,
                fontSize: 12.5,
                fontWeight: "600",
                lineHeight: 16,
                marginTop: 4,
              }}
            >
              Saved posts stay private on this device. Reports are private and
              help keep the feed supportive.
            </Text>
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={onClose}
            style={{ paddingVertical: 12, marginTop: 6 }}
          >
            <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontWeight: "700", textAlign: "center" }}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
