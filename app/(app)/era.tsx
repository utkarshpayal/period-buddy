import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { ApiError, genzApi, type CycleSyncCategory, type CycleSyncTip } from "../../lib/api";
import type { CyclePhase } from "../../lib/cycle";
import { shareViewAsImage } from "../../lib/genz";

/**
 * Your Era — today's cycle phase as a Gen Z "era" with its aura, how long
 * it lasts, and phase-matched cycle-syncing tips (move / fuel / self-care /
 * vibe) that admins edit in the App CMS. GET /api/genz/era. Tips can be
 * ticked off as tried; ticks live on the device and reset each day.
 */

const CATEGORIES: { key: CycleSyncCategory; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { key: "move", label: "Move", icon: "activity" },
  { key: "fuel", label: "Fuel", icon: "coffee" },
  { key: "selfCare", label: "Self-care", icon: "heart" },
  { key: "vibe", label: "Vibe", icon: "music" },
];

const PHASE_ORDER: CyclePhase[] = ["period", "follicular", "ovulation", "luteal"];
const PHASE_NAMES: Record<CyclePhase, string> = {
  period: "Period",
  follicular: "Follicular",
  ovulation: "Ovulation",
  luteal: "Luteal",
};

const WHITE = "#FFFFFF";
const SIDE = 20;

const TRIED_KEY = "nura.era.tried.v1";

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Stable per-tip key: CMS tips have an id, built-in defaults only a title. */
const tipKey = (category: CycleSyncCategory, t: CycleSyncTip) => t.id ?? `${category}:${t.title}`;

/**
 * Tips ticked off as "tried" today, kept on the device and cleared the next
 * day. A storage failure just means ticks don't survive a restart.
 */
function useTriedToday() {
  const [tried, setTried] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    AsyncStorage.getItem(TRIED_KEY)
      .then((raw) => {
        const saved = raw ? (JSON.parse(raw) as { date?: string; keys?: string[] }) : null;
        // Merge, so a tick made before storage answered isn't lost.
        if (saved?.date === todayKey() && Array.isArray(saved.keys)) {
          setTried((current) => new Set([...saved.keys!, ...current]));
        }
      })
      .catch(() => undefined);
  }, []);

  const toggle = useCallback((key: string) => {
    setTried((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      AsyncStorage.setItem(TRIED_KEY, JSON.stringify({ date: todayKey(), keys: [...next] })).catch(() => undefined);
      return next;
    });
  }, []);

  return { tried, toggle };
}

type FlatTip = { key: string; category: CycleSyncCategory; tip: CycleSyncTip };

const flattenTips = (tips: Record<CycleSyncCategory, CycleSyncTip[]>): FlatTip[] =>
  CATEGORIES.flatMap(({ key: category }) => (tips[category] ?? []).map((tip) => ({ key: tipKey(category, tip), category, tip })));

/** Same pick all day, a different one tomorrow. */
const pickOfTheDay = (tips: FlatTip[]) => {
  if (!tips.length) return null;
  const seed = [...todayKey()].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  return tips[seed % tips.length];
};

