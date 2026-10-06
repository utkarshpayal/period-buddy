import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PressableFeedback from "./PressableFeedback";
import { useTheme } from "./theme";

export type ActionSheetItem = {
  key: string;
  label: string;
  /** One short line under the label. */
  description?: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  destructive?: boolean;
  onPress: () => void;
};

/**
 * A bottom sheet of actions (the "⋯" menu pattern): icon, label and a short
 * description per row, destructive rows in red, and Cancel. The sheet closes
 * before the action runs, so an action may open another dialog.
 */
export function ActionSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  const run = (item: ActionSheetItem) => {
    onClose();
    // Let the sheet finish closing first: iOS won't present a dialog over a closing Modal.
    setTimeout(item.onPress, 280);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close menu"
        style={{ flex: 1, backgroundColor: "rgba(15, 10, 20, 0.45)", justifyContent: "flex-end" }}
      >
        <Pressable
          // Taps inside the sheet don't close it.
          onPress={() => undefined}
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            paddingHorizontal: 16,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />

          {(title || subtitle) && (
            <View style={{ paddingHorizontal: 8, marginBottom: 12 }}>
              {title ? (
                <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text numberOfLines={1} style={{ fontSize: 13, marginTop: 2, color: colors.mutedText, fontFamily: fonts.body }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          )}

          <View style={{ borderRadius: 20, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            {items.map((item, i) => {
              const tint = item.destructive ? colors.danger : colors.foreground;
              return (
                <PressableFeedback
                  key={item.key}
                  onPress={() => run(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item.description ? `${item.label}. ${item.description}` : item.label}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    minHeight: 60,
                    backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: colors.border,
                  })}
                >
                  <View
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 19,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: item.destructive ? colors.dangerLight : colors.primaryLight,
                    }}
                  >
                    <Feather name={item.icon} size={17} color={item.destructive ? colors.danger : colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: tint, fontFamily: fonts.body }}>{item.label}</Text>
                    {item.description ? (
                      <Text style={{ fontSize: 13, marginTop: 1, color: colors.mutedText, fontFamily: fonts.body }}>{item.description}</Text>
                    ) : null}
                  </View>
                  {!item.destructive && <Feather name="chevron-right" size={18} color={colors.mutedText} />}
                </PressableFeedback>
              );
            })}
          </View>

          <PressableFeedback
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => ({
              marginTop: 10,
              height: 52,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}>Cancel</Text>
          </PressableFeedback>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
