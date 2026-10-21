import { Feather } from "@expo/vector-icons";
import React, { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { getShadow } from "./ui-tokens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import PressableFeedback from "./PressableFeedback";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

export type ActionSheetItem = {
  key: string;
  label: string;
  /** One short line under the label. */
  description?: string;
  /** Optional: a plain text menu reads calmer where every action is obvious. */
  icon?: React.ComponentProps<typeof Feather>["name"];
  destructive?: boolean;
  onPress: () => void;
};

/**
 * A bottom sheet of actions (the "⋯" menu pattern): optional icon, label and a short
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
  const { colors, fonts, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  // The tapped action runs once the sheet has slid away (onDismissed), so it
  // may open a dialog: iOS won't present one over a closing Modal.
  const pending = useRef<(() => void) | null>(null);

  const run = (item: ActionSheetItem) => {
    pending.current = item.onPress;
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      backdropLabel="Close menu"
      onDismissed={() => {
        const next = pending.current;
        pending.current = null;
        next?.();
      }}
      style={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 12) + 8, width: "100%", maxWidth: 640, alignSelf: "center" }}
    >
      {(title || subtitle) && (
        <View style={{ paddingHorizontal: 8, marginTop: 4, marginBottom: 14 }}>
          {title ? (
            <Text numberOfLines={1} accessibilityRole="header" style={{ fontSize: 17, fontWeight: "800", letterSpacing: -0.3, color: colors.foreground, fontFamily: fonts.heading }}>
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

      <View style={{ borderRadius: 24, borderCurve: "continuous", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}>
        <View style={{ borderRadius: 24, borderCurve: "continuous", overflow: "hidden" }}>
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
                })}
              >
                {i > 0 ? (
                  <View
                    pointerEvents="none"
                    style={{ position: "absolute", top: 0, right: 0, left: item.icon ? 68 : 16, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }}
                  />
                ) : null}
                {item.icon ? (
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 13,
                      borderCurve: "continuous",
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: item.destructive ? colors.dangerLight : colors.primaryLight,
                    }}
                  >
                    <Icon set="feather" name={item.icon} size={18} color={item.destructive ? colors.danger : colors.primaryDark} />
                  </View>
                ) : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", letterSpacing: -0.15, color: tint, fontFamily: fonts.body }}>{item.label}</Text>
                  {item.description ? (
                    <Text style={{ fontSize: 13, marginTop: 1, color: colors.mutedText, fontFamily: fonts.body }}>{item.description}</Text>
                  ) : null}
                </View>
                {!item.destructive && item.icon && <Icon set="feather" name="chevron-right" size={17} color={colors.mutedText} style={{ opacity: 0.7 }} />}
              </PressableFeedback>
            );
          })}
        </View>
      </View>

      <Button label="Cancel" variant="secondary" size="md" fullWidth onPress={onClose} style={{ marginTop: 12 }} />
    </BottomSheet>
  );
}
