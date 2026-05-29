import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
    ScrollView,
    StatusBar,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../components/theme";

export default function Predictions() {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={colors.background}
      />

      <SafeAreaView
        className="flex-1"
        style={{ backgroundColor: colors.background }}
      >
        <ScrollView contentContainerClassName="pb-10">
          <View className="flex-row items-center gap-4 px-6 pt-6">
            <TouchableOpacity
              onPress={() => router.back()}
              accessibilityLabel="Back"
              style={{ padding: 8, margin: -8 }}
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.foreground}
              />
            </TouchableOpacity>
            <Text
              className="flex-1 text-2xl font-bold"
              style={{ color: colors.foreground }}
            >
              Predictions
            </Text>
          </View>

          <View className="mx-6 mt-6 gap-4">
            {/* Next Period */}
            <View
              className="rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: colors.mutedText }}
                  >
                    Next Period
                  </Text>
                  <Text
                    className="mt-2 text-3xl font-bold"
                    style={{ color: colors.primary }}
                  >
                    June 8
                  </Text>
                  <Text
                    className="mt-1 text-xs"
                    style={{ color: colors.mutedText }}
                  >
                    15 days away
                  </Text>
                </View>
                <Ionicons name="calendar" size={40} color={colors.primary} />
              </View>
            </View>

            {/* Fertile Window */}
            <View
              className="rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.secondary,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: colors.mutedText }}
                  >
                    Fertile Window
                  </Text>
                  <Text
                    className="mt-2 text-3xl font-bold"
                    style={{ color: colors.secondary }}
                  >
                    May 24-28
                  </Text>
                  <Text
                    className="mt-1 text-xs"
                    style={{ color: colors.mutedText }}
                  >
                    5 days window
                  </Text>
                </View>
                <Ionicons name="heart" size={40} color={colors.secondary} />
              </View>
            </View>

            {/* Ovulation */}
            <View
              className="rounded-2xl border-2 p-6"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.accent,
              }}
            >
              <View className="flex-row items-center justify-between">
                <View>
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: colors.mutedText }}
                  >
                    Ovulation Day
                  </Text>
                  <Text
                    className="mt-2 text-3xl font-bold"
                    style={{ color: colors.accent }}
                  >
                    May 26
                  </Text>
                  <Text
                    className="mt-1 text-xs"
                    style={{ color: colors.mutedText }}
                  >
                    2 days away
                  </Text>
                </View>
                <Ionicons name="flash" size={40} color={colors.accent} />
              </View>
            </View>

            <Text className="mt-6 text-sm" style={{ color: colors.mutedText }}>
              These predictions are based on your tracked cycles. The more data
              you log, the more accurate they become!
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
