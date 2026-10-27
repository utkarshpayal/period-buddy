import { useIsFocused } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BodyViewer2D } from "./BodyViewer2D";
import type { BodyViewer3D as BodyViewer3DComponent, BodyViewer3DHandle } from "./BodyViewer3D";
import { PAIN_COLORS } from "./painColors";
import { SymptomDetailSheet } from "./SymptomDetailSheet";
import { hasWebGL } from "../three/glSupport";
import { Icon } from "../Icon";
import { useTheme } from "../theme";
import { withAlpha } from "../ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { useTodayKey } from "../../hooks/useTodayKey";
import { cycleApi } from "../../lib/api";
import type { BodyView } from "../../lib/bodyModel.generated";
import {
  buildBodyMap,
  INTENSITY_LABEL,
  RANGES,
  regionLabel,
  shiftDayKey,
  urgentAdviceFor,
  type BodyRegionId,
  type Intensity,
  type RangeKey,
  type SymptomSide,
} from "../../lib/bodyRegions";
import { haptics } from "../../lib/haptics";

// Loaded only when the build has expo-gl (the 3D viewer imports it at the
// top; Expo Router loads every screen at start-up, so a static import would
// crash any older build on launch).
const BodyViewer3D: typeof BodyViewer3DComponent | null = hasWebGL()
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./BodyViewer3D").BodyViewer3D
  : null;

/**
 * "Where": the person's logged symptoms on a 3D body (2D when 3D can't run),
 * the "On your body" tab of Symptom Trends (the other tab answers "when").
 * Fills the page and stays calm: on top a range pill, a colour-key button and
 * a turn-round button; at the bottom only the spot chips. The body is fitted
 * to the screen's shape. Drag and pinch do the rest.
 * Only what's unique to the body is here: which spots, how often (dot colour)
 * and each area's safety advice. Counts and phase patterns stay in the trends.
 * Built from the day logs; nothing is entered here. See docs/BODY_MAP.md.
 */

async function loadLogs(todayKey: string) {
  const year = Number(todayKey.slice(0, 4));
  const earliest = Number(shiftDayKey(todayKey, -90).slice(0, 4));
  const years = earliest < year ? [earliest, year] : [year];
  return (await Promise.all(years.map((y) => cycleApi.getYearLogs(y)))).flat();
}

