import React from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ColumnLabel } from "./ColumnLabel";
import { genZLabel, useGenZMode } from "./genz-mode";
import { Icon } from "./Icon";
import { PressableScale } from "./PressableScale";
import { useTheme } from "./theme";
import { getGlow, getShadow } from "./ui-tokens";
import { LOG_FOCUS, type LogFocus } from "../lib/logFocus";

/**
 * Round one-tap log buttons (Log period / Symptoms / Mood …), first one
 * filled, with a badge for how many were logged today. Shared by Home's
 * quick actions and the Tracker, both driven by useQuickLog.
 */
export function QuickLogButtons({
  keys,
  periodLoggedToday,
  loggedCount,
  onPress,
  style,
}: {
  keys: readonly string[];
  periodLoggedToday: boolean;
  loggedCount: (key: LogFocus) => number;
  onPress: (key: LogFocus) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const actions = keys
    .map((key) => LOG_FOCUS.find((f) => f.key === key))
    .filter((f): f is (typeof LOG_FOCUS)[number] => Boolean(f))
    .map((f, idx) => {
      const done = f.key === "flow" && periodLoggedToday;
      return {
        key: f.key,
        label: done ? "Period logged" : f.label,
        icon: done ? "checkmark" : f.icon,
        primary: idx === 0,
        count: loggedCount(f.key),
      };
    });

  // Equal columns (1–4), so long labels wrap within their own column.
  return (
    <View style={[{ flexDirection: "row", justifyContent: "center" }, style]}>
      {actions.map((action) => (
        <PressableScale
          key={action.key}
          accessibilityLabel={action.count ? `${action.label}, ${action.count} logged today` : action.label}
          accessibilityRole="button"
          onPress={() => onPress(action.key)}
          style={{ alignItems: "center", flex: 1, maxWidth: 110, paddingHorizontal: 3 }}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: action.primary ? colors.primary : colors.surface,
              ...(action.primary ? getGlow(colors.primary, isDark) : getShadow(colors, isDark)),
            }}
          >
            <Icon set="ion"
              name={action.icon as any}
              size={24}
              color={action.primary ? colors.buttonText : colors.primary}
            />
            {action.count > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  minWidth: 22,
                  height: 22,
                  paddingHorizontal: 6,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.primary,
                  borderWidth: 2,
                  borderColor: colors.background,
                }}
              >
                <Text style={{ color: colors.buttonText, fontSize: 11, fontWeight: "700", fontFamily: fonts.body }}>{action.count}</Text>
              </View>
            ) : null}
          </View>
          <ColumnLabel lineHeight={18} style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body, marginTop: 10 }}>
            {genZLabel(action.label, genZModeEnabled)}
          </ColumnLabel>
        </PressableScale>
      ))}
    </View>
  );
}
