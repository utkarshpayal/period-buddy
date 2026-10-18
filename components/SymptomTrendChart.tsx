import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { SymptomPrediction } from "../lib/api";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

/**
 * Symptom likelihood across the cycle's phases (symptom-predictions.tsx).
 * x = phase (in cycle order), y = likelihood 0–100%. Plots the top
 * MAX_SERIES symptoms by peak likelihood as smooth monotone curves (no
 * overshoot past 0/100), each with its own marker shape so identity isn't
 * colour-alone. Tap a phase column to read every series' value there (and
 * select that phase on the screen); tap a legend chip to focus a series.
 */

const MAX_SERIES = 3;
const CHART_HEIGHT = 210;
const PAD = { left: 38, right: 14, top: 14, bottom: 30 };
const GRID_STEPS = [0, 25, 50, 75, 100];

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

function LegendMarker({ shape, color }: { shape: MarkerShape; color: string }) {
  return (
    <Svg width={12} height={12}>
      <Marker shape={shape} x={6} y={6} size={8} fill={color} ring="transparent" />
    </Svg>
  );
}

export function SymptomTrendChart({
  predictions,
  phases,
  phaseLabels,
  selectedPhase,
  onSelectPhase,
}: {
  predictions: SymptomPrediction[];
  /** Phases to plot, already in cycle order. */
  phases: string[];
  phaseLabels: Record<string, string>;
  selectedPhase?: string | null;
  onSelectPhase?: (phase: string) => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const [width, setWidth] = useState(0);
  const [focused, setFocused] = useState(0);

  // Categorical slots in fixed order (validated for adjacent-pair separation
  // in light mode; dark pastels lean on the marker shapes as well).
  const seriesColors = [colors.primary, colors.sky, colors.warning];

  const series = useMemo(() => {
    const bySymptom = new Map<string, Map<string, number>>();
    predictions.forEach((p) => {
      const m = bySymptom.get(p.symptom) ?? new Map<string, number>();
      m.set(p.phase, Math.max(m.get(p.phase) ?? 0, p.likelihood));
      bySymptom.set(p.symptom, m);
    });
    return Array.from(bySymptom.entries())
      .map(([symptom, m]) => ({
        symptom,
        values: phases.map((phase) => Math.min(100, Math.max(0, m.get(phase) ?? 0))),
        peak: Math.max(...Array.from(m.values())),
      }))
      .sort((a, b) => b.peak - a.peak)
      .slice(0, MAX_SERIES);
  }, [predictions, phases]);

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
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
      <View style={{ width: 32, height: 32, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.primaryLight }}>
        <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={17} color={colors.primaryDark} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading }} numberOfLines={1}>
          Symptom trend
        </Text>
        <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }} numberOfLines={1}>
          Likelihood through your cycle
        </Text>
      </View>
    </View>
  );

  if (phases.length < 2 || series.length === 0) {
    return (
      <View style={cardStyle}>
        {header}
        <View
          style={{
            marginTop: 12,
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
          <MaterialCommunityIcons name="chart-line-variant" size={28} color={colors.mutedText} />
          <Text style={{ marginTop: 8, color: colors.foreground, fontSize: 14, fontWeight: "700", textAlign: "center", fontFamily: fonts.body }}>
            Your trend line is on its way
          </Text>
          <Text style={{ marginTop: 4, color: colors.mutedText, fontSize: 13, textAlign: "center", lineHeight: 18, fontFamily: fonts.body }}>
            Keep logging symptoms — once we can predict at least two phases, they&apos;ll be charted here.
          </Text>
        </View>
      </View>
    );
  }

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;
  const colW = phases.length > 0 ? plotW / phases.length : 0;
  // Each phase sits in the middle of its own column, so tap targets are
  // whole columns, not tiny points.
  const xAt = (i: number) => PAD.left + colW * (i + 0.5);
  const yAt = (v: number) => PAD.top + plotH - (v / 100) * plotH;
  const baseline = yAt(0);

  const activeIndex = selectedPhase ? phases.indexOf(selectedPhase) : -1;
  const focusIndex = Math.min(focused, series.length - 1);
  const focusSeries = series[focusIndex];
  const focusPoints = focusSeries.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const focusLine = monotonePath(focusPoints);
  const focusArea = focusLine
    ? `${focusLine} L${focusPoints[focusPoints.length - 1].x.toFixed(1)},${baseline} L${focusPoints[0].x.toFixed(1)},${baseline} Z`
    : "";
  const focusColor = seriesColors[focusIndex];

  const gridColor = isDark ? colors.surfaceStrong : colors.border;

  return (
    <View style={cardStyle}>
      {header}

      {/* Legend — tap to focus a series (gets the area fill + thicker line). */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {series.map((s, i) => {
          const active = i === focusIndex;
          return (
            <Pressable
              key={s.symptom}
              onPress={() => setFocused(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Focus ${s.symptom}`}
              hitSlop={6}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: active ? seriesColors[i] : colors.border,
                backgroundColor: active ? colors.surfaceSoft : colors.surface,
                maxWidth: "100%",
              }}
            >
              <LegendMarker shape={MARKERS[i]} color={seriesColors[i]} />
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{ flexShrink: 1, color: colors.foreground, fontSize: 13, fontWeight: active ? "800" : "600", fontFamily: fonts.body }}
              >
                {s.symptom}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View onLayout={onLayout} style={{ marginTop: 10, height: CHART_HEIGHT }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient id="symptomTrendArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={focusColor} stopOpacity={isDark ? 0.32 : 0.22} />
                  <Stop offset="1" stopColor={focusColor} stopOpacity={0} />
                </LinearGradient>
              </Defs>

              {/* Selected phase column */}
              {activeIndex >= 0 ? (
                <Rect
                  x={PAD.left + colW * activeIndex + 2}
                  y={PAD.top - 6}
                  width={Math.max(0, colW - 4)}
                  height={plotH + 6}
                  rx={10}
                  fill={colors.primaryLight}
                />
              ) : null}

              {/* Gridlines + y labels */}
              {GRID_STEPS.map((step) => (
                <React.Fragment key={step}>
                  <Line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={yAt(step)}
                    y2={yAt(step)}
                    stroke={step === 0 ? colors.mutedText : gridColor}
                    strokeWidth={step === 0 ? 1.2 : 1}
                    strokeDasharray={step === 0 ? undefined : "3 4"}
                    strokeOpacity={step === 0 ? 0.6 : 1}
                  />
                  <SvgText
                    x={PAD.left - 8}
                    y={yAt(step) + 4}
                    fontSize={11}
                    fontFamily={fonts.mono}
                    fill={colors.mutedText}
                    textAnchor="end"
                  >
                    {`${step}%`}
                  </SvgText>
                </React.Fragment>
              ))}

              {/* X labels (phases) */}
              {phases.map((phase, i) => (
                <SvgText
                  key={phase}
                  x={xAt(i)}
                  y={CHART_HEIGHT - 8}
                  fontSize={11.5}
                  fontWeight={i === activeIndex ? "800" : "600"}
                  fontFamily={fonts.body}
                  fill={i === activeIndex ? colors.foreground : colors.mutedText}
                  textAnchor="middle"
                >
                  {phaseLabels[phase] ?? phase}
                </SvgText>
              ))}

              {/* Focused series area */}
              {focusArea ? <Path d={focusArea} fill="url(#symptomTrendArea)" /> : null}

              {/* Lines: unfocused first so the focused one sits on top */}
              {series
                .map((s, i) => ({ s, i }))
                .sort((a, b) => (a.i === focusIndex ? 1 : 0) - (b.i === focusIndex ? 1 : 0))
                .map(({ s, i }) => {
                  const pts = s.values.map((v, idx) => ({ x: xAt(idx), y: yAt(v) }));
                  const isFocus = i === focusIndex;
                  return (
                    <React.Fragment key={s.symptom}>
                      <Path
                        d={monotonePath(pts)}
                        fill="none"
                        stroke={seriesColors[i]}
                        strokeWidth={isFocus ? 2.75 : 2}
                        strokeOpacity={isFocus ? 1 : 0.7}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {pts.map((p, idx) => (
                        <Marker
                          key={idx}
                          shape={MARKERS[i]}
                          x={p.x}
                          y={p.y}
                          size={idx === activeIndex ? 11 : 8}
                          fill={seriesColors[i]}
                          ring={colors.surface}
                        />
                      ))}
                    </React.Fragment>
                  );
                })}
            </Svg>

            {/* Tap targets: one per phase column */}
            <View style={{ position: "absolute", left: PAD.left, top: 0, width: plotW, height: CHART_HEIGHT, flexDirection: "row" }}>
              {phases.map((phase) => (
                <Pressable
                  key={phase}
                  style={{ flex: 1 }}
                  onPress={() => onSelectPhase?.(phase)}
                  accessibilityRole="button"
                  accessibilityLabel={`${phaseLabels[phase] ?? phase}: ${series
                    .map((s) => `${s.symptom} ${Math.round(s.values[phases.indexOf(phase)])}%`)
                    .join(", ")}`}
                />
              ))}
            </View>
          </>
        ) : null}
      </View>

      {/* Values at the selected phase (the "tooltip", pinned below the plot) */}
      {activeIndex >= 0 ? (
        <View
          style={{
            marginTop: 8,
            padding: 12,
            borderRadius: 14,
            backgroundColor: colors.surfaceSoft,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}
        >
          <Text style={{ color: colors.mutedText, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, fontFamily: fonts.body }}>
            {(phaseLabels[phases[activeIndex]] ?? phases[activeIndex]).toUpperCase()} PHASE
          </Text>
          {series.map((s, i) => (
            <View key={s.symptom} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <LegendMarker shape={MARKERS[i]} color={seriesColors[i]} />
              <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: 13.5, fontWeight: "600", fontFamily: fonts.body }}>
                {s.symptom}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800", fontFamily: fonts.mono }}>
                {Math.round(s.values[activeIndex])}%
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={{ marginTop: 6, color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
          Tap a phase to see exact values.
        </Text>
      )}
    </View>
  );
}
