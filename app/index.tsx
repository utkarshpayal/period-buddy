import { Ionicons } from "@expo/vector-icons";
import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  StatusBar,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Pressable from "../components/PressableFeedback";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../components/auth-context";
import { Loader } from "../components/Loader";
import { ThemeToggle, useTheme, type ThemeColors } from "../components/theme";
import { getScreenGradient, getShadow } from "../components/ui-tokens";
import { useContentWidth } from "../lib/layout";

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  art: "brand" | "predict" | "care";
};

const SLIDES: Slide[] = [
  {
    key: "brand",
    eyebrow: "Private by design",
    title: "Cycle care that\nfeels like you",
    body: "Private, judgment-free tracking, built around how your body works.",
    art: "brand",
  },
  {
    key: "predict",
    eyebrow: "Smart predictions",
    title: "Know what's\ncoming next",
    body: "Period, fertile window and mood predictions that learn as you log.",
    art: "predict",
  },
  {
    key: "care",
    eyebrow: "Care, anytime",
    title: "Support whenever\nyou need it",
    body: "Ask Nura AI, talk to doctors and build healthy habits, all in one place.",
    art: "care",
  },
];

/** How long each slide stays before the pager moves on by itself. */
const AUTO_ADVANCE_MS = 4000;

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { colors, fonts, isDark } = useTheme();
  const { height } = useWindowDimensions();
  // Short phones: tighter spacing and a smaller title rather than clipped text.
  const compact = height < 720;
  const hasNavigated = useRef(false);
  const [index, setIndex] = useState(0);
  // The pager's real height, so every slide fills it and centres its content
  // (a horizontal list doesn't stretch its items to its height on web).
  const [pagerHeight, setPagerHeight] = useState(0);
  const contentWidth = useContentWidth();
  const screenGradient = getScreenGradient(colors, isDark) as [string, string, string];
  const listRef = useRef<FlatList<Slide>>(null);
  // Auto-advance pauses while the person drags, while another screen
  // (signup/login) sits on top, and never runs with reduced motion on.
  const [dragging, setDragging] = useState(false);
  const reduceMotion = useReducedMotion();
  const isFocused = useIsFocused();

  // A fresh timer per slide: a manual swipe restarts the 4s count, and the
  // dots stay in sync because they follow the scroll position, not the timer.
  useEffect(() => {
    if (reduceMotion || dragging || !isFocused || isAuthenticated) return;
    const timer = setTimeout(() => {
      const next = (index + 1) % SLIDES.length;
      listRef.current?.scrollToOffset({ offset: next * contentWidth, animated: true });
    }, AUTO_ADVANCE_MS);
    return () => clearTimeout(timer);
  }, [index, dragging, reduceMotion, isFocused, isAuthenticated, contentWidth]);

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
    const raw = Math.round(event.nativeEvent.contentOffset.x / contentWidth);
    const next = Math.max(0, Math.min(SLIDES.length - 1, raw));
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

          <View style={{ flex: 1 }} onLayout={(e) => setPagerHeight(e.nativeEvent.layout.height)}>
          <FlatList
            ref={listRef}
            data={SLIDES}
            keyExtractor={(slide) => slide.key}
            horizontal
            pagingEnabled
            bounces={false}
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            onScrollBeginDrag={() => setDragging(true)}
            onScrollEndDrag={() => setDragging(false)}
            scrollEventThrottle={32}
            getItemLayout={(_, i) => ({ index: i, length: contentWidth, offset: contentWidth * i })}
            style={{ height: pagerHeight || undefined }}
            renderItem={({ item }) => (
              <View style={{ width: contentWidth, height: pagerHeight || undefined, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" }}>
                <View style={{ marginBottom: compact ? 22 : 30 }}>
                  <SlideArt art={item.art} colors={colors} isDark={isDark} />
                </View>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={{
                    color: colors.primary,
                    fontSize: 12,
                    fontWeight: "800",
                    letterSpacing: 1.2,
                    textTransform: "uppercase",
                    marginBottom: 10,
                    fontFamily: fonts.body,
                  }}
                >
                  {item.eyebrow}
                </Text>
                <Text
                  accessibilityRole="header"
                  maxFontSizeMultiplier={1.3}
                  style={{
                    color: colors.foreground,
                    fontSize: compact ? 26 : 29,
                    lineHeight: compact ? 32 : 36,
                    fontWeight: "800",
                    letterSpacing: -0.5,
                    textAlign: "center",
                    fontFamily: fonts.heading,
                  }}
                >
                  {item.title}
                </Text>
                <Text
                  textBreakStrategy="balanced"
                  style={{
                    // mutedText is 4.4:1 on this screen's pink middle band; the
                    // foreground at 80% keeps the softer look above 4.5:1.
                    color: colors.foreground,
                    opacity: 0.8,
                    fontSize: 15.5,
                    lineHeight: 23,
                    textAlign: "center",
                    marginTop: 12,
                    maxWidth: 320,
                    fontFamily: fonts.body,
                  }}
                >
                  {item.body}
                </Text>
              </View>
            )}
          />
          </View>

          <View style={{ paddingHorizontal: 24, paddingBottom: 12 }}>
            <View
              accessible
              accessibilityLabel={`Slide ${index + 1} of ${SLIDES.length}`}
              className="flex-row justify-center"
              style={{ gap: 6, marginBottom: 26 }}
            >
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
              <Text style={{ color: colors.buttonText, fontSize: 19, fontWeight: "800", letterSpacing: 0.2, fontFamily: fonts.body }}>
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
              style={({ pressed }) => ({ paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}
            >
              <Ionicons name="heart-outline" size={14} color={colors.mutedText} style={{ marginRight: 5 }} />
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
      // Inactive dots used `border`, which all but vanished on the pink band (1.1:1); this is ≥3:1 in both themes.
      backgroundColor: active ? colors.primary : colors.mutedText,
      opacity: active ? 1 : 0.8,
    }),
    [active, colors.primary, colors.mutedText],
  );
  return <Animated.View style={[{ height: 7, borderRadius: 4 }, style]} />;
}

/**
 * A slide's artwork: one icon (or the logo mark) in a white disc, inside a
 * soft tinted halo. Deliberately small, so the headline carries the slide.
 */
function SlideArt({ art, colors, isDark }: { art: Slide["art"]; colors: ThemeColors; isDark: boolean }) {
  const spec =
    art === "brand"
      ? { halo: colors.primaryLight, icon: null, fg: colors.primary }
      : art === "predict"
        ? { halo: colors.secondaryLight, icon: "calendar-outline" as const, fg: colors.info }
        : { halo: colors.mintLight, icon: "chatbubbles-outline" as const, fg: colors.accentText };

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: 136,
        height: 136,
        borderRadius: 68,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: spec.halo,
      }}
    >
      <View
        style={{
          width: 88,
          height: 88,
          borderRadius: 44,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.surface,
          ...getShadow(colors, isDark),
        }}
      >
        {spec.icon ? (
          <Ionicons name={spec.icon} size={36} color={spec.fg} />
        ) : (
          <Image
            source={require("../assets/images/brand/logo-mark.png")}
            resizeMode="contain"
            style={{ width: 54, height: 54 }}
          />
        )}
      </View>
    </View>
  );
}