class ViewerBoundary extends Component<{ onError: () => void; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function BodyMapSection({ refreshKey }: { refreshKey: number }) {
  const { colors, isDark, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const todayKey = useTodayKey();
  const reduceMotion = useReducedMotion();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(s === "active"));
    return () => sub.remove();
  }, []);

  const { data: logs, loading, reload } = useAsyncLoad(() => loadLogs(todayKey), [todayKey], { refreshOn: ["cycle"] });
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    reload(true);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch only when the screen is pulled

  const [rangeKey, setRangeKey] = useState<RangeKey>("month");
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const map = useMemo(() => buildBodyMap(logs ?? [], todayKey, range.days), [logs, todayKey, range.days]);

  const webgl = useMemo(() => hasWebGL(), []);
  const [modelFailed, setModelFailed] = useState(false);
  const show3D = webgl && !modelFailed && BodyViewer3D != null;
  const viewer = useRef<BodyViewer3DHandle>(null);
  const [view, setView] = useState<BodyView>("front");
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const onModelError = useCallback(() => setModelFailed(true), []);

  const open = useCallback((key: string) => {
    haptics.select();
    setSelected(key);
    setSheetOpen(true);
  }, []);

  /** From a spot chip: turn the body to it first, then open it. */
  const focusSpot = (key: string) => {
    haptics.select();
    setSelected(key);
    if (show3D) {
      viewer.current?.focus(key);
      setTimeout(() => setSheetOpen(true), reduceMotion ? 0 : 520);
    } else {
      setView(/^(lower_back|upper_back|buttock)/.test(key) ? "back" : "front");
      setSheetOpen(true);
    }
  };

  const region = (selected?.split(":")[0] ?? "head") as BodyRegionId;
  const side = selected?.split(":")[1] as SymptomSide | undefined;
  const marker = map.markers.find((m) => m.key === selected);
  // One chip per area (both breasts are one "Breasts" chip).
  const spots = useMemo(() => {
    const seen = new Set<string>();
    return map.markers.filter((m) => {
      const id = BODY_REGION_SINGLE.has(m.regionId) ? m.regionId : m.key;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [map.markers]);

  const gradient: [string, string, string] = isDark ? [colors.surfaceStrong, colors.surface, colors.background] : ["#FFF6F2", "#FBEFF4", "#F4EEFA"];

  return (
    <View style={{ flex: 1 }}>
        <LinearGradient colors={gradient} style={{ flex: 1 }}>
          {loading && !logs ? null : show3D && BodyViewer3D ? (
            <ViewerBoundary onError={onModelError}>
              <BodyViewer3D
                ref={viewer}
                markers={map.markers}
                selectedKey={selected}
                active={focused && appActive && !sheetOpen}
                reduceMotion={reduceMotion}
                onTapAnchor={open}
                onError={onModelError}
              />
            </ViewerBoundary>
          ) : (
            // Room for the controls on top and the chips at the bottom.
            <View style={{ flex: 1, paddingTop: 56, paddingBottom: insets.bottom + (spots.length ? 64 : 16) }}>
              <BodyViewer2D view={view === "back" ? "back" : "front"} markers={map.markers} selectedKey={selected} reduceMotion={reduceMotion} onTapAnchor={open} />
            </View>
          )}

          {/* Range: one pill that steps 7 → 30 → 90 days */}
          <Pressable
            onPress={() => {
              haptics.select();
              const i = RANGES.findIndex((r) => r.key === rangeKey);
              setRangeKey(RANGES[(i + 1) % RANGES.length].key);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Showing the last ${range.label}. Tap to change.`}
            style={{ position: "absolute", left: 12, top: 12, flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: withAlpha(colors.surface, 0.92), borderWidth: 1, borderColor: colors.border }}
          >
            <Icon set="ion" name="calendar-outline" size={14} color={colors.text} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>{`Last ${range.label}`}</Text>
            <Icon set="ion" name="swap-horizontal" size={13} color={colors.mutedText} />
          </Pressable>
          {/* Turn round: front ↔ back (drag and pinch do the rest in 3D) */}
          <View style={{ position: "absolute", right: 12, top: 12, flexDirection: "row", gap: 8 }}>
            <Round icon="information-circle-outline" label={showKey ? "Hide the colour key" : "What the colours mean"} onPress={() => setShowKey((v) => !v)} />
            <Round
              icon="sync-outline"
              label={view === "back" ? "Show the front" : "Show the back"}
              onPress={() => {
                haptics.select();
                const next: BodyView = view === "back" ? "front" : "back";
                setView(next);
                if (show3D) viewer.current?.setView(next);
              }}
            />
          </View>
          {/* Colour key, on request */}
          {showKey ? (
            <View pointerEvents="none" style={{ position: "absolute", right: 12, top: 60, gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: withAlpha(colors.surface, 0.96), borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.mutedText }}>How often you logged it</Text>
              {([1, 2, 3] as Intensity[]).map((i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PAIN_COLORS[i] }} />
                  <Text style={{ fontSize: 13, color: colors.text }}>{INTENSITY_LABEL[i]}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {!loading && !map.markers.length ? (
            <View pointerEvents="none" style={{ position: "absolute", left: 24, right: 24, top: "40%", alignItems: "center" }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: withAlpha(colors.surface, 0.92) }}>
                <Text style={{ fontSize: 14, color: colors.text, textAlign: "center", fontFamily: fonts.body }}>
                  {`No body symptoms logged in the last ${range.label}`}
                </Text>
              </View>
            </View>
          ) : null}
          {/* The spots, as chips: a quick way to each one (and for screen readers). */}
          {spots.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12 }}
              contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
            >
              {spots.map((m) => {
                const single = BODY_REGION_SINGLE.has(m.regionId);
                const label = regionLabel(m.regionId, single ? undefined : (m.key.split(":")[1] as SymptomSide));
                return (
                  <Pressable
                    key={m.key}
                    onPress={() => focusSpot(m.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label}: ${m.symptoms.map((s) => s.label).join(", ")}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 999,
                      backgroundColor: selected === m.key ? withAlpha(colors.surface, 0.98) : withAlpha(colors.surface, 0.9),
                      borderWidth: 1,
                      borderColor: selected === m.key ? PAIN_COLORS[m.intensity] : colors.border,
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: PAIN_COLORS[m.intensity] }} />
                    <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

        </LinearGradient>

      <SymptomDetailSheet
        visible={sheetOpen}
        title={regionLabel(region, BODY_REGION_SINGLE.has(region) ? undefined : side)}
        urgentAdvice={urgentAdviceFor(region)}
        symptoms={marker?.symptoms ?? []}
        rangeDays={range.days}
        rangeLabel={range.label}
        onClose={() => {
          setSheetOpen(false);
          setSelected(null);
        }}
        onAskNura={(q) => {
          setSheetOpen(false);
          router.push(`/(app)/qa?new=1&q=${encodeURIComponent(q)}` as never);
        }}
        onTalkToDoctor={() => {
          setSheetOpen(false);
          router.push("/(app)/consultation" as never);
        }}
      />
    </View>
  );

  function Round({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={4}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(colors.surface, 0.92), borderWidth: 1, borderColor: colors.border }}
      >
        <Icon set="ion" name={icon as any} size={18} color={colors.text} />
      </Pressable>
    );
  }
}

/** Areas that read as one spot even when both sides are marked. */
const BODY_REGION_SINGLE = new Set<string>(["breast"]);
