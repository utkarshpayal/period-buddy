import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/**
 * One white card holding several rows, with a hairline between them that
 * starts after the icon (iOS settings style). Home's "More for you" and the
 * hubs' list sections use it; `null` children are skipped, so callers can
 * filter inline.
 */
export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 22, paddingVertical: 4, ...getShadow(colors, isDark) }, style]}>
      {rows.map((row, i) => (
        <React.Fragment key={(row as React.ReactElement).key ?? i}>
          {i > 0 ? <View style={{ height: 1, marginLeft: 72, backgroundColor: colors.track }} /> : null}
          {row}
        </React.Fragment>
      ))}
    </View>
  );
}

/** A row inside a ListGroup: tinted icon square, title + one-line description, trailing chevron. */
export function ListRow({
  icon,
  iconColor,
  iconBg,
  title,
  description,
  onPress,
  accessibilityLabel,
  trailing = "chevron",
  dim = 1,
  titleAccessory,
  iconAccessory,
}: {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  title: string;
  description?: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** "external" for something that leaves the app, "none" for a row that leads nowhere yet. */
  trailing?: "chevron" | "external" | "none";
  /** Opacity for the icon and text (a Coming soon row is dimmed). */
  dim?: number;
  /** Drawn right after the title, e.g. a BETA / SOON pill. */
  titleAccessory?: React.ReactNode;
  /** Drawn over the icon square, e.g. a pause dot. */
  iconAccessory?: React.ReactNode;
}) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, gap: 14 }}
    >
      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: iconBg, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={20} color={iconColor} style={{ opacity: dim }} />
        {iconAccessory}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap" }}>
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.4}
            style={{ flexShrink: 1, fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body, opacity: dim }}
          >
            {title}
          </Text>
          {titleAccessory}
        </View>
        {description ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body, opacity: dim }}
          >
            {description}
          </Text>
        ) : null}
      </View>
      {trailing === "none" ? null : (
        <Ionicons
          name={trailing === "external" ? "open-outline" : "chevron-forward"}
          size={18}
          color={colors.mutedText}
          accessibilityLabel={trailing === "external" ? "Opens outside the app" : undefined}
        />
      )}
    </TouchableOpacity>
  );
}
