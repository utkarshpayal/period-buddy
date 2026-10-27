import React, { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from "react-native-svg";
import type { SymptomPrediction } from "../lib/api";
import { useTheme } from "./theme";
import { withAlpha } from "./ui-tokens";

/**
 * "When your symptoms show up": one symptom at a time, as a friendly curve.
 *
 * - Pick a symptom from chips that all fit on screen (the strongest is first).
 * - A plain sentence says the answer ("Cramps shows up most during your
 *   period: 5 of your last 6 cycles"), so nobody has to read the chart.
 * - One smooth curve over the four phases, each phase a soft coloured band
 *   with its name and days; counts on the dots ("5/6"), not percentages; the
 *   y axis in words (Always / Half / Never).
 * - The top 5 symptoms as chips, the rest behind "+N more".
 * - Today's phase is marked "Now". Tap a phase for a callout at the top with
 *   the detail.
 */

export type TrendPhase = { key: string; label: string; title: string; days?: string; tint: string };

const PLOT_H = 160;
const TOP = 26;
const Y_LABEL_W = 50;
const CHIPS = 5;
const X_LABEL_H = 46;

type Series = { symptom: string; values: number[]; counts: ({ occ: number; of: number } | null)[]; peak: number; peakIndex: number };

function smooth(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return "";
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  let p = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    p += ` C${pts[i].x + h},${pts[i].y + m[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - m[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`;
  }
  return p;
}

