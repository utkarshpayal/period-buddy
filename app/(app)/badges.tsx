import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Easing, Modal, RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../components/auth-context";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ColumnLabel } from "../../components/ColumnLabel";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { AppModalHost } from "../../components/modals/AppModalHost";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { genzApi, type Badge } from "../../lib/api";
import { shareViewAsImage } from "../../lib/genz";
import { Icon } from "../../components/Icon";

/**
 * Streaks & Badges — the logging streak with its next milestone, and every
 * badge (GET /api/genz/badges). Badges the user hasn't seen earned before on
 * this device get a confetti reveal; "seen" is only a device-local memory
 * (AsyncStorage), the earned state itself always comes from the server.
 */

// Per account: sign-out doesn't clear it, and a second account on this phone
// must still get its own reveals.
const seenKey = (userId: string) => `period-buddy.genz.seen-badges:${userId}`;
const WHITE = "#FFFFFF";
const CONFETTI = ["🎉", "💖", "🔥", "🌸", "🎊", "💅", "🫶", "🌷"];

function Confetti() {
  const { width, height } = Dimensions.get("window");
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        emoji: CONFETTI[i % CONFETTI.length],
        x: Math.random() * width,
        delay: Math.random() * 500,
        drift: (Math.random() - 0.5) * 120,
        spin: Math.random() > 0.5 ? 1 : -1,
        anim: new Animated.Value(0),
      })),
    [width],
  );

  useEffect(() => {
    Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.anim, { toValue: 1, duration: 2200, delay: p.delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [pieces]);

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      {pieces.map((p, i) => (
        <Animated.Text
          key={i}
          style={{
            position: "absolute",
            left: p.x,
            top: -40,
            fontSize: 26,
            opacity: p.anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.85] }) },
              { translateX: p.anim.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: p.anim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.spin * 360}deg`] }) },
            ],
          }}
        >
          {p.emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

function Unlocked({ badges, onDone }: { badges: Badge[]; onDone: () => void }) {
  const { fonts } = useTheme();
  const shareRef = useRef<View>(null);
  const [i, setI] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;
  const badge = badges[i];

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [i, pop]);

  if (!badge) return null;
  const next = () => (i < badges.length - 1 ? setI(i + 1) : onDone());

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onDone}>
      <View className="flex-1 items-center justify-center px-8" style={{ backgroundColor: "rgba(10,4,30,0.8)" }}>
        <Confetti key={badge.key} />
        <Animated.View style={{ width: "100%", transform: [{ scale: pop }] }}>
          <View ref={shareRef} collapsable={false}>
            <LinearGradient colors={["#FFB547", "#FF5E8A", "#B24BF3"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 30, padding: 28, alignItems: "center" }}>
              <Text style={{ color: WHITE, fontSize: 12, letterSpacing: 2, fontFamily: fonts.heading, fontWeight: "800", opacity: 0.9 }}>BADGE UNLOCKED</Text>
              <Text style={{ fontSize: 88, marginTop: 10 }}>{badge.emoji}</Text>
              <Text style={{ color: WHITE, fontSize: 28, fontFamily: fonts.heading, fontWeight: "900", marginTop: 6, textAlign: "center" }}>{badge.title}</Text>
              <Text style={{ color: WHITE, fontSize: 14, fontFamily: fonts.body, fontWeight: "600", marginTop: 6, textAlign: "center", opacity: 0.95 }}>
                {badge.description}
              </Text>
              <Text style={{ color: WHITE, opacity: 0.75, fontSize: 12.5, marginTop: 18, fontFamily: fonts.heading, fontWeight: "800", letterSpacing: 1 }}>🌸 THE NURA</Text>
            </LinearGradient>
          </View>
        </Animated.View>
        <View className="w-full mt-5" style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={() => shareViewAsImage(shareRef, `Just unlocked ${badge.emoji} ${badge.title} on The Nura`, "badges")}
            activeOpacity={0.85}
            className="flex-row items-center justify-center rounded-2xl py-3.5"
            style={{ backgroundColor: WHITE, gap: 8 }}
          >
            <Icon set="feather" name="share" size={16} color="#B24BF3" />
            <Text style={{ color: "#B24BF3", fontSize: 15, fontFamily: fonts.heading, fontWeight: "900" }}>Flex it</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={next} activeOpacity={0.8} className="items-center py-2">
            <Text style={{ color: WHITE, fontSize: 14, fontFamily: fonts.body, fontWeight: "700" }}>
              {i < badges.length - 1 ? `Next (${badges.length - i - 1} more) →` : "Let's go"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <AppModalHost inline />
    </Modal>
  );
}

export default function BadgesScreen() {
  const router = useRouter();
  const { colors, isDark, fonts } = useTheme();
  const { user } = useAuth();
  const userId = user?._id;
  const [celebrate, setCelebrate] = useState<Badge[]>([]);
  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(() => genzApi.getBadges(), [], {
    refreshOn: ["cycle", "dashboard", "habits", "circles"],
    cacheKey: "genz:badges",
  });

  // Reveal badges earned since this device last looked.
  useEffect(() => {
    if (!data || !userId) return;
    const key = seenKey(userId);
    let cancelled = false;
    (async () => {
      let seen: string[] | null = null;
      try {
        const raw = await AsyncStorage.getItem(key);
        seen = raw ? (JSON.parse(raw) as string[]) : null;
      } catch {
        seen = null;
      }
      const earned = data.badges.filter((b) => b.earned);
      // First visit ever: celebrate what's already earned, capped so a long-time user isn't stuck tapping through 10 modals.
      const fresh = earned.filter((b) => !(seen ?? []).includes(b.key)).slice(0, 3);
      if (!cancelled && fresh.length) setCelebrate(fresh);
      AsyncStorage.setItem(key, JSON.stringify(earned.map((b) => b.key))).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, [data, userId]);

  const streak = data?.streak;
  const milestoneProgress = streak?.nextMilestone ? Math.min(1, streak.current / streak.nextMilestone) : 1;
  const sorted = data ? [...data.badges].sort((a, b) => Number(b.earned) - Number(a.earned)) : [];
  // Three a row, equal widths, so a short last row lines up with the grid.
  const badgeRows: Badge[][] = [];
  for (let i = 0; i < sorted.length; i += 3) badgeRows.push(sorted.slice(i, i + 3));

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Streaks & Badges" />
        <LoadingErrorState
          loading={loading}
          error={error}
          offline={offline}
          onRetry={() => reload()}
          loadingLabel="Counting your W's…"
          errorTitle="Couldn't load your badges"
          skeleton={
            <View className="gap-4 px-6 pt-4">
              <SkeletonCard />
              <SkeletonCard />
            </View>
          }
        >
          {data && streak ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 60 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
            >
              <View className="mx-6 mt-3">
                <View style={{ borderRadius: 24, ...getShadow(colors, isDark) }}>
                  <LinearGradient colors={["#FF9F1C", "#FF4D6D", "#C9184A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 24, padding: 22 }}>
                    <View className="flex-row items-center justify-between">
                      <View>
                        <Text style={{ color: WHITE, opacity: 0.9, fontSize: 12, letterSpacing: 2, fontFamily: fonts.heading, fontWeight: "800" }}>CURRENT STREAK</Text>
                        <View className="flex-row items-end mt-1" style={{ gap: 6 }}>
                          <Text style={{ color: WHITE, fontSize: 52, lineHeight: 58, fontFamily: fonts.monoSemiBold }}>{streak.current}</Text>
                          <Text style={{ color: WHITE, fontSize: 17, fontFamily: fonts.heading, fontWeight: "700", marginBottom: 9 }}>
                            {streak.current === 1 ? "day" : "days"}
                          </Text>
                        </View>
                      </View>
                      <View className="items-center justify-center rounded-full" style={{ width: 72, height: 72, backgroundColor: "rgba(255,255,255,0.2)" }}>
                        <Text style={{ fontSize: 38 }}>{streak.current > 0 ? "🔥" : "🌱"}</Text>
                      </View>
                    </View>

                    {streak.nextMilestone ? (
                      <>
                        <View className="mt-4 overflow-hidden rounded-full" style={{ height: 8, backgroundColor: "rgba(255,255,255,0.3)" }}>
                          <View style={{ height: 8, width: `${Math.round(milestoneProgress * 100)}%`, backgroundColor: WHITE, borderRadius: 8 }} />
                        </View>
                        <Text style={{ color: WHITE, fontSize: 13, fontFamily: fonts.body, fontWeight: "700", marginTop: 8 }}>
                          {`${streak.nextMilestone - streak.current} more ${streak.nextMilestone - streak.current === 1 ? "day" : "days"} to hit ${streak.nextMilestone} 🎯`}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ color: WHITE, fontSize: 13, fontFamily: fonts.body, fontWeight: "700", marginTop: 10 }}>Every milestone cleared. Actual legend 👑</Text>
                    )}
                    <Text style={{ color: WHITE, opacity: 0.85, fontSize: 12, fontFamily: fonts.body, fontWeight: "600", marginTop: 6 }}>
                      {`Longest ever: ${streak.longest} ${streak.longest === 1 ? "day" : "days"}`}
                    </Text>
                  </LinearGradient>
                </View>

                {streak.current === 0 ? (
                  <TouchableOpacity
                    onPress={() => router.push("/(app)/(dashboard)/tracker")}
                    activeOpacity={0.85}
                    className="flex-row items-center justify-center rounded-2xl py-3.5 mt-3"
                    style={{ backgroundColor: colors.primary, gap: 8 }}
                  >
                    <Icon set="feather" name="edit-3" size={16} color={colors.buttonText} />
                    <Text style={{ color: colors.buttonText, fontSize: 14, fontFamily: fonts.heading, fontWeight: "800" }}>Log today to start a streak</Text>
                  </TouchableOpacity>
                ) : null}

                <View className="flex-row items-baseline justify-between mt-7 mb-1">
                  <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: fonts.heading, fontWeight: "900" }}>Badges</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.mono }}>{`${data.earnedCount}/${data.badges.length}`}</Text>
                </View>

                <View style={{ gap: 10, marginTop: 10 }}>
                  {badgeRows.map((row) => (
                    <View key={row[0].key} className="flex-row" style={{ gap: 10 }}>
                      {row.map((b) => {
                        const pct = Math.min(100, Math.round((b.progress.current / b.progress.target) * 100));
                        return (
                          <TouchableOpacity
                            key={b.key}
                            activeOpacity={b.earned ? 0.8 : 1}
                            onPress={() => b.earned && setCelebrate([b])}
                            className="rounded-3xl"
                            style={{
                              flex: 1,
                              paddingVertical: 14,
                              paddingHorizontal: 10,
                              backgroundColor: colors.surface,
                              borderColor: b.earned ? colors.gold : colors.border,
                              borderWidth: b.earned ? 1.5 : 1,
                              alignItems: "center",
                              ...(b.earned ? getShadow(colors, isDark) : null),
                            }}
                            accessibilityLabel={`${b.title}, ${b.earned ? "earned" : `${b.progress.current} of ${b.progress.target}`}. ${b.description}`}
                          >
                            <View
                              className="items-center justify-center rounded-full"
                              style={{ width: 54, height: 54, backgroundColor: b.earned ? colors.goldLight : colors.track }}
                            >
                              <Text style={{ fontSize: 28, opacity: b.earned ? 1 : 0.35 }}>{b.emoji}</Text>
                              {b.earned ? null : (
                                <View
                                  className="items-center justify-center rounded-full"
                                  style={{ position: "absolute", right: -3, bottom: -3, width: 22, height: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
                                >
                                  <Icon set="feather" name="lock" size={11} color={colors.mutedText} />
                                </View>
                              )}
                            </View>
                            <ColumnLabel
                              lines={2}
                              lineHeight={17}
                              style={{ color: b.earned ? colors.foreground : colors.mutedText, fontSize: 13, fontFamily: fonts.heading, fontWeight: "700", marginTop: 10 }}
                            >
                              {b.title}
                            </ColumnLabel>
                            {b.earned ? (
                              <Text style={{ color: colors.mutedText, fontSize: 12, lineHeight: 16, fontFamily: fonts.body, marginTop: 3, textAlign: "center" }} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                                {b.description}
                              </Text>
                            ) : (
                              <>
                                <View className="mt-2.5 w-full overflow-hidden rounded-full" style={{ height: 4, backgroundColor: colors.track }}>
                                  <View style={{ height: 4, width: `${pct}%`, backgroundColor: colors.primary }} />
                                </View>
                                <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.mono, marginTop: 4 }}>
                                  {`${b.progress.current}/${b.progress.target}`}
                                </Text>
                              </>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                      {Array.from({ length: 3 - row.length }, (_, k) => (
                        <View key={`gap-${k}`} style={{ flex: 1 }} />
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          ) : null}
        </LoadingErrorState>
      </SafeAreaView>
      {celebrate.length ? <Unlocked badges={celebrate} onDone={() => setCelebrate([])} /> : null}
    </>
  );
}
