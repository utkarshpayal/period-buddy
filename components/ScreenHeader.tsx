import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const { colors, fonts, isDark } = useTheme();
  const router = useRouter();

  return (
    <View className="flex-row items-center gap-2 px-6 pt-6">
      <TouchableOpacity
        onPress={onBack ?? (() => router.back())}
        activeOpacity={0.7}
        className="w-9 h-9 items-center justify-center -ml-1 rounded-full"
        style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
      >
        <Feather name="arrow-left" size={18} color={colors.foreground} />
      </TouchableOpacity>
      <Text className="flex-1 text-xl font-black tracking-tight ml-2" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
        {title}
      </Text>
      {right}
    </View>
  );
}
