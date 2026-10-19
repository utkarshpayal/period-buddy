import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import Animated, { Easing, FadeIn, useAnimatedProps, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { SymptomPrediction } from "../lib/api";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";
import { Icon } from "./Icon";

/**
 * Symptom likelihood across the cycle's phases (symptom-predictions.tsx).
 * x = phase in cycle order, y = likelihood 0–100%.
 *
 * - Up to MAX_SERIES symptoms are plotted, picked from a chip row (default:
 *   the top ones by peak). A symptom keeps its colour slot while picked, so
 *   adding/removing another never repaints it.
 * - Drag or tap across the plot: a crosshair snaps to the nearest phase and
 *   the readout under the plot lists every plotted series there.
 * - Chart / Table toggle: the table is a symptom × phase heatmap (one hue,
 *   light → dark), so every value is reachable without the chart.
 *
 * Series colours are validated categorical steps (dataviz validate_palette):
 * light on #FFFFFF, dark on #2E2530. Each series also has its own marker
 * shape, so identity is never colour alone.
 */

const MAX_SERIES = 3;
const CHART_HEIGHT = 200;
const PAD = { left: 36, right: 10, top: 12, bottom: 12 };
const STRIP_H = 4;
const GRID_STEPS = [0, 25, 50, 75, 100];
const LABELED_STEPS = new Set([0, 50, 100]);

const SERIES_LIGHT = ["#D63F72", "#4A78C2", "#B5681B"];
const SERIES_DARK = ["#DB5C8A", "#4F86DB", "#C27F1F"];

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);

type Point = { x: number; y: number };

// Fritsch–Carlson monotone cubic: smooth, but never bulges past the data
// (a Catmull-Rom curve would dip below 0% between two low points).
function monotonePath(points: Point[]): string {
  const n = points.length;
  if (n === 0) return "";
  if (n === 1) return `M${points[0].x},${points[0].y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1].x - points[i].x);
    slope.push((points[i + 1].y - points[i].y) / dx[i]);
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  }
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = points[i].x + dx[i] / 3;
    const c1y = points[i].y + (tangent[i] * dx[i]) / 3;
    const c2x = points[i + 1].x - dx[i] / 3;
    const c2y = points[i + 1].y - (tangent[i + 1] * dx[i]) / 3;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${points[i + 1].x.toFixed(1)},${points[i + 1].y.toFixed(1)}`;
  }
  return d;
}

type MarkerShape = "circle" | "square" | "diamond";
const MARKERS: MarkerShape[] = ["circle", "square", "diamond"];

function Marker({ shape, x, y, size, fill, ring }: { shape: MarkerShape; x: number; y: number; size: number; fill: string; ring: string }) {
  const r = size / 2;
  if (shape === "square") {
    return <Rect x={x - r} y={y - r} width={size} height={size} rx={1.5} fill={fill} stroke={ring} strokeWidth={2} />;
  }
  if (shape === "diamond") {
    const s = r * 1.25;
    return <Path d={`M${x},${y - s} L${x + s},${y} L${x},${y + s} L${x - s},${y} Z`} fill={fill} stroke={ring} strokeWidth={2} />;
  }
  return <Circle cx={x} cy={y} r={r} fill={fill} stroke={ring} strokeWidth={2} />;
}

/** Legend / readout key: a short stroke with the series' marker on it. */
function LineKey({ shape, color }: { shape: MarkerShape; color: string }) {
  return (
    <Svg width={20} height={12}>
      <Line x1={1} x2={19} y1={6} y2={6} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Marker shape={shape} x={10} y={6} size={7} fill={color} ring="transparent" />
    </Svg>
  );
}

type Series = {
  symptom: string;
  values: number[];
  peak: number;
  peakIndex: number;
};

