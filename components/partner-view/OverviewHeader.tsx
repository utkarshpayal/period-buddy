import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

/** Greeting with avatar, streak pill and notification bell — mirrors the owner home header. */
export function OverviewHeader({
  firstName,
  subtitle,
  streakCount,
  unreadCount,
  onOpenNotifications,
}: {
  firstName?: string;
  subtitle: string;
  streakCount?: number;
  unreadCount: number;
  onOpenNotifications: () => void;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-center justify-between px-5 py-4 gap-3">
      <View className="flex-row items-center gap-2.5 flex-1 min-w-0">
        <View
          className="w-[38px] h-[38px] rounded-full items-center justify-center shrink-0"
          style={{ backgroundColor: colors.primaryLight }}
        >
          <Text
            className="text-sm font-black"
            style={{ color: colors.primary, fontFamily: fonts.heading }}
          >
            {(firstName?.[0] ?? "P").toUpperCase()}
          </Text>
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-base font-black"
            numberOfLines={1}
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            Hi {firstName || "there"}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 13.5, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
      <View className="flex-row items-center gap-2 shrink-0">
        {typeof streakCount === "number" && streakCount > 0 && (
          <View
            className="flex-row items-center px-3 py-2 rounded-full border"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <Icon set="ion" name="flame" size={13} color={colors.primary} style={{ marginRight: 4 }} />
            <Text
              style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.body }}
            >
              {streakCount}
            </Text>
          </View>
        )}
        {/* Primary-tinted (stronger once something's unread) so the bell
            reads as its own control next to the quiet streak pill. */}
        <TouchableOpacity
          hitSlop={4}
          onPress={onOpenNotifications}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          className="flex-row items-center justify-center w-10 h-10 rounded-full border relative"
          style={{
            borderColor: unreadCount > 0 ? colors.primary : colors.border,
            backgroundColor: unreadCount > 0 ? colors.primaryLight : colors.surface,
          }}
        >
          <Icon set="ion" name="notifications-outline" size={18} color={colors.primary} />
          {unreadCount > 0 && (
            <View
              className="absolute -top-1.5 -right-1.5 rounded-full items-center justify-center border"
              style={{
                backgroundColor: colors.danger,
                borderColor: colors.surface,
                borderWidth: 1.5,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 3,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
                {unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}
