import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/**
 * Shared "nothing here yet" placeholder for lists/sections that loaded fine but
 * came back empty — distinct from an error (see LoadingErrorState). Keep the
 * copy encouraging and, where it helps, give the user an action to fill it.
 */
export function EmptyState({
  icon = "inbox-outline",
  title,
  message,
  actionLabel,
  onAction,
  compact = false,
}: {
  icon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Tighter padding for inline (in-list) use rather than a full screen. */
  compact?: boolean;
}) {
  const { colors, fonts } = useTheme();

  return (
    <View
      className={`items-center justify-center ${compact ? "py-8 px-6" : "flex-1 py-16 px-8"}`}
    >
      {/* Icon in a tinted halo with a faint outer ring. */}
      <View
        style={{
          width: compact ? 64 : 84,
          height: compact ? 64 : 84,
          borderRadius: 42,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.primaryLight,
          borderWidth: compact ? 6 : 8,
          borderColor: colors.surfaceSoft,
        }}
      >
        <Icon set="mci" name={icon} size={compact ? 26 : 32} color={colors.primaryDark} />
      </View>
      <Text
        style={{ marginTop: 18, fontSize: 17, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3, textAlign: "center", color: colors.foreground, fontFamily: fonts.heading }}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={{ marginTop: 6, maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} size="md" style={{ marginTop: 22 }} />
      ) : null}
    </View>
  );
}
