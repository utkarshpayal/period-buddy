import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Line, Path, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { CHART_COLORS, richPalette, type ChartSpec } from "../../lib/richText";
import { useTheme } from "../theme";

// Narrow viewBox so axis labels stay readable at phone width.
const W = 340;
const H = 210;
const PAD = { top: 12, right: 8, bottom: 30, left: 36 };

/** 1, 2, 5 × 10^n steps so the axis reads in round numbers. */
function niceMax(max: number) {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  const n = max / step;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * step;
}

const fmt = (n: number, unit = "") => `${Number.isInteger(n) ? n : n.toFixed(1)}${unit}`;

/** A ```chart block from rich content: bar, line or pie, drawn like the website's. */
export function RichChart({ spec }: { spec: ChartSpec }) {
  const { colors, fonts, isDark } = useTheme();
  const palette = richPalette(isDark).text;
  const colorAt = (i: number) => palette[CHART_COLORS[i % CHART_COLORS.length]];
  const { labels, series, unit } = spec;
  const summary = `${spec.title || "Chart"}: ${labels
    .map((l, i) => `${l} ${series.map((s) => fmt(s.values[i] ?? 0, unit)).join(" / ")}`)
    .join(", ")}`;
  const legend = spec.type === "pie" ? labels : series.length > 1 ? series.map((s) => s.name) : [];

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary}
      style={{ marginVertical: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}
    >
      {spec.title ? (
        <Text style={{ color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, fontWeight: "700", marginBottom: 8 }}>{spec.title}</Text>
      ) : null}
      <Svg width="100%" style={{ aspectRatio: W / H }} viewBox={`0 0 ${W} ${H}`}>
        {spec.type === "pie" ? (
          <Pie spec={spec} colorAt={colorAt} gap={colors.surface} />
        ) : (
          <Axes spec={spec} colorAt={colorAt} grid={colors.border} axis={colors.mutedText} />
        )}
      </Svg>
      {legend.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ gap: 12, rowGap: 6, marginTop: 8 }}>
          {legend.map((name, i) => (
            <View key={i} className="flex-row items-center" style={{ gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colorAt(i) }} />
              <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontSize: 13.5, fontWeight: "600" }}>{name}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {spec.caption ? (
        <Text style={{ color: colors.mutedText, fontFamily: fonts.body, fontSize: 13, marginTop: 8 }}>{spec.caption}</Text>
      ) : null}
    </View>
  );
}

function Axes({ spec, colorAt, grid, axis }: { spec: ChartSpec; colorAt: (i: number) => string; grid: string; axis: string }) {
  const { labels, series, unit } = spec;
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / Math.max(1, labels.length);
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / max) * plotH;
  const barW = Math.min(28, (slot * 0.7) / series.length);
  // Thin out x labels when they'd collide.
  const every = Math.ceil(labels.length / Math.max(1, Math.floor(plotW / 44)));

  return (
    <>
      {[0, 0.5, 1].map((t) => (
        <G key={t}>
          <Line x1={PAD.left} x2={W - PAD.right} y1={y(t * max)} y2={y(t * max)} stroke={grid} strokeWidth={1} />
          <SvgText x={PAD.left - 6} y={y(t * max) + 4} fontSize={11} fill={axis} textAnchor="end">
            {fmt(t * max, unit)}
          </SvgText>
        </G>
      ))}
      {labels.map((l, i) =>
        i % every === 0 ? (
          <SvgText key={i} x={PAD.left + slot * (i + 0.5)} y={H - PAD.bottom + 18} fontSize={11} fill={axis} textAnchor="middle">
            {l.length > 10 ? `${l.slice(0, 9)}…` : l}
          </SvgText>
        ) : null,
      )}
      {spec.type === "bar"
        ? series.map((s, si) =>
            s.values.map((v, i) => (
              <Rect
                key={`${si}-${i}`}
                x={PAD.left + slot * (i + 0.5) - (barW * series.length) / 2 + si * barW + 1}
                y={y(v)}
                width={Math.max(1, barW - 2)}
                height={PAD.top + plotH - y(v)}
                rx={3}
                fill={colorAt(si)}
              />
            )),
          )
        : series.map((s, si) => (
            <G key={si}>
              <Polyline
                points={s.values.map((v, i) => `${PAD.left + slot * (i + 0.5)},${y(v)}`).join(" ")}
                fill="none"
                stroke={colorAt(si)}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
              {s.values.map((v, i) => (
                <Circle key={i} cx={PAD.left + slot * (i + 0.5)} cy={y(v)} r={3.5} fill={colorAt(si)} />
              ))}
            </G>
          ))}
    </>
  );
}

function Pie({ spec, colorAt, gap }: { spec: ChartSpec; colorAt: (i: number) => string; gap: string }) {
  const values = spec.series[0]?.values ?? [];
  const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
  const cx = W / 2;
  const cy = H / 2;
  const r = H / 2 - 8;
  const inner = r * 0.56;
  const pt = (rad: number, a: number) => `${cx + rad * Math.cos(a)} ${cy + rad * Math.sin(a)}`;
  let angle = -Math.PI / 2;

  return (
    <>
      {values.map((v, i) => {
        const share = Math.max(0, v) / total;
        if (!share) return null;
        const start = angle;
        angle += share * Math.PI * 2;
        const end = angle;
        const large = end - start > Math.PI ? 1 : 0;
        const d =
          share >= 0.9999
            ? `M ${pt(r, 0)} A ${r} ${r} 0 1 1 ${pt(r, Math.PI)} A ${r} ${r} 0 1 1 ${pt(r, 0)} M ${pt(inner, 0)} A ${inner} ${inner} 0 1 0 ${pt(inner, Math.PI)} A ${inner} ${inner} 0 1 0 ${pt(inner, 0)} Z`
            : `M ${pt(r, start)} A ${r} ${r} 0 ${large} 1 ${pt(r, end)} L ${pt(inner, end)} A ${inner} ${inner} 0 ${large} 0 ${pt(inner, start)} Z`;
        return <Path key={i} d={d} fill={colorAt(i)} fillRule="evenodd" stroke={gap} strokeWidth={2} />;
      })}
    </>
  );
}
