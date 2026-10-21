import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { Button } from "./Button";
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
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 42,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.primaryLight,
            borderWidth: 8,
            borderColor: colors.surfaceSoft,
          }}
        >
          <Icon set="mci" name={icon} size={32} color={colors.primaryDark} />
        </View>
        <Text style={{ marginTop: 18, fontSize: 17, lineHeight: 24, fontWeight: "700", letterSpacing: -0.3, textAlign: "center", color: colors.foreground, fontFamily: fonts.heading }}>
          {title}
        </Text>
        <Text style={{ marginTop: 6, maxWidth: 300, fontSize: 14, lineHeight: 20, textAlign: "center", color: colors.mutedText, fontFamily: fonts.body }}>
          {error}
        </Text>
        <Button label="Try again" icon="refresh" onPress={onRetry} size="md" style={{ marginTop: 22 }} />
      </View>
    );
  }

  return <>{children}</>;
}
