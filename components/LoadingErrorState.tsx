import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Loader } from "./Loader";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

export function LoadingErrorState({
  loading,
  error,
  offline,
  onRetry,
  loadingLabel,
  errorIcon = "alert-circle-outline",
  errorTitle = "Something went wrong",
  skeleton,
  children,
}: {
  loading: boolean;
  error: string | null;
  /** When true, render the error as an offline state (distinct icon/title). */
  offline?: boolean;
  onRetry: () => void;
  loadingLabel?: string;
  errorIcon?: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  errorTitle?: string;
  /** Custom placeholder shown instead of the spinner while loading — pass a
   * SkeletonList/SkeletonCard (or your own layout) shaped like the content
   * this screen will render, so the loading state doesn't jump/reflow. */
  skeleton?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, fonts } = useTheme();

  if (loading) {
    if (skeleton) return <>{skeleton}</>;
    return (
      <View className="flex-1 items-center justify-center">
        <Loader label={loadingLabel} />
      </View>
    );
  }

  if (error) {
    const icon = offline ? "wifi-off" : errorIcon;
    const title = offline ? "You're offline" : errorTitle;
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Icon set="mci" name={icon} size={48} color={colors.primary} />
        <Text className="mt-4 text-base font-bold text-center" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text className="mt-2 text-xs text-center leading-5" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          {error}
        </Text>
        <TouchableOpacity
          onPress={onRetry}
          className="mt-6 px-6 py-3 rounded-2xl"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
            Retry
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}
