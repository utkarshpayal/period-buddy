import { Link, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Image,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { ThemeToggle, useTheme } from "../components/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  getScreenGradient,
  getShadow,
  getSoftTints,
} from "../components/ui-tokens";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { colors, fonts, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const hasNavigated = useRef(false);
  const contentWidth = Math.min(Math.max(width - 40, 280), 540);
  const screenGradient = getScreenGradient(colors, isDark) as [
    string,
    string,
    string,
  ];
  const softTints = getSoftTints(colors);

  useEffect(() => {
    if (isAuthenticated && !hasNavigated.current) {
      hasNavigated.current = true;
      const timer = setTimeout(() => {
        router.replace(
          user?.partnerRole === "viewer"
            ? "/(app)/(partner-view)/home"
            : "/(app)/(dashboard)/tracker",
        );
      }, 100);
      return () => clearTimeout(timer);
    } else if (!isAuthenticated) {
      hasNavigated.current = false;
    }
  }, [isAuthenticated, router, user?.partnerRole]);

  return (
    <LinearGradient
      colors={screenGradient}
      className="flex-1"
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor="transparent"
        translucent
      />

      <SafeAreaView className="flex-1">
        <View className="flex-row justify-between items-center px-5 py-4">
          <View className="flex-row items-center gap-2">
            <View
              className="w-8 h-8 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primaryLight }}
            >
              <Ionicons name="sparkles" size={14} color={colors.primary} />
            </View>
            <Text
              className="text-lg font-black tracking-widest"
              style={{ color: colors.foreground, fontFamily: fonts.heading }}
            >
              NURA
            </Text>
          </View>
          <ThemeToggle />
        </View>

        <ScrollView
          contentContainerStyle={{
            alignItems: "center",
            flexGrow: 1,
            justifyContent: "center",
            paddingBottom: 42,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: contentWidth }}>
            <View className="items-center mb-8 mt-2">
              <View
                className="mb-6 rounded-full border px-3 py-1.5"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-[11px] font-black uppercase tracking-widest"
                  style={{ color: colors.primary, fontFamily: fonts.body }}
                >
                  Private cycle care
                </Text>
              </View>

              <View
                className="mb-7 h-28 w-28 items-center justify-center relative rounded-[32px] border overflow-hidden"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  ...getShadow(colors, isDark),
                }}
              >
                <Image
                  source={require("../assets/images/logo.png")}
                  resizeMode="contain"
                  className="w-full h-full"
                />
                <View
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full items-center justify-center border"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="heart" size={14} color={colors.buttonText} />
                </View>
              </View>

              <Text
                className="text-4xl font-black text-center leading-10"
                style={{ color: colors.foreground, fontFamily: fonts.heading }}
              >
                Nura
              </Text>

              <Text
                className="mt-3 text-center text-base font-semibold leading-6"
                style={{ color: colors.mutedText, fontFamily: fonts.body }}
              >
                A calm, modern space to track your cycle, understand your body,
                ask private questions, and feel supported every day.
              </Text>
            </View>

          <View className="gap-3 mb-8">
            {[
              {
                icon: "calendar-outline",
                title: "Smart cycle tracking",
                desc: "Periods, fertile windows, symptoms, moods, and daily logs in one place.",
                tint: softTints.pink,
                color: colors.primary,
              },
              {
                icon: "shield-checkmark-outline",
                title: "Private by default",
                desc: "Sensitive notes, partner sharing, and community activity stay under your control.",
                tint: softTints.mint,
                color: colors.secondary,
              },
              {
                icon: "sparkles-outline",
                title: "Support that feels human",
                desc: "Q&A, care articles, habit nudges, and clinical consultation access.",
                tint: softTints.lavender,
                color: colors.accent,
              },
            ].map((feat) => (
              <View
                key={feat.title}
                className="flex-row items-center p-4 rounded-2xl border"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <View
                  className="w-12 h-12 rounded-2xl items-center justify-center mr-4"
                  style={{ backgroundColor: feat.tint }}
                >
                  <Ionicons
                    name={feat.icon as any}
                    size={20}
                    color={feat.color}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className="text-sm font-black"
                    style={{ color: colors.foreground, fontFamily: fonts.heading }}
                  >
                    {feat.title}
                  </Text>
                  <Text
                    className="text-xs font-semibold mt-1 leading-4"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    {feat.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View className="gap-4 w-full">
            <Link href="/(tabs)/login" asChild>
              <TouchableOpacity
                activeOpacity={0.9}
                className="rounded-full py-4 items-center justify-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="text-center text-sm font-black tracking-wide"
                  style={{ color: colors.buttonText, fontFamily: fonts.body }}
                >
                  Log In
                </Text>
              </TouchableOpacity>
            </Link>

            <Link href="/(tabs)/signup" asChild>
              <TouchableOpacity
                activeOpacity={0.8}
                className="rounded-full border py-4 items-center justify-center"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-center text-sm font-black tracking-wide"
                  style={{ color: colors.foreground, fontFamily: fonts.body }}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </Link>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push("/(tabs)/partner-connect")}
            className="mt-5 flex-row justify-center items-center"
          >
            <Ionicons
              name="heart-outline"
              size={13}
              color={colors.mutedText}
              style={{ marginRight: 5 }}
            />
            <Text
              className="text-center text-xs font-bold"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Connecting as a partner? Tap here
            </Text>
          </TouchableOpacity>

          <Text
            className="mt-4 text-center text-[11px] font-semibold leading-4"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            No awkward dashboards. No judgment. Just clear care for real life.
          </Text>
        </View>
      </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}
