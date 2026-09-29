import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

type HubEntryCardProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  /** Up to 3 small glyphs previewing what's inside the hub, shown as a
   * stacked cluster before the chevron — gives a hint of the destination
   * without spelling out every item, the way an app icon "folder" preview
   * does for a group of shortcuts. */
  previewIcons?: React.ComponentProps<typeof Ionicons>["name"][];
  onPress: () => void;
};

/**
 * Single-row navigation card used on Home to link into a "hub" screen that
 * groups several related destinations (Care & Insights, Wellness & Support,
 * Explore). Replaces what used to be a full inline grid of 4-6 tiles per
 * section — Home shows one glanceable card per hub, the full set of
 * destinations lives one tap away.
 */
export default function HubEntryCard({
  icon,
  iconColor,
  iconBg,
  title,
  description,
  previewIcons,
  onPress,
}: HubEntryCardProps) {
  const { colors, isDark, fonts } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center border"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderRadius: 20,
        padding: 14,
        ...getShadow(colors, isDark),
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: iconBg,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 12,
        }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>

      <View className="flex-1 pr-2">
        <Text
          style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 12.5, color: colors.mutedText, marginTop: 1.5, fontFamily: fonts.body }}
          numberOfLines={1}
        >
          {description}
        </Text>
      </View>

      {previewIcons && previewIcons.length > 0 ? (
        <View className="flex-row items-center mr-2" style={{ marginLeft: -6 }}>
          {previewIcons.slice(0, 3).map((previewIcon, idx) => (
            <View
              key={`${previewIcon}-${idx}`}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: colors.surfaceSoft,
                borderWidth: 1.5,
                borderColor: colors.surface,
                alignItems: "center",
                justifyContent: "center",
                marginLeft: -6,
              }}
            >
              <Ionicons name={previewIcon} size={11} color={colors.mutedText} />
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: colors.surfaceSoft,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="chevron-forward" size={13} color={colors.mutedText} />
      </View>
    </TouchableOpacity>
  );
}
