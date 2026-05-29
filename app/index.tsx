import { Ionicons } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { ThemeToggle, useTheme } from "../components/theme";

export default function Index() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace("./home");
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
        <View className="absolute right-6 top-4 z-10">
          <ThemeToggle />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="mb-12 items-center">
            <View
              className="mb-5 h-20 w-20 items-center justify-center rounded-full border-2"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <Ionicons
                name="water-outline"
                size={38}
                color={colors.foreground}
              />
            </View>

            <Text
              className="text-4xl font-bold"
              style={{ color: colors.foreground }}
            >
              FlowHer
            </Text>

            <Text
              className="mt-3 text-center text-base leading-6"
              style={{ color: colors.foreground }}
            >
              Simple care for your wellness journey
            </Text>
          </View>

          <View className="gap-4">
            <Link href="/login" asChild>
              <TouchableOpacity
                className="rounded-xl py-4"
                style={{ backgroundColor: colors.button }}
              >
                <Text
                  className="text-center text-lg font-bold"
                  style={{ color: colors.buttonText }}
                >
                  Login
                </Text>
              </TouchableOpacity>
            </Link>

            <Link href="./signup" asChild>
              <TouchableOpacity
                className="rounded-xl border py-4"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
              >
                <Text
                  className="text-center text-lg font-bold"
                  style={{ color: colors.foreground }}
                >
                  Sign Up
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
