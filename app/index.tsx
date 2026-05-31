import { Link, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Image, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { ThemeToggle, useTheme } from "../components/theme";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !hasNavigated.current) {
      hasNavigated.current = true;
      const timer = setTimeout(() => {
        router.replace("/(app)/(dashboard)/home");
      }, 100);
      return () => clearTimeout(timer);
    } else if (!isAuthenticated) {
      hasNavigated.current = false;
    }
  }, [isAuthenticated, router]);

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
        <View className="absolute right-6 top-8 z-10 ">
          <ThemeToggle />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="mb-12 items-center">
            <View
              className="mb-5 h-20 w-20 items-center justify-center rounded-full border-2 overflow-hidden"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Image
                source={require("../assets/images/logo.png")}
                resizeMode="contain"
                style={{
                  width: 200,
                  height: 200,
                }}
              />
            </View>

            <Text
              className="text-4xl font-bold pb-4"
              style={{ color: colors.foreground }}
            >
              The Nura
            </Text>

            <Text
              className="mt-3 text-center text-base leading-6 pb-12"
              style={{ color: colors.foreground }}
            >
              Feel the flow with Nura - Your ultimate productivity companion
            </Text>
          </View>

          <View className="gap-4 w-full">
            {/* Primary Action Button (Login) */}
            <Link href="/(tabs)/login" asChild>
              <TouchableOpacity
                activeOpacity={0.85}
                className="rounded-2xl py-4 shadow-md items-center justify-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Text
                  className="text-center text-base font-semibold tracking-wide"
                  style={{ color: colors.buttonText }}
                >
                  Log In
                </Text>
              </TouchableOpacity>
            </Link>

            {/* Secondary Action Button (Sign Up) */}
            <Link href="/(tabs)/signup" asChild>
              <TouchableOpacity
                activeOpacity={0.75}
                className="rounded-2xl border py-4 items-center justify-center"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-center text-base font-semibold tracking-wide"
                  style={{ color: colors.text }}
                >
                  Create Account
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