export default function EraScreen() {
  const router = useRouter();
  const { colors, isDark, fonts } = useTheme();
  const shareRef = useRef<View>(null);
  const [category, setCategory] = useState<CycleSyncCategory>("move");

  // A 404 means no cycle settings yet: show set-up instead of an error.
  const { data: result, loading, refreshing, error, offline, reload } = useAsyncLoad(
    () =>
      genzApi.getEra().catch((err) => {
        if (err instanceof ApiError && err.kind === "notFound") return null;
        throw err;
      }),
    [],
    { refreshOn: ["cycle"] },
  );
  const data = result ?? null;
  const needsSetup = !loading && !error && result === null;
  const { tried, toggle } = useTriedToday();
  const allTips = data ? flattenTips(data.era.tips) : [];
  const pick = pickOfTheDay(allTips);
  const triedCount = allTips.filter((t) => tried.has(t.key)).length;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title="Your Era"
          right={
            data ? (
              <TouchableOpacity
                onPress={() => shareViewAsImage(shareRef, `I'm in my ${data.era.era.name} ${data.era.era.emoji} What era are you in?`, "era")}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Share my era"
                className="items-center justify-center rounded-full"
                style={{ width: 36, height: 36, backgroundColor: colors.surface }}
              >
                <Feather name="share-2" size={16} color={colors.foreground} />
              </TouchableOpacity>
            ) : null
          }
        />
        {needsSetup ? (
          <EmptyState
            icon="calendar-heart"
            title="Let's find your era"
            message="Add your last period in the tracker and we'll tell you which era you're in, plus what to eat, move and vibe to."
            actionLabel="Open tracker"
            onAction={() => router.replace("/(app)/(dashboard)/tracker")}
          />
        ) : (
          <LoadingErrorState
            loading={loading}
            error={error}
            offline={offline}
            onRetry={() => reload()}
            loadingLabel="Reading your aura…"
            errorTitle="Couldn't load your era"
            skeleton={
              <View className="gap-4 px-6 pt-4">
                <SkeletonCard />
                <SkeletonCard />
              </View>
            }
          >
            {data ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
              >
                <View style={{ marginHorizontal: SIDE, marginTop: 12 }}>
                  {/* Aura card (also the share image, so no buttons inside it). */}
                  <View ref={shareRef} collapsable={false} style={{ borderRadius: 24, ...getShadow(colors, isDark) }}>
                    <LinearGradient
                      colors={data.era.era.aura}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ borderRadius: 24, padding: 22, overflow: "hidden" }}
                    >
                      {/* Soft glow for the "aura" look. */}
                      <View style={{ position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.16)", top: -90, right: -70 }} />

                      <View className="flex-row items-center" style={{ gap: 14 }}>
                        <View className="items-center justify-center rounded-full" style={{ width: 60, height: 60, backgroundColor: "rgba(255,255,255,0.25)" }}>
                          <Text style={{ fontSize: 32 }}>{data.era.era.emoji}</Text>
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: WHITE, opacity: 0.9, fontSize: 12, fontFamily: fonts.body, fontWeight: "700" }}>
                            {`Day ${data.era.cycleDay} · ${PHASE_NAMES[data.era.phase]} phase${data.era.isEstimate ? " · estimated" : ""}`}
                          </Text>
                          <Text style={{ color: WHITE, fontSize: 24, lineHeight: 30, fontFamily: fonts.heading, fontWeight: "900", marginTop: 2 }}>
                            {data.era.era.name}
                          </Text>
                        </View>
                      </View>

                      <Text style={{ color: WHITE, fontSize: 15, lineHeight: 22, fontFamily: fonts.body, fontWeight: "600", marginTop: 14, opacity: 0.96 }}>
                        {data.era.era.tagline}
                      </Text>

                      <View className="flex-row items-center rounded-2xl mt-4" style={{ backgroundColor: "rgba(255,255,255,0.2)", paddingVertical: 10, paddingHorizontal: 14 }}>
                        <View className="flex-1">
                          <Text style={{ color: WHITE, fontSize: 16, fontFamily: fonts.monoSemiBold }}>
                            {data.era.daysLeftInPhase === 0 ? "Last day" : `${data.era.daysLeftInPhase} ${data.era.daysLeftInPhase === 1 ? "day" : "days"}`}
                          </Text>
                          <Text style={{ color: WHITE, opacity: 0.85, fontSize: 11.5, fontFamily: fonts.body, fontWeight: "600" }}>left in this era</Text>
                        </View>
                        <View style={{ width: 1, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.35)", marginHorizontal: 14 }} />
                        <View className="flex-1">
                          <Text style={{ color: WHITE, fontSize: 14.5, fontFamily: fonts.body, fontWeight: "700" }} numberOfLines={1}>
                            {`${data.era.nextEra.emoji} ${data.era.nextEra.name.replace(" Era", "")}`}
                          </Text>
                          <Text style={{ color: WHITE, opacity: 0.85, fontSize: 11.5, fontFamily: fonts.body, fontWeight: "600" }}>up next</Text>
                        </View>
                      </View>

                      <Text style={{ color: WHITE, opacity: 0.7, fontSize: 10.5, marginTop: 14, fontFamily: fonts.body, fontWeight: "700", letterSpacing: 1 }}>
                        🌸 THE NURA
                      </Text>
                    </LinearGradient>
                  </View>

                  {/* Cycle track: the four eras in order, today's highlighted. */}
                  <View style={{ marginTop: 22 }}>
                    <View style={{ position: "absolute", top: 18, left: "12.5%", right: "12.5%", height: 2, borderRadius: 1, backgroundColor: colors.border }} />
                    <View className="flex-row">
                      {PHASE_ORDER.map((p) => {
                        const info = data.eras[p];
                        const active = p === data.era.phase;
                        return (
                          <View key={p} className="flex-1 items-center" accessibilityLabel={`${info.name}${active ? ", you are here" : ""}`}>
                            <View
                              className="items-center justify-center rounded-full"
                              style={{
                                width: 38,
                                height: 38,
                                backgroundColor: active ? info.aura[0] : colors.surface,
                                borderWidth: 3,
                                borderColor: colors.background,
                              }}
                            >
                              <Text style={{ fontSize: active ? 18 : 16, opacity: active ? 1 : 0.75 }}>{info.emoji}</Text>
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{
                                color: active ? colors.foreground : colors.mutedText,
                                fontSize: 11.5,
                                fontFamily: fonts.body,
                                fontWeight: active ? "800" : "600",
                                marginTop: 5,
                              }}
                            >
                              {PHASE_NAMES[p]}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* Tips */}
                <View style={{ paddingHorizontal: SIDE, marginTop: 28 }}>
                  <View className="flex-row items-baseline justify-between">
                    <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: fonts.heading, fontWeight: "800" }}>Sync with your cycle</Text>
                    {allTips.length ? (
                      <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body, fontWeight: "600" }}>{`${triedCount}/${allTips.length} today`}</Text>
                    ) : null}
                  </View>
                  {allTips.length ? (
                    <>
                      <View className="mt-2.5 rounded-full overflow-hidden" style={{ height: 5, backgroundColor: colors.border }}>
                        <View style={{ width: `${(triedCount / allTips.length) * 100}%`, height: "100%", backgroundColor: data.era.era.aura[0], borderRadius: 999 }} />
                      </View>
                      <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body, marginTop: 6 }}>
                        {triedCount === allTips.length
                          ? "You tried every tip today. Proud of you 🎉"
                          : "Tick a tip once you've tried it. Resets every day."}
                      </Text>
                    </>
                  ) : null}

                  {pick ? (
                    <TouchableOpacity
                      onPress={() => toggle(pick.key)}
                      activeOpacity={0.85}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: tried.has(pick.key) }}
                      accessibilityLabel={`Today's pick: ${pick.tip.title}. ${pick.tip.body}`}
                      className="rounded-3xl mt-4"
                      style={{ backgroundColor: `${data.era.era.aura[0]}1A`, padding: 16 }}
                    >
                      <Text style={{ color: data.era.era.aura[0], fontSize: 12, fontFamily: fonts.body, fontWeight: "800" }}>
                        {`✨ Today's pick · ${CATEGORIES.find((c) => c.key === pick.category)?.label}`}
                      </Text>
                      <View className="flex-row items-start mt-2.5" style={{ gap: 12 }}>
                        <Text style={{ fontSize: 26, lineHeight: 32 }}>{pick.tip.emoji || "✨"}</Text>
                        <View className="flex-1">
                          <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: fonts.heading, fontWeight: "800" }}>{pick.tip.title}</Text>
                          {pick.tip.body ? (
                            <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 20, fontFamily: fonts.body, marginTop: 3 }}>{pick.tip.body}</Text>
                          ) : null}
                        </View>
                        <CheckCircle done={tried.has(pick.key)} color={data.era.era.aura[0]} />
                      </View>
                    </TouchableOpacity>
                  ) : null}

                  {/* Category switcher: one segmented control. */}
                  <View className="flex-row rounded-full mt-5" style={{ backgroundColor: colors.surface, padding: 4 }}>
                    {CATEGORIES.map((c) => {
                      const active = c.key === category;
                      const inCategory = allTips.filter((t) => t.category === c.key);
                      const done = inCategory.filter((t) => tried.has(t.key)).length;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          onPress={() => setCategory(c.key)}
                          activeOpacity={0.85}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${c.label}, ${done} of ${inCategory.length} tried`}
                          className="flex-1 items-center justify-center rounded-full"
                          style={{ height: 36, backgroundColor: active ? colors.primary : "transparent" }}
                        >
                          <Text style={{ color: active ? colors.buttonText : colors.mutedText, fontSize: 13, fontFamily: fonts.body, fontWeight: "700" }} numberOfLines={1}>
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={{ marginTop: 6 }}>
                  {data.era.tips[category].length ? (
                    allTips
                      .filter((t) => t.category === category)
                      .map((item, i, list) => (
                        <TipRow key={item.key} item={item} done={tried.has(item.key)} onToggle={toggle} color={data.era.era.aura[0]} last={i === list.length - 1} />
                      ))
                  ) : (
                    <EmptyState compact icon="star-four-points-outline" title="No tips here yet" message="Try another tab for today's ideas." />
                  )}
                </View>

                <Text className="mt-6 text-center" style={{ color: colors.mutedText, fontSize: 11.5, fontFamily: fonts.body, lineHeight: 16, paddingHorizontal: 32 }}>
                  General wellness ideas, not medical advice. Listen to your body first.
                </Text>
              </ScrollView>
            ) : null}
          </LoadingErrorState>
        )}
      </SafeAreaView>
    </>
  );
}

function CheckCircle({ done, color }: { done: boolean; color: string }) {
  const { colors } = useTheme();
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: 24, height: 24, marginTop: 2, backgroundColor: done ? color : "transparent", borderColor: done ? color : colors.border, borderWidth: 1.5 }}
    >
      {done ? <Feather name="check" size={14} color={WHITE} /> : null}
    </View>
  );
}

/** A tip as an open list row the user can tick off as tried today. */
function TipRow({ item, done, onToggle, color, last }: { item: FlatTip; done: boolean; onToggle: (key: string) => void; color: string; last: boolean }) {
  const { colors, fonts } = useTheme();
  const { tip } = item;
  return (
    <TouchableOpacity
      onPress={() => onToggle(item.key)}
      activeOpacity={0.6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`${tip.title}. ${tip.body}`}
      accessibilityHint={done ? "Marks it as not tried" : "Marks it as tried today"}
      className="flex-row items-start"
      style={{ paddingHorizontal: SIDE, paddingVertical: 14, gap: 12 }}
    >
      <View className="items-center justify-center rounded-full" style={{ width: 40, height: 40, backgroundColor: `${color}1F` }}>
        <Text style={{ fontSize: 19 }}>{tip.emoji || "✨"}</Text>
      </View>
      <View className="flex-1" style={{ opacity: done ? 0.55 : 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, fontWeight: "700" }}>{tip.title}</Text>
        {tip.body ? <Text style={{ color: colors.mutedText, fontSize: 13.5, lineHeight: 19, fontFamily: fonts.body, marginTop: 2 }}>{tip.body}</Text> : null}
      </View>
      <CheckCircle done={done} color={color} />
      {!last ? (
        <View style={{ position: "absolute", bottom: 0, left: SIDE + 40 + 12, right: SIDE, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      ) : null}
    </TouchableOpacity>
  );
}
