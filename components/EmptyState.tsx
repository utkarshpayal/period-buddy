import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

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
      <View
        className="h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surfaceSoft ?? colors.surface }}
      >
        <MaterialCommunityIcons name={icon} size={30} color={colors.mutedText} />
      </View>
      <Text
        className="mt-4 text-base font-bold text-center"
        style={{ color: colors.foreground, fontFamily: fonts.heading }}
      >
        {title}
      </Text>
      {message ? (
        <Text
          className="mt-2 text-xs text-center leading-5"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.85}
          className="mt-6 rounded-2xl px-6 py-3"
          style={{ backgroundColor: colors.primary }}
        >
          <Text
            className="text-sm font-bold"
            style={{ color: colors.buttonText, fontFamily: fonts.body }}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
