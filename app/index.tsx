import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { Loader } from "../components/Loader";
import { ThemeToggle, useTheme, type ThemeColors } from "../components/theme";
import { getScreenGradient, getShadow } from "../components/ui-tokens";

type Slide = {
  key: string;
  title: string;
  body: string;
  art: "brand" | "predict" | "care";
};

const SLIDES: Slide[] = [
  {
    key: "brand",
    title: "Cycle care that\nfeels like you",
    body: "Private, judgment-free tracking and support, built for how your body really works.",
    art: "brand",
  },
  {
    key: "predict",
    title: "Know what's\ncoming next",
    body: "Period, fertile window and mood predictions that get smarter every time you log.",
    art: "predict",
  },
  {
    key: "care",
    title: "Support whenever\nyou need it",
    body: "Ask Buddy anything, talk to doctors, and build habits that help, all in one place.",
    art: "care",
  },
];

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { colors, fonts, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  // Short phones: shrink the artwork rather than clip the text under it.
  const compact = height < 720;
  const hasNavigated = useRef(false);
  const [index, setIndex] = useState(0);
  const contentWidth = Math.min(width, 540);
  const screenGradient = getScreenGradient(colors, isDark) as [string, string, string];

  useEffect(() => {
    if (isAuthenticated && !hasNavigated.current) {
      hasNavigated.current = true;
      const timer = setTimeout(() => {
        router.replace(
          user?.partnerRole === "viewer" ? "/(app)/(partner-view)/overview" : "/(app)/(dashboard)/tracker",
        );
      }, 100);
      return () => clearTimeout(timer);
    } else if (!isAuthenticated) {
      hasNavigated.current = false;
    }
  }, [isAuthenticated, router, user?.partnerRole]);

  // onScroll (not onMomentumScrollEnd) so the dots follow the swipe live.
  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(event.nativeEvent.contentOffset.x / contentWidth);
    setIndex((current) => (current === next ? current : next));
  }

  // AuthProvider withholds this whole tree until session hydration from
  // AsyncStorage finishes, so `isAuthenticated` is already accurate on first
  // render here — a logged-in user should never see the logged-out landing
  // page flash by. Show the branded loader instead while the redirect effect
  // above sends them into the app.
  if (isAuthenticated) {
    return <Loader fullscreen label="Getting things ready…" />;
  }


  return (
    <LinearGradient colors={screenGradient} className="flex-1">
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor="transparent" translucent />
      <SafeAreaView className="flex-1" style={{ alignItems: "center" }}>
        <View style={{ width: contentWidth, flex: 1 }}>
          <View className="flex-row justify-between items-center" style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
            <View className="flex-row items-center" style={{ gap: 8 }}>
              <Image
                source={require("../assets/images/brand/logo-mark.png")}
                resizeMode="contain"
                style={{ width: 30, height: 30, borderRadius: 9 }}
              />
              <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "800", fontFamily: fonts.heading }}>Nura</Text>
            </View>
            <ThemeToggle />
          </View>

          <FlatList
            data={SLIDES}
            keyExtractor={(slide) => slide.key}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={32}
            getItemLayout={(_, i) => ({ index: i, length: contentWidth, offset: contentWidth * i })}
            style={{ flexGrow: 1 }}
            renderItem={({ item }) => (
              <View style={{ width: contentWidth, flex: 1, paddingHorizontal: 28, justifyContent: "center" }}>
                <View style={{ alignItems: "center", marginTop: compact ? -25 : 0, marginBottom: compact ? 8 : 36, transform: [{ scale: compact ? 0.78 : 1 }] }}>
                  <SlideArt art={item.art} colors={colors} isDark={isDark} />
                </View>
                <Text
                  accessibilityRole="header"
                  style={{
                    color: colors.foreground,
                    fontSize: 32,
                    lineHeight: 39,
                    fontWeight: "800",
                    letterSpacing: -0.6,
                    textAlign: "center",
                    fontFamily: fonts.heading,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  style={{
                    color: colors.mutedText,
                    fontSize: 15.5,
                    lineHeight: 23,
                    textAlign: "center",
                    marginTop: 12,
                    fontFamily: fonts.body,
                  }}
                >
                  {item.body}
                </Text>
              </View>
            )}
          />

          <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
            <View className="flex-row justify-center" style={{ gap: 6, marginBottom: 26 }}>
              {SLIDES.map((slide, i) => (
                <Dot key={slide.key} active={i === index} colors={colors} />
              ))}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/signup")}
              style={({ pressed }) => ({
                height: 56,
                borderRadius: 18,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                transform: [{ scale: pressed ? 0.98 : 1 }],
                ...getShadow(colors, isDark),
              })}
            >
              <Text style={{ color: colors.buttonText, fontSize: 16, fontWeight: "800", fontFamily: fonts.body }}>
                Get started
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/login")}
              style={({ pressed }) => ({
                height: 52,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 6,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", fontFamily: fonts.body }}>
                I already have an account
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/partner-connect")}
              hitSlop={8}
              className="flex-row justify-center items-center"
              style={({ pressed }) => ({ gap: 5, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="heart-outline" size={13} color={colors.mutedText} />
              <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>
                Joining a partner? Use your invite code
              </Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Dot({ active, colors }: { active: boolean; colors: ThemeColors }) {
  const style = useAnimatedStyle(
    () => ({
      width: withTiming(active ? 22 : 7, { duration: 220 }),
      backgroundColor: active ? colors.primary : colors.border,
    }),
    [active, colors.primary, colors.border],
  );
  return <Animated.View style={[{ height: 7, borderRadius: 4 }, style]} />;
}

/** Illustration for a slide, composed from brand colours and icons. */
function SlideArt({ art, colors, isDark }: { art: Slide["art"]; colors: ThemeColors; isDark: boolean }) {
  const tile = {
    width: 196,
    height: 196,
    borderRadius: 60,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: colors.surface,
    ...getShadow(colors, isDark),
  };

  const badge = (icon: keyof typeof Ionicons.glyphMap, tint: string, color: string, position: object) => (
    <View
      style={{
        position: "absolute",
        width: 54,
        height: 54,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.surface,
        ...getShadow(colors, isDark),
        ...position,
      }}
    >
      <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: tint }}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
    </View>
  );

  if (art === "brand") {
    return (
      <View style={{ width: 250, height: 230, alignItems: "center", justifyContent: "center" }}>
        <View style={[tile, { overflow: "hidden" }]}>
          <Image source={require("../assets/images/brand/logo-mark.png")} resizeMode="contain" style={{ width: "100%", height: "100%" }} />
        </View>
        {badge("lock-closed", colors.secondaryLight, colors.info, { top: 4, right: 4 })}
        {badge("heart", colors.primaryLight, colors.primary, { bottom: 6, left: 2 })}
      </View>
    );
  }

  if (art === "predict") {
    return (
      <View style={{ width: 250, height: 230, alignItems: "center", justifyContent: "center" }}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark, colors.secondary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ ...tile, backgroundColor: undefined }}
        >
          <Ionicons name="calendar" size={72} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "800", marginTop: 6, letterSpacing: 0.6 }}>IN 5 DAYS</Text>
        </LinearGradient>
        {badge("water", colors.roseLight, colors.rose, { top: 6, left: 0 })}
        {badge("sparkles", colors.mintLight, colors.accentText, { bottom: 4, right: 0 })}
      </View>
    );
  }

  return (
    <View style={{ width: 250, height: 230, alignItems: "center", justifyContent: "center" }}>
      <View style={[tile, { overflow: "hidden", backgroundColor: colors.primaryLight }]}>
        <Image
          source={require("../assets/images/illustrations/nura-avatar.png")}
          resizeMode="cover"
          style={{ width: "100%", height: "100%" }}
        />
      </View>
      {badge("chatbubble-ellipses", colors.secondaryLight, colors.info, { top: 8, right: 0 })}
      {badge("medkit", colors.mintLight, colors.accentText, { bottom: 2, left: 4 })}
    </View>
  );
}
