import React, { useMemo, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import Svg, { Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { niceRange } from "../../lib/chartData";
import { useTheme } from "../theme";
import { withAlpha } from "../ui-tokens";
import { ChartCallout } from "./ChartCallout";

export type Bar = { label: string; value: number; /** The callout's title ("September", "Mon 12 Oct"). */ detail: string; /** Extra callout line. */ note?: string };

/**
 * Single-series columns: bars no wider than 24 with rounded tops, square at
 * the baseline, quiet gridlines from zero, an optional labelled average line
 * and an optional shaded "typical" band. With few bars every value sits on
 * its bar. Tap a bar: it stays full colour while the rest soften, and the
 * callout opens at the top with the exact value.
 */

const Y_W = 40;
const TOP = 18;
const X_H = 22;

export function BarSeries({
  bars,
  color,
  unit,
  average,
  band,
  formatValue = (v) => String(Math.round(v)),
  height = 140,
  labelEvery = 1,
}: {
  bars: Bar[];
  color: string;
  unit: string;
  average?: number;
  /** A shaded range, e.g. the typical 21–35-day cycle. */
  band?: { min: number; max: number; label: string };
  formatValue?: (v: number) => string;
  height?: number;
  labelEvery?: number;
  /** Kept for callers; the chart measures its own width. */
  width?: number;
}) {
  const { colors, fonts } = useTheme();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const range = useMemo(
    () => niceRange([...bars.map((b) => b.value), average ?? 0, band?.max ?? 0], { sections: 2, fromZero: true }),
    [bars, average, band],
  );
  const plotW = Math.max(0, w - Y_W);
  const slot = plotW / Math.max(1, bars.length);
  const barW = Math.max(4, Math.min(24, slot * 0.6));
  const yAt = (v: number) => TOP + height - (v / range.max) * height;
  const H = TOP + height + X_H;
  const valuesOnBars = bars.length <= 8;
  const ticks = Array.from({ length: range.sections + 1 }, (_, k) => k * range.step);
  const tick = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)));

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
      {w > 0 ? (
        <Svg width={w} height={H}>
          {band ? (
            <>
              <Rect x={Y_W} y={yAt(band.max)} width={plotW} height={yAt(band.min) - yAt(band.max)} fill={withAlpha(colors.success, 0.1)} />
              <SvgText x={w - 2} y={yAt(band.max) - 4} fontSize={10.5} fontWeight="700" fill={colors.success} textAnchor="end" fontFamily={fonts.body}>
                {band.label}
              </SvgText>
            </>
          ) : null}
          {ticks.map((v) => (
            <React.Fragment key={v}>
              <Line x1={Y_W} x2={w} y1={yAt(v)} y2={yAt(v)} stroke={withAlpha(colors.text, v === 0 ? 0.14 : 0.07)} strokeWidth={1} />
              <SvgText x={0} y={yAt(v) + 4} fontSize={11} fill={colors.mutedText} fontFamily={fonts.body}>
                {tick(v)}
              </SvgText>
            </React.Fragment>
          ))}
          {bars.map((b, i) => {
            const x = Y_W + slot * i + (slot - barW) / 2;
            const y = yAt(b.value);
            const h = Math.max(2, yAt(0) - y);
            const r = Math.min(4, barW / 2, h);
            const dim = sel != null && sel !== i;
            return (
              <React.Fragment key={i}>
                {/* One shape: rounded top, square at the baseline */}
                <Path
                  d={`M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + barW - r},${y} Q${x + barW},${y} ${x + barW},${y + r} L${x + barW},${y + h} Z`}
                  fill={color}
                  opacity={dim ? 0.35 : 1}
                />
                {valuesOnBars ? (
                  <SvgText x={x + barW / 2} y={y - 5} fontSize={11.5} fontWeight="800" fill={colors.text} textAnchor="middle" fontFamily={fonts.body}>
                    {formatValue(b.value)}
                  </SvgText>
                ) : null}
                {b.label && (i % labelEvery === 0 || i === bars.length - 1) ? (
                  <SvgText x={x + barW / 2} y={H - 4} fontSize={11} fill={sel === i ? colors.text : colors.mutedText} fontWeight={sel === i ? "800" : "500"} textAnchor="middle" fontFamily={fonts.body}>
                    {b.label}
                  </SvgText>
                ) : null}
              </React.Fragment>
            );
          })}
          {average != null ? (
            <>
              <Line x1={Y_W} x2={w} y1={yAt(average)} y2={yAt(average)} stroke={colors.mutedText} strokeWidth={1} />
              <SvgText x={Y_W + 2} y={yAt(average) - 4} fontSize={10.5} fontWeight="700" fill={colors.mutedText} fontFamily={fonts.body}>
                {`avg ${formatValue(average)}`}
              </SvgText>
            </>
          ) : null}
        </Svg>
      ) : null}
      {/* One tap target per bar, full height */}
      {w > 0 ? (
        <View style={{ position: "absolute", left: Y_W, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
          {bars.map((b, i) => (
            <Pressable
              key={i}
              onPress={() => setSel(sel === i ? null : i)}
              accessibilityRole="button"
              accessibilityLabel={`${b.detail}: ${formatValue(b.value)} ${unit}${b.note ? `, ${b.note}` : ""}`}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      ) : null}
      {sel != null && w > 0 ? (
        <ChartCallout
          x={Y_W + slot * sel + slot / 2}
          chartWidth={w}
          title={bars[sel].detail}
          value={`${formatValue(bars[sel].value)} ${unit}`}
          detail={bars[sel].note}
        />
      ) : null}
    </View>
  );
}
