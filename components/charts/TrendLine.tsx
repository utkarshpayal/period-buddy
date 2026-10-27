import React, { useMemo, useRef, useState } from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { niceRange, shortDay, type Point } from "../../lib/chartData";
import { useTheme } from "../theme";
import { withAlpha } from "../ui-tokens";
import { ChartCallout } from "./ChartCallout";

/**
 * A single-series trend (weight, temperature): a smooth line over a soft
 * fill, three quiet gridlines on round numbers that hug the data, the first
 * and last dates under it, the latest point marked. Tap or slide anywhere:
 * it snaps to the nearest day, draws a crosshair and opens the callout at
 * the top with the exact value.
 */

const Y_W = 40;
const TOP = 16;
const X_H = 22;

function smooth(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return "";
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / Math.max(1e-6, pts[i + 1].x - pts[i].x));
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

export function TrendLine({
  points,
  color,
  unit,
  decimals = 1,
  minSpan = 1,
  height = 150,
  title,
}: {
  points: Point[];
  color: string;
  unit: string;
  decimals?: number;
  minSpan?: number;
  height?: number;
  /** Names the series in the callout ("Weight"). */
  title: string;
  /** Kept for callers; the chart measures its own width. */
  width?: number;
}) {
  const { colors, isDark, fonts } = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const range = useMemo(() => niceRange(points.map((p) => p.value), { sections: 2, minSpan }), [points, minSpan]);
  const plotW = Math.max(0, w - Y_W - 8);
  const xAt = (i: number) => Y_W + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);
  const yAt = (v: number) => TOP + height - ((v - range.min) / (range.max - range.min)) * height;
  const pts = points.map((p, i) => ({ x: xAt(i), y: yAt(p.value) }));
  const line = smooth(pts);
  const H = TOP + height + X_H;

  // Nearest point to a touch x.
  const pick = (x: number, toggle = false) => {
    if (!points.length || plotW <= 0) return;
    const t = (x - Y_W) / plotW;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(t * (points.length - 1))));
    // Tapping the open point again closes it.
    setSel((cur) => (toggle && cur === i ? null : i));
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        // Sideways slides scrub; up/down stays with the page scroll.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderTerminationRequest: () => true,
        onPanResponderGrant: (e) => pickRef.current(e.nativeEvent.locationX, true),
        onPanResponderMove: (e) => pickRef.current(e.nativeEvent.locationX),
      }),
    [],
  );

  const ticks = Array.from({ length: range.sections + 1 }, (_, k) => range.min + k * range.step);
  const fmt = (v: number) => (Number.isInteger(range.step) ? String(Math.round(v)) : v.toFixed(1));
  const last = points.length - 1;

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: H }} {...pan.panHandlers}>
      {w > 0 && points.length ? (
        <Svg width={w} height={H}>
          <Defs>
            <LinearGradient id={`tl-${title}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={isDark ? 0.3 : 0.18} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((v) => (
            <React.Fragment key={v}>
              <Line x1={Y_W} x2={w} y1={yAt(v)} y2={yAt(v)} stroke={withAlpha(colors.text, v === range.min ? 0.14 : 0.07)} strokeWidth={1} />
              <SvgText x={0} y={yAt(v) + 4} fontSize={11} fill={colors.mutedText} fontFamily={fonts.body}>
                {fmt(v)}
              </SvgText>
            </React.Fragment>
          ))}
          {pts.length > 1 ? <Path d={`${line} L${pts[last].x},${yAt(range.min)} L${pts[0].x},${yAt(range.min)} Z`} fill={`url(#tl-${title})`} /> : null}
          {pts.length > 1 ? <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" /> : null}
          {sel != null ? <Line x1={pts[sel].x} x2={pts[sel].x} y1={TOP} y2={TOP + height} stroke={withAlpha(colors.text, 0.35)} strokeWidth={1} /> : null}
          {/* Latest point, and the selected one */}
          <Circle cx={pts[last].x} cy={pts[last].y} r={5} fill={color} stroke={colors.surface} strokeWidth={2} />
          {sel != null ? <Circle cx={pts[sel].x} cy={pts[sel].y} r={7} fill={color} stroke={colors.surface} strokeWidth={2.5} /> : null}
          <SvgText x={Y_W} y={H - 4} fontSize={11} fill={colors.mutedText} fontFamily={fonts.body}>
            {shortDay(points[0].key)}
          </SvgText>
          <SvgText x={w} y={H - 4} fontSize={11} fill={colors.mutedText} textAnchor="end" fontFamily={fonts.body}>
            {shortDay(points[last].key)}
          </SvgText>
        </Svg>
      ) : null}
      {sel != null && w > 0 ? (
        <ChartCallout x={pts[sel].x} chartWidth={w} title={`${title} · ${shortDay(points[sel].key)}`} value={`${points[sel].value.toFixed(decimals)} ${unit}`} />
      ) : null}
    </View>
  );
}