/** Memoised: the screen re-renders on every scrub, the chart only when its props change. */
export const SymptomTrendChart = React.memo(function SymptomTrendChart({
  predictions,
  phases,
  phaseLabels,
  phaseColors,
  selectedPhase,
  onSelectPhase,
  sample = false,
  showHeadline = true,
}: {
  predictions: SymptomPrediction[];
  /** Phases to plot, already in cycle order. */
  phases: string[];
  phaseLabels: Record<string, string>;
  /** Optional colour per phase for the strip under the plot. */
  phaseColors?: Record<string, string>;
  selectedPhase?: string | null;
  onSelectPhase?: (phase: string) => void;
  /** Shows a "Sample data" badge (dev builds with no history). */
  sample?: boolean;
  /** The "strongest pattern" line; off when the screen already says it. */
  showHeadline?: boolean;
}) {
  const { colors, isDark, fonts } = useTheme();
  const reduceMotion = useReducedMotion();
  const palette = isDark ? SERIES_DARK : SERIES_LIGHT;
  const [width, setWidth] = useState(0);
  const [view, setView] = useState<"chart" | "table">("chart");

  // Every symptom with its value per phase, strongest first.
  const allSeries: Series[] = useMemo(() => {
    const bySymptom = new Map<string, Map<string, number>>();
    predictions.forEach((p) => {
      const m = bySymptom.get(p.symptom) ?? new Map<string, number>();
      m.set(p.phase, Math.max(m.get(p.phase) ?? 0, p.likelihood));
      bySymptom.set(p.symptom, m);
    });
    return Array.from(bySymptom.entries())
      .map(([symptom, m]) => {
        const values = phases.map((phase) => Math.min(100, Math.max(0, m.get(phase) ?? 0)));
        const peak = Math.max(...values);
        return { symptom, values, peak, peakIndex: values.indexOf(peak) };
      })
      .sort((a, b) => b.peak - a.peak);
  }, [predictions, phases]);

  // Picked symptoms, each holding a fixed colour slot.
  const [picked, setPicked] = useState<{ symptom: string; slot: number }[]>([]);
  useEffect(() => {
    setPicked((prev) => {
      const still = prev.filter((p) => allSeries.some((s) => s.symptom === p.symptom));
      // Same picks: keep the old array so nothing downstream re-renders.
      if (still.length === prev.length && still.length > 0) return prev;
      if (still.length > 0) return still;
      return allSeries.slice(0, MAX_SERIES).map((s, slot) => ({ symptom: s.symptom, slot }));
    });
  }, [allSeries]);

  function togglePick(symptom: string) {
    setPicked((prev) => {
      if (prev.some((p) => p.symptom === symptom)) {
        return prev.length > 1 ? prev.filter((p) => p.symptom !== symptom) : prev;
      }
      if (prev.length < MAX_SERIES) {
        const used = new Set(prev.map((p) => p.slot));
        const slot = [0, 1, 2].find((s) => !used.has(s)) ?? 0;
        return [...prev, { symptom, slot }];
      }
      // Full: the oldest pick makes room and hands over its slot.
      const [oldest, ...rest] = prev;
      return [...rest, { symptom, slot: oldest.slot }];
    });
  }

  const plotted = picked
    .map((p) => ({
      ...p,
      series: allSeries.find((s) => s.symptom === p.symptom),
    }))
    .filter((p): p is { symptom: string; slot: number; series: Series } => !!p.series);

  const strongest = allSeries[0];

  // Geometry
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const colW = phases.length > 0 ? plotW / phases.length : 0;
  const xAt = (i: number) => PAD.left + colW * (i + 0.5);
  const yAt = (v: number) => PAD.top + plotH - (v / 100) * plotH;
  const baseline = yAt(0);
  const activeIndex = selectedPhase ? phases.indexOf(selectedPhase) : -1;

  // Draw-in reveal and gliding crosshair.
  const reveal = useSharedValue(reduceMotion ? 1 : 0);
  const crossX = useSharedValue(0);
  const plottedKey = plotted.map((p) => `${p.symptom}:${p.slot}`).join("|");
  // Replays the draw-in only when the numbers change, not on every refetch
  // that returns the same data.
  const dataKey = allSeries.map((s) => `${s.symptom}=${s.values.join(",")}`).join("|");
  useEffect(() => {
    if (width === 0 || view !== "chart") return;
    if (reduceMotion) {
      reveal.value = 1;
      return;
    }
    reveal.value = 0;
    reveal.value = withTiming(1, {
      duration: 750,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, view, plottedKey, dataKey]);
  useEffect(() => {
    if (activeIndex < 0 || colW === 0) return;
    const target = PAD.left + colW * (activeIndex + 0.5);
    crossX.value =
      reduceMotion || crossX.value === 0
        ? target
        : withTiming(target, {
            duration: 180,
            easing: Easing.out(Easing.quad),
          });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, colW]);

  const revealProps = useAnimatedProps(() => ({
    x: PAD.left - 8 + (width - PAD.left + 16) * reveal.value,
  }));
  const crossProps = useAnimatedProps(() => ({
    x1: crossX.value,
    x2: crossX.value,
  }));

  // Scrub: tap or drag across the plot to pick the nearest phase.
  const scrub = useRef({ colW: 0, count: 0, select: (_: number) => {} });
  scrub.current = {
    colW,
    count: phases.length,
    select: (i: number) => {
      const phase = phases[i];
      if (phase && phase !== selectedPhase) onSelectPhase?.(phase);
    },
  };
  const pan = useMemo(() => {
    const pick = (x: number) => {
      const { colW: w, count, select } = scrub.current;
      if (w <= 0) return;
      select(Math.min(count - 1, Math.max(0, Math.floor(x / w))));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: (e) => pick(e.nativeEvent.locationX),
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
      onPanResponderTerminationRequest: () => true,
    });
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const cardStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    ...getShadow(colors, isDark),
  } as const;

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 16,
              fontWeight: "800",
              fontFamily: fonts.heading,
            }}
            numberOfLines={1}
          >
            Symptom trend
          </Text>
          {sample ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: colors.warningLight,
              }}
            >
              <Text
                style={{
                  fontSize: 11.5,
                  fontWeight: "800",
                  color: colors.warning,
                  fontFamily: fonts.body,
                }}
              >
                Sample data
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={{
            color: colors.mutedText,
            fontSize: 13,
            fontFamily: fonts.body,
            marginTop: 1,
          }}
          numberOfLines={1}
        >
          Likelihood in each phase of your cycle
        </Text>
      </View>
      {phases.length >= 2 && allSeries.length > 0 ? (
        <View
          style={{
            flexDirection: "row",
            padding: 3,
            borderRadius: 12,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          {(["chart", "table"] as const).map((v) => {
            const on = view === v;
            return (
              <Pressable
                key={v}
                onPress={() => setView(v)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={v === "chart" ? "Chart view" : "Table view"}
                hitSlop={4}
                style={{
                  width: 34,
                  height: 28,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? colors.surface : "transparent",
                  ...(on ? getShadow(colors, isDark) : null),
                }}
              >
                <Icon set="mci"
                  name={v === "chart" ? "chart-bell-curve-cumulative" : "table"}
                  size={16}
                  color={on ? colors.foreground : colors.mutedText}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  if (phases.length < 2 || allSeries.length === 0) {
    return (
      <View style={cardStyle}>
        {header}
        <View
          style={{
            marginTop: 14,
            paddingVertical: 22,
            paddingHorizontal: 16,
            alignItems: "center",
            borderRadius: 16,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border,
            backgroundColor: colors.surfaceSoft,
          }}
        >
          <Icon set="mci" name="chart-line-variant" size={28} color={colors.mutedText} />
          <Text
            style={{
              marginTop: 8,
              color: colors.foreground,
              fontSize: 14,
              fontWeight: "700",
              textAlign: "center",
              fontFamily: fonts.body,
            }}
          >
            Your trend line is on its way
          </Text>
          <Text
            style={{
              marginTop: 4,
              color: colors.mutedText,
              fontSize: 13,
              textAlign: "center",
              lineHeight: 18,
              fontFamily: fonts.body,
            }}
          >
            Keep logging symptoms. Once we can predict at least two phases, they&apos;ll be charted here.
          </Text>
        </View>
      </View>
    );
  }

  const gridColor = isDark ? colors.surfaceStrong : colors.border;
  const single = plotted.length === 1 ? plotted[0] : null;
  const singleColor = single ? palette[single.slot] : colors.primary;
  const singlePts = single ? single.series.values.map((v, i) => ({ x: xAt(i), y: yAt(v) })) : [];
  const singleLine = single ? monotonePath(singlePts) : "";
  const singleArea = singleLine
    ? `${singleLine} L${singlePts[singlePts.length - 1].x.toFixed(1)},${baseline} L${singlePts[0].x.toFixed(1)},${baseline} Z`
    : "";

  return (
    <View style={cardStyle}>
      {header}

      {/* Headline: the strongest pattern in the data */}
      {showHeadline ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            gap: 8,
            marginTop: 14,
          }}
        >
          <Text
            style={{
              fontSize: 30,
              fontWeight: "700",
              color: colors.foreground,
              fontFamily: fonts.monoSemiBold ?? fonts.mono,
              letterSpacing: -0.5,
            }}
          >
            {Math.round(strongest.peak)}%
          </Text>
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontSize: 13,
              lineHeight: 18,
              color: colors.mutedText,
              fontFamily: fonts.body,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "700" }}>{strongest.symptom}</Text>
            {` is your strongest pattern, in the ${(phaseLabels[phases[strongest.peakIndex]] ?? phases[strongest.peakIndex]).toLowerCase()} phase`}
          </Text>
        </View>
      ) : null}

      {/* Symptom picker: chips double as the legend */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 14, marginHorizontal: -18 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}
      >
        {allSeries.map((s) => {
          const pick = plotted.find((p) => p.symptom === s.symptom);
          return (
            <Pressable
              key={s.symptom}
              onPress={() => togglePick(s.symptom)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!pick }}
              accessibilityLabel={`${s.symptom}, peak ${Math.round(s.peak)}%`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                height: 34,
                paddingHorizontal: 12,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: pick ? palette[pick.slot] : colors.border,
                backgroundColor: pick ? colors.surfaceSoft : colors.surface,
              }}
            >
              {pick ? <LineKey shape={MARKERS[pick.slot]} color={palette[pick.slot]} /> : null}
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  color: pick ? colors.foreground : colors.mutedText,
                  fontSize: 13,
                  fontWeight: pick ? "700" : "600",
                  fontFamily: fonts.body,
                }}
              >
                {s.symptom}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {view === "chart" ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <View onLayout={onLayout} style={{ marginTop: 14, height: CHART_HEIGHT }}>
            {width > 0 ? (
              <>
                <Svg width={width} height={CHART_HEIGHT}>
                  <Defs>
                    <LinearGradient id="symptomTrendArea" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor={singleColor} stopOpacity={isDark ? 0.3 : 0.18} />
                      <Stop offset="1" stopColor={singleColor} stopOpacity={0} />
                    </LinearGradient>
                  </Defs>

                  <G>
                    {singleArea ? <Path d={singleArea} fill="url(#symptomTrendArea)" /> : null}
                    {plotted.map(({ symptom, slot, series }) => {
                      const pts = series.values.map((v, idx) => ({
                        x: xAt(idx),
                        y: yAt(v),
                      }));
                      return (
                        <React.Fragment key={symptom}>
                          <Path
                            d={monotonePath(pts)}
                            fill="none"
                            stroke={palette[slot]}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {pts.map((p, idx) => (
                            <Marker
                              key={idx}
                              shape={MARKERS[slot]}
                              x={p.x}
                              y={p.y}
                              size={idx === activeIndex ? 12 : 8}
                              fill={palette[slot]}
                              ring={colors.surface}
                            />
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </G>
                  {/* Draw-in: a surface-coloured cover slides off the lines */}
                  <AnimatedRect y={0} width={width} height={CHART_HEIGHT} fill={colors.surface} animatedProps={revealProps} />

                  {/* Gridlines + y labels (recessive) */}
                  {GRID_STEPS.map((step) => (
                    <React.Fragment key={step}>
                      <Line
                        x1={PAD.left}
                        x2={width - PAD.right}
                        y1={yAt(step)}
                        y2={yAt(step)}
                        stroke={step === 0 ? colors.mutedText : gridColor}
                        strokeWidth={1}
                        strokeOpacity={step === 0 ? 0.45 : 0.7}
                        strokeDasharray={step === 0 ? undefined : "2 4"}
                      />
                      {LABELED_STEPS.has(step) ? (
                        <SvgText x={PAD.left - 8} y={yAt(step) + 4} fontSize={11} fontFamily={fonts.mono} fill={colors.mutedText} textAnchor="end">
                          {`${step}%`}
                        </SvgText>
                      ) : null}
                    </React.Fragment>
                  ))}

                  {/* Crosshair on the selected phase */}
                  {activeIndex >= 0 ? (
                    <AnimatedLine
                      animatedProps={crossProps}
                      y1={PAD.top - 4}
                      y2={baseline}
                      stroke={colors.foreground}
                      strokeOpacity={0.35}
                      strokeWidth={1}
                    />
                  ) : null}
                </Svg>

                {/* Scrub layer over the plot */}
                <View
                  {...pan.panHandlers}
                  accessible
                  accessibilityRole="adjustable"
                  accessibilityLabel="Symptom trend chart"
                  accessibilityValue={{
                    text: activeIndex >= 0 ? (phaseLabels[phases[activeIndex]] ?? phases[activeIndex]) : "",
                  }}
                  accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
                  onAccessibilityAction={(e) => {
                    const next = Math.min(phases.length - 1, Math.max(0, activeIndex + (e.nativeEvent.actionName === "increment" ? 1 : -1)));
                    onSelectPhase?.(phases[next]);
                  }}
                  style={{
                    position: "absolute",
                    left: PAD.left,
                    top: 0,
                    width: plotW,
                    height: CHART_HEIGHT,
                  }}
                />
              </>
            ) : null}
          </View>

          {/* Phase axis: colour strip + labels */}
          <View
            style={{
              flexDirection: "row",
              marginLeft: PAD.left,
              marginRight: PAD.right,
              gap: 2,
            }}
          >
            {phases.map((phase, i) => {
              const on = i === activeIndex;
              return (
                <Pressable
                  key={phase}
                  onPress={() => onSelectPhase?.(phase)}
                  style={{ flex: 1, alignItems: "center" }}
                  accessibilityRole="button"
                  accessibilityLabel={phaseLabels[phase] ?? phase}
                >
                  <View
                    style={{
                      alignSelf: "stretch",
                      height: STRIP_H,
                      borderRadius: 2,
                      backgroundColor: phaseColors?.[phase] ?? colors.border,
                      opacity: on ? 1 : 0.45,
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    maxFontSizeMultiplier={1.2}
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      fontWeight: on ? "800" : "600",
                      color: on ? colors.foreground : colors.mutedText,
                      fontFamily: fonts.body,
                    }}
                  >
                    {phaseLabels[phase] ?? phase}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Readout at the selected phase: values lead, names follow */}
          {activeIndex >= 0 ? (
            <View
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: colors.border,
                flexDirection: "row",
                gap: 10,
              }}
            >
              {plotted.map(({ symptom, slot, series }) => (
                <Animated.View key={`${symptom}-${activeIndex}`} entering={FadeIn.duration(160)} style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "700",
                      color: colors.foreground,
                      fontFamily: fonts.monoSemiBold ?? fonts.mono,
                    }}
                  >
                    {Math.round(series.values[activeIndex])}%
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                      marginTop: 2,
                    }}
                  >
                    <LineKey shape={MARKERS[slot]} color={palette[slot]} />
                    <Text
                      numberOfLines={1}
                      style={{
                        flexShrink: 1,
                        fontSize: 12.5,
                        color: colors.mutedText,
                        fontFamily: fonts.body,
                      }}
                    >
                      {symptom}
                    </Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          ) : null}
          <Text
            style={{
              marginTop: 12,
              fontSize: 12.5,
              color: colors.mutedText,
              fontFamily: fonts.body,
            }}
          >
            Drag across the chart to compare phases.
          </Text>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(200)} style={{ marginTop: 14 }}>
          <HeatTable series={allSeries} phases={phases} phaseLabels={phaseLabels} activeIndex={activeIndex} />
        </Animated.View>
      )}
    </View>
  );
});

/** Symptom × phase grid; cell tint = likelihood (one hue, light → dark). */
function HeatTable({
  series,
  phases,
  phaseLabels,
  activeIndex,
}: {
  series: Series[];
  phases: string[];
  phaseLabels: Record<string, string>;
  activeIndex: number;
}) {
  const { colors, isDark, fonts } = useTheme();
  const hue = isDark ? "219, 92, 138" : "214, 63, 114";
  return (
    <View>
      <View style={{ flexDirection: "row", marginBottom: 6 }}>
        <View style={{ flex: 1.5 }} />
        {phases.map((phase, i) => (
          <Text
            key={phase}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 11.5,
              fontWeight: i === activeIndex ? "800" : "600",
              color: i === activeIndex ? colors.foreground : colors.mutedText,
              fontFamily: fonts.body,
            }}
          >
            {phaseLabels[phase] ?? phase}
          </Text>
        ))}
      </View>
      <View style={{ gap: 3 }}>
        {series.map((s) => (
          <View key={s.symptom} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{
                flex: 1.5,
                fontSize: 13,
                fontWeight: "600",
                color: colors.foreground,
                fontFamily: fonts.body,
                paddingRight: 6,
              }}
            >
              {s.symptom}
            </Text>
            {s.values.map((v, i) => {
              const alpha = 0.08 + (v / 100) * 0.82;
              const strong = alpha > 0.55;
              return (
                <View
                  key={i}
                  accessible
                  accessibilityLabel={`${s.symptom}, ${phaseLabels[phases[i]] ?? phases[i]}: ${Math.round(v)}%`}
                  style={{
                    flex: 1,
                    height: 34,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: `rgba(${hue}, ${alpha.toFixed(2)})`,
                    borderWidth: i === s.peakIndex ? 1.5 : 0,
                    borderColor: isDark ? colors.foreground : colors.primaryDark,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: i === s.peakIndex ? "800" : "600",
                      color: strong ? "#FFFFFF" : colors.foreground,
                      fontFamily: fonts.mono,
                    }}
                  >
                    {Math.round(v)}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Text
        style={{
          marginTop: 10,
          fontSize: 12.5,
          color: colors.mutedText,
          fontFamily: fonts.body,
        }}
      >
        Likelihood in % · outlined cell is each symptom&apos;s peak phase.
      </Text>
    </View>
  );
}