export function SymptomTrendChart({
  predictions,
  phases,
  currentPhase,
}: {
  predictions: SymptomPrediction[];
  phases: TrendPhase[];
  currentPhase: string | null;
}) {
  const { colors, isDark, fonts } = useTheme();
  const hue = isDark ? "#E86A98" : "#C93B70";
  const [width, setWidth] = useState(0);
  const [tapped, setTapped] = useState<number | null>(null);

  const all: Series[] = useMemo(() => {
    const by = new Map<string, Series>();
    predictions.forEach((p) => {
      const i = phases.findIndex((ph) => ph.key === p.phase);
      if (i < 0) return;
      const s = by.get(p.symptom) ?? { symptom: p.symptom, values: phases.map(() => 0), counts: phases.map(() => null), peak: 0, peakIndex: 0 };
      const v = Math.min(100, Math.max(0, Math.round(p.likelihood)));
      if (v >= s.values[i]) {
        s.values[i] = v;
        s.counts[i] = { occ: p.occurrences, of: p.cyclesAnalyzed };
      }
      if (v > s.peak) {
        s.peak = v;
        s.peakIndex = i;
      }
      by.set(p.symptom, s);
    });
    return [...by.values()].filter((s) => s.peak > 0).sort((a, b) => b.peak - a.peak);
  }, [predictions, phases]);

  const [chosen, setChosen] = useState<string | null>(null);
  const [moreChips, setMoreChips] = useState(false);
  useEffect(() => {
    if (!chosen || !all.some((s) => s.symptom === chosen)) setChosen(all[0]?.symptom ?? null);
  }, [all, chosen]);
  const s = all.find((x) => x.symptom === chosen) ?? all[0];
  if (!s) return null;

  const plotW = Math.max(0, width - Y_LABEL_W);
  const colW = plotW / phases.length;
  const xAt = (i: number) => Y_LABEL_W + colW * (i + 0.5);
  const yAt = (v: number) => TOP + PLOT_H - (v / 100) * PLOT_H;
  const nowIndex = phases.findIndex((p) => p.key === currentPhase);
  const H = TOP + PLOT_H + X_LABEL_H;
  const pts = s.values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const line = smooth(pts);
  const peakCount = s.counts[s.peakIndex];
  const tipW = 200;
  const tipLeft = tapped == null ? 0 : Math.min(Math.max(xAt(tapped) - tipW / 2, 0), Math.max(0, width - tipW));
  const count = (i: number) => {
    const c = s.counts[i];
    return c ? `${c.occ}/${c.of}` : `${s.values[i]}%`;
  };

  return (
    <View>
      {/* The answer, in words */}
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text, fontFamily: fonts.body, marginBottom: 14 }}>
        <Text style={{ fontWeight: "800" }}>{s.symptom}</Text>
        {` shows up most ${phases[s.peakIndex].title}`}
        {peakCount ? (
          <Text style={{ fontWeight: "800" }}>{`: ${peakCount.occ} of your last ${peakCount.of} cycles`}</Text>
        ) : null}
        .
      </Text>

      {/* Pick a symptom: every option visible */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {(moreChips ? all : all.slice(0, CHIPS).concat(all.slice(CHIPS).filter((x) => x.symptom === s.symptom))).map((x) => {
          const on = x.symptom === s.symptom;
          return (
            <Pressable
              key={x.symptom}
              onPress={() => {
                setChosen(x.symptom);
                setTapped(null);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              hitSlop={{ top: 6, bottom: 6 }}
              style={{
                paddingHorizontal: 14,
                height: 36,
                justifyContent: "center",
                borderRadius: 18,
                backgroundColor: on ? hue : colors.surfaceSoft,
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: on ? "#FFFFFF" : colors.text, fontFamily: fonts.body }}>{x.symptom}</Text>
            </Pressable>
          );
        })}
        {all.length > CHIPS ? (
          <Pressable
            onPress={() => setMoreChips((v) => !v)}
            accessibilityRole="button"
            hitSlop={{ top: 6, bottom: 6 }}
            style={{ paddingHorizontal: 14, height: 36, justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: colors.border }}
          >
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: colors.mutedText, fontFamily: fonts.body }}>{moreChips ? "Less" : `+${all.length - CHIPS} more`}</Text>
          </Pressable>
        ) : null}
      </View>

      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height: H }}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={hue} stopOpacity={isDark ? 0.35 : 0.22} />
                <Stop offset="1" stopColor={hue} stopOpacity={0} />
              </LinearGradient>
            </Defs>

            {/* Phase bands */}
            {phases.map((ph, i) => (
              <Rect
                key={ph.key}
                x={Y_LABEL_W + colW * i + 2}
                y={TOP - 8}
                width={colW - 4}
                height={PLOT_H + 8}
                rx={12}
                fill={withAlpha(ph.tint, isDark ? 0.12 : 0.09)}
                stroke={i === nowIndex ? withAlpha(hue, 0.6) : "none"}
                strokeWidth={i === nowIndex ? 1.5 : 0}
              />
            ))}

            {/* Y axis in words */}
            {[
              { v: 100, t: "Always" },
              { v: 50, t: "Half" },
              { v: 0, t: "Never" },
            ].map(({ v, t }) => (
              <React.Fragment key={v}>
                <Line x1={Y_LABEL_W} x2={width} y1={yAt(v)} y2={yAt(v)} stroke={withAlpha(colors.text, v === 0 ? 0.16 : 0.07)} strokeWidth={1} />
                <SvgText x={0} y={yAt(v) + 4} fontSize={11} fill={colors.mutedText} fontFamily={fonts.body}>
                  {t}
                </SvgText>
              </React.Fragment>
            ))}

            {/* The curve */}
            <Path d={`${line} L${pts[pts.length - 1].x},${yAt(0)} L${pts[0].x},${yAt(0)} Z`} fill="url(#trendFill)" />
            <Path d={line} stroke={hue} strokeWidth={3} fill="none" strokeLinecap="round" />

            {/* Dots with their count */}
            {pts.map((p, i) => {
              const big = i === s.peakIndex || i === tapped;
              return (
                <React.Fragment key={i}>
                  <Circle cx={p.x} cy={p.y} r={big ? 7 : 5} fill={big ? hue : colors.surface} stroke={hue} strokeWidth={2.5} />
                  <SvgText x={p.x} y={p.y - 13} fontSize={12} fontWeight="800" fill={colors.text} textAnchor="middle" fontFamily={fonts.body}>
                    {count(i)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            {/* Phase names and days */}
            {phases.map((ph, i) => (
              <React.Fragment key={ph.key}>
                <SvgText x={xAt(i)} y={TOP + PLOT_H + 20} fontSize={12.5} fontWeight={i === nowIndex ? "800" : "700"} fill={colors.text} textAnchor="middle" fontFamily={fonts.body}>
                  {ph.label}
                </SvgText>
                <SvgText x={xAt(i)} y={TOP + PLOT_H + 36} fontSize={11} fontWeight={i === nowIndex ? "800" : "500"} fill={i === nowIndex ? colors.primaryDark : colors.mutedText} textAnchor="middle" fontFamily={fonts.body}>
                  {i === nowIndex ? "Now" : ph.days ? `Days ${ph.days}` : ""}
                </SvgText>
              </React.Fragment>
            ))}
          </Svg>
        ) : null}

        {/* Tap targets: one per phase */}
        {width > 0 ? (
          <View style={{ position: "absolute", left: Y_LABEL_W, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
            {phases.map((ph, i) => {
              const c = s.counts[i];
              return (
                <Pressable
                  key={ph.key}
                  onPress={() => setTapped(tapped === i ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.symptom} ${ph.title}: ${c ? `${c.occ} of ${c.of} cycles` : `${s.values[i]} percent`}`}
                  style={{ flex: 1 }}
                />
              );
            })}
          </View>
        ) : null}

        {/* Callout at the top */}
        {tapped != null ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: -10,
              left: tipLeft,
              width: tipW,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: isDark ? colors.surfaceStrong : "#241A20",
              borderWidth: isDark ? 1 : 0,
              borderColor: colors.border,
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? colors.mutedText : "rgba(255,255,255,0.7)", fontFamily: fonts.body }}>
              {`${s.symptom} · ${phases[tapped].title}`}
            </Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: isDark ? colors.text : "#FFFFFF", marginTop: 2, fontFamily: fonts.body }}>
              {s.counts[tapped] ? `${s.counts[tapped]!.occ} of ${s.counts[tapped]!.of} cycles` : `${s.values[tapped]}%`}
            </Text>
            <Text style={{ fontSize: 12, color: isDark ? colors.mutedText : "rgba(255,255,255,0.7)", fontFamily: fonts.body }}>
              {`That's ${s.values[tapped]}% of the time`}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
