import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { RefreshControl, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { ApiError, genzApi, type CycleSyncCategory } from "../../lib/api";
import type { CyclePhase } from "../../lib/cycle";
import { shareViewAsImage } from "../../lib/genz";

/**
 * Your Era — today's cycle phase as a Gen Z "era" with its aura, how long
 * it lasts, and phase-matched cycle-syncing tips (move / fuel / self-care /
 * vibe) that admins edit in the App CMS. GET /api/genz/era.
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

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Your Era" />
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
                <View className="mx-6 mt-5">
                  {/* Aura card (also the share image) */}
                  <View ref={shareRef} collapsable={false} style={{ borderRadius: 28, ...getShadow(colors, isDark) }}>
                    <LinearGradient
                      colors={data.era.era.aura}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={{ borderRadius: 28, padding: 24, overflow: "hidden" }}
                    >
                      {/* Soft glow blobs for the "aura" look. */}
                      <View style={{ position: "absolute", width: 220, height: 220, borderRadius: 110, backgroundColor: "rgba(255,255,255,0.18)", top: -80, right: -60 }} />
                      <View style={{ position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.12)", bottom: -50, left: -30 }} />

                      <Text style={{ color: WHITE, opacity: 0.9, fontSize: 12, letterSpacing: 2, fontFamily: fonts.heading, fontWeight: "800" }}>
                        {`DAY ${data.era.cycleDay} · ${PHASE_NAMES[data.era.phase].toUpperCase()} PHASE`}
                      </Text>
                      <Text style={{ fontSize: 56, marginTop: 14 }}>{data.era.era.emoji}</Text>
                      <Text style={{ color: WHITE, fontSize: 34, lineHeight: 40, fontFamily: fonts.heading, fontWeight: "900", marginTop: 6 }}>
                        {`In my ${data.era.era.name}`}
                      </Text>
                      <Text style={{ color: WHITE, fontSize: 15, lineHeight: 22, fontFamily: fonts.body, fontWeight: "600", marginTop: 8, opacity: 0.95 }}>
                        {data.era.era.tagline}
                      </Text>

                      <View className="flex-row mt-5" style={{ gap: 10 }}>
                        <View className="flex-1 rounded-2xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.22)" }}>
                          <Text style={{ color: WHITE, fontSize: 22, fontFamily: fonts.monoSemiBold }}>
                            {data.era.daysLeftInPhase === 0 ? "Last day" : `${data.era.daysLeftInPhase}d`}
                          </Text>
                          <Text style={{ color: WHITE, fontSize: 12, fontFamily: fonts.body, fontWeight: "700", opacity: 0.9 }}>left in this era</Text>
                        </View>
                        <View className="flex-1 rounded-2xl px-4 py-3" style={{ backgroundColor: "rgba(255,255,255,0.22)" }}>
                          <Text style={{ color: WHITE, fontSize: 22 }}>{data.era.nextEra.emoji}</Text>
                          <Text style={{ color: WHITE, fontSize: 12, fontFamily: fonts.body, fontWeight: "700", opacity: 0.9 }} numberOfLines={1}>
                            {`Next: ${data.era.nextEra.name}`}
                          </Text>
                        </View>
                      </View>
                      <Text style={{ color: WHITE, opacity: 0.75, fontSize: 11, marginTop: 16, fontFamily: fonts.heading, fontWeight: "800", letterSpacing: 1 }}>
                        🌸 THE NURA{data.era.isEstimate ? " · estimated" : ""}
                      </Text>
                    </LinearGradient>
                  </View>

                  <TouchableOpacity
                    onPress={() =>
                      shareViewAsImage(shareRef, `I'm in my ${data.era.era.name} ${data.era.era.emoji} What era are you in?`, "era")
                    }
                    activeOpacity={0.85}
                    className="flex-row items-center justify-center rounded-2xl py-3.5 mt-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: 8 }}
                  >
                    <Feather name="share-2" size={16} color={colors.foreground} />
                    <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.heading, fontWeight: "800" }}>Share my era</Text>
                  </TouchableOpacity>

                  {/* Cycle timeline: where today sits among the four eras. */}
                  <View className="flex-row mt-6" style={{ gap: 6 }}>
                    {PHASE_ORDER.map((p) => {
                      const info = data.eras[p];
                      const active = p === data.era.phase;
                      return (
                        <View
                          key={p}
                          className="flex-1 items-center rounded-2xl py-3"
                          style={{
                            backgroundColor: active ? info.aura[0] : colors.surface,
                            borderColor: active ? info.aura[0] : colors.border,
                            borderWidth: 1,
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>{info.emoji}</Text>
                          <Text
                            style={{ color: active ? WHITE : colors.mutedText, fontSize: 10.5, fontFamily: fonts.body, fontWeight: "800", marginTop: 4, textAlign: "center" }}
                            numberOfLines={2}
                          >
                            {info.name.replace(" Era", "")}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text className="mt-7 mb-3" style={{ color: colors.foreground, fontSize: 17, fontFamily: fonts.heading, fontWeight: "900" }}>
                    Sync with your cycle
                  </Text>
                  <View className="flex-row" style={{ gap: 8 }}>
                    {CATEGORIES.map((c) => {
                      const active = c.key === category;
                      return (
                        <TouchableOpacity
                          key={c.key}
                          onPress={() => setCategory(c.key)}
                          activeOpacity={0.85}
                          className="flex-1 flex-row items-center justify-center rounded-full py-2.5"
                          style={{ backgroundColor: active ? colors.primary : colors.surface, gap: 5 }}
                        >
                          <Feather name={c.icon} size={13} color={active ? colors.buttonText : colors.mutedText} />
                          <Text style={{ color: active ? colors.buttonText : colors.mutedText, fontSize: 12, fontFamily: fonts.body, fontWeight: "800" }}>
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {data.era.tips[category].length ? (
                    data.era.tips[category].map((t, i) => (
                      <View
                        key={t.id ?? `${t.title}-${i}`}
                        className="flex-row items-start rounded-3xl p-4 mt-3"
                        style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: 14 }}
                      >
                        <View className="items-center justify-center rounded-2xl" style={{ width: 46, height: 46, backgroundColor: `${data.era.era.aura[0]}22` }}>
                          <Text style={{ fontSize: 22 }}>{t.emoji || "✨"}</Text>
                        </View>
                        <View className="flex-1">
                          <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.heading, fontWeight: "800" }}>{t.title}</Text>
                          {t.body ? (
                            <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body, marginTop: 3 }}>{t.body}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))
                  ) : (
                    <EmptyState compact icon="star-four-points-outline" title="No tips here yet" message="Check the other tabs, bestie." />
                  )}

                  <Text className="mt-6 text-center" style={{ color: colors.mutedText, fontSize: 11, fontFamily: fonts.body, lineHeight: 16 }}>
                    General wellness ideas, not medical advice. Listen to your body first.
                  </Text>
                </View>
              </ScrollView>
            ) : null}
          </LoadingErrorState>
        )}
      </SafeAreaView>
    </>
  );
}
