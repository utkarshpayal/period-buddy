// Small HTML/SVG chart builders for the printable health report (lib/healthReport.ts).
// Charts render inside a static PDF, so every value is direct-labeled — there is no
// tooltip to fall back on.

import { REPORT_THEME } from "./reportTheme";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * A single-series trend line (sleep, water, stress across the date range).
 * Endpoints are direct-labeled since there is no hover layer in print; every
 * other value stays reachable via the accompanying average stat tile.
 */
export function sparklineSvg(
  points: { dateKey: string; value: number }[],
  opts: { color: string; unit?: string; width?: number; height?: number },
): string {
  if (points.length < 2) return "";
  const width = opts.width ?? 560;
  const height = opts.height ?? 120;
  const paddingX = 8;
  const paddingY = 16;
  const values = points.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const coords = points.map((point, index) => {
    const x = paddingX + (index / (points.length - 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((point.value - minVal) / range) * (height - paddingY * 2);
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(" ");
  const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(1)},${height - paddingY} L${coords[0].x.toFixed(1)},${height - paddingY} Z`;

  const first = points[0];
  const last = points[points.length - 1];
  const firstCoord = coords[0];
  const lastCoord = coords[coords.length - 1];
  const unit = opts.unit ? ` ${opts.unit}` : "";

  return `
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="#e1e0d9" stroke-width="1" />
      <path d="${areaPath}" fill="${opts.color}" opacity="0.1" stroke="none" />
      <path d="${linePath}" fill="none" stroke="${opts.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${firstCoord.x}" cy="${firstCoord.y}" r="4" fill="${opts.color}" stroke="#ffffff" stroke-width="2" />
      <circle cx="${lastCoord.x}" cy="${lastCoord.y}" r="4" fill="${opts.color}" stroke="#ffffff" stroke-width="2" />
      <text x="${firstCoord.x}" y="${Math.max(firstCoord.y - 10, 10)}" font-size="11" fill="${REPORT_THEME.labelText}" text-anchor="start">${formatNumber(first.value)}${unit}</text>
      <text x="${lastCoord.x}" y="${Math.max(lastCoord.y - 10, 10)}" font-size="11" fill="${REPORT_THEME.labelText}" text-anchor="end">${formatNumber(last.value)}${unit}</text>
    </svg>`;
}
