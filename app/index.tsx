import { Link, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Image,
  StatusBar,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { Loader } from "../components/Loader";
import { ThemeToggle, useTheme } from "../components/theme";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { getScreenGradient, getShadow } from "../components/ui-tokens";

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

  useEffect(() => {
    if (isAuthenticated && !hasNavigated.current) {
      hasNavigated.current = true;
      const timer = setTimeout(() => {
        router.replace(
          user?.partnerRole === "viewer"
            ? "/(app)/(partner-view)/overview"
            : "/(app)/(dashboard)/tracker",
        );
      }, 100);
      return () => clearTimeout(timer);
    } else if (!isAuthenticated) {
      hasNavigated.current = false;
    }
  }, [isAuthenticated, router, user?.partnerRole]);

  // AuthProvider withholds this whole tree until session hydration from
  // AsyncStorage finishes, so `isAuthenticated` is already accurate on first
  // render here — a logged-in user should never see the logged-out landing
  // page (Log In / Create Account) flash by. Show the branded loader instead
  // while the redirect effect above sends them into the app.
  if (isAuthenticated) {
    return <Loader fullscreen label="Getting things ready…" />;
  }

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
          </View>
          <ThemeToggle />
        </View>

        <View
          style={{
            alignItems: "center",
            flex: 1,
            justifyContent: "center",
            paddingBottom: 42,
            paddingHorizontal: 20,
          }}
        >
          <View style={{ width: contentWidth }}>
            <View className="items-center mb-10 mt-2">
              <View
                className="mb-7 h-28 w-28 items-center justify-center relative rounded-[32px] border overflow-hidden"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  ...getShadow(colors, isDark),
                }}
              >
                <Image
                  source={require("../assets/images/brand/logo-mark.png")}
                  resizeMode="contain"
                  style={{ width: "100%", height: "100%" }}
                />
                {/* <View
                  className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full items-center justify-center border"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Ionicons name="heart" size={14} color={colors.buttonText} />
                </View> */}
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
                Private, judgment-free cycle care.
              </Text>
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
        </View>
      </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
