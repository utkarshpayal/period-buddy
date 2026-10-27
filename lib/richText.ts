/**
 * Rich content from the admin editor (period-buddy-content, src/lib/richText.ts),
 * used by blogs, Q&A answers, wellbeing guides and health issues. Keep in step
 * with the editor and the website (The-Nura-website, src/lib/richText.js).
 *
 * Content is Markdown plus a small allowlist:
 *   <span data-color="rose">…</span>  colored text (named palette only)
 *   <mark data-color="yellow">…</mark> highlight
 *   <u>…</u>                          underline
 *   ```chart + JSON                   a chart (see parseChartSpec)
 * Any other raw HTML is dropped. Colors are names so each theme picks shades
 * that read on its background.
 */

export const TEXT_COLORS = ["rose", "violet", "blue", "teal", "green", "amber", "red", "gray"] as const;
export const HIGHLIGHT_COLORS = ["yellow", "pink", "green", "blue", "violet"] as const;
export type TextColor = (typeof TEXT_COLORS)[number];
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export type RichPalette = {
  text: Record<TextColor, string>;
  highlight: Record<HighlightColor, string>;
};

const LIGHT: RichPalette = {
  text: {
    rose: "#C2416F",
    violet: "#6A5BC9",
    blue: "#2F5FB3",
    teal: "#0F7A64",
    green: "#3B7A1E",
    amber: "#956410",
    red: "#B42318",
    gray: "#5E5566",
  },
  highlight: { yellow: "#FFF1B8", pink: "#FCE1EC", green: "#DDF3E4", blue: "#DDE9FB", violet: "#ECE8FB" },
};

// Lighter text and deeper highlights, so both clear contrast on the dark surfaces.
const DARK: RichPalette = {
  text: {
    rose: "#F28CB1",
    violet: "#B3A8F5",
    blue: "#8FB4F5",
    teal: "#6FD3B8",
    green: "#9BD67A",
    amber: "#F2C46B",
    red: "#F59A8F",
    gray: "#B8AFC0",
  },
  highlight: { yellow: "#5A4A12", pink: "#5A2338", green: "#1E4A33", blue: "#1F3A5F", violet: "#3A3366" },
};

export const richPalette = (isDark: boolean): RichPalette => (isDark ? DARK : LIGHT);

/** Series colors, in order. */
export const CHART_COLORS: TextColor[] = ["rose", "violet", "teal", "amber", "blue", "green", "red", "gray"];

export type ChartSpec = {
  type: "bar" | "line" | "pie";
  title: string;
  caption: string;
  unit: string;
  labels: string[];
  series: { name: string; values: number[] }[];
};

/** A ```chart block's JSON as a ChartSpec, or null when it can't be drawn. */
export function parseChartSpec(source: string): ChartSpec | null {
  try {
    const raw = JSON.parse(source);
    if (!raw || !["bar", "line", "pie"].includes(String(raw.type))) return null;
    const labels: string[] = Array.isArray(raw.labels) ? raw.labels.map((l: unknown) => String(l ?? "")) : [];
    const series = (Array.isArray(raw.series) ? raw.series : [])
      .filter((s: { values?: unknown }) => s && Array.isArray(s.values))
      .map((s: { name?: unknown; values: unknown[] }) => ({
        name: String(s.name ?? ""),
        values: labels.map((_, i) => {
          const n = Number(s.values[i]);
          return Number.isFinite(n) ? n : 0;
        }),
      }));
    if (!labels.length || !series.length) return null;
    return {
      type: raw.type,
      title: raw.title ? String(raw.title) : "",
      caption: raw.caption ? String(raw.caption) : "",
      unit: raw.unit ? String(raw.unit) : "",
      labels,
      series: raw.type === "pie" ? series.slice(0, 1) : series,
    };
  } catch {
    return null;
  }
}

const CHART_FENCE = /```chart[^\n]*\n[\s\S]*?```/g;

/** True when text has Markdown or allowlisted HTML worth rendering; plain text can stay a <Text>. */
export const hasRichMarkup = (text: string) => /[*_~`#|[<]|^\s*([-+>]|\d+[.)])\s/m.test(String(text ?? ""));

/** Readable plain text: for accessibility labels, previews and speech. */
export function richTextToPlain(content: string): string {
  return String(content ?? "")
    .replace(CHART_FENCE, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/* ---- markdown-it plugin ---------------------------------------------------
 * Turns the allowlisted inline HTML into tokens the renderer knows:
 * rich_color / rich_u carry a CSS `style` attr (react-native-markdown-display
 * passes it down to the leaf text, beating the body color), rich_mark carries
 * the background in `data-bg` (backgroundColor isn't inherited that way, so
 * the rule draws it). Every other HTML tag is removed; its text stays. */

type MdToken = {
  type: string;
  tag: string;
  nesting: number;
  content: string;
  attrs: [string, string][] | null;
  children: MdToken[] | null;
  block: boolean;
};
type MdState = { tokens: MdToken[]; Token: new (type: string, tag: string, nesting: number) => MdToken };
type Md = { core: { ruler: { push: (name: string, fn: (state: MdState) => void) => void } } };

const OPEN_TAG = /^<(span|mark|u)(?:\s+data-color="([a-z]+)")?\s*>$/i;
const CLOSE_TAG = /^<\/(span|mark|u)\s*>$/i;

function convertInline(children: MdToken[], palette: RichPalette, Token: MdState["Token"]): MdToken[] {
  const out: MdToken[] = [];
  // One entry per open tag: the token type it opened, or null when it was dropped.
  const stack: { tag: string; type: string | null }[] = [];

  const open = (type: string, tag: string, attrs: [string, string][]) => {
    const t = new Token(`${type}_open`, tag, 1);
    t.attrs = attrs;
    out.push(t);
    return type;
  };

  for (const token of children) {
    if (token.type !== "html_inline") {
      out.push(token);
      continue;
    }
    const opened = OPEN_TAG.exec(token.content.trim());
    if (opened) {
      const tag = opened[1].toLowerCase();
      const name = opened[2]?.toLowerCase();
      let type: string | null = null;
      if (tag === "span" && name && name in palette.text) {
        type = open("rich_color", tag, [["style", `color: ${palette.text[name as TextColor]}`]]);
      } else if (tag === "mark") {
        const bg = palette.highlight[(name && name in palette.highlight ? name : "yellow") as HighlightColor];
        type = open("rich_mark", tag, [["data-bg", bg]]);
      } else if (tag === "u") {
        type = open("rich_u", tag, [["style", "text-decoration-line: underline"]]);
      }
      stack.push({ tag, type });
      continue;
    }
    const closed = CLOSE_TAG.exec(token.content.trim());
    if (closed) {
      const tag = closed[1].toLowerCase();
      const index = stack.map((s) => s.tag).lastIndexOf(tag);
      if (index === -1) continue;
      // Close anything left open inside it too, so the tree stays balanced.
      for (const entry of stack.splice(index).reverse()) {
        if (entry.type) out.push(new Token(`${entry.type}_close`, entry.tag, -1));
      }
    }
    // Any other tag: dropped.
  }
  for (const entry of stack.reverse()) {
    if (entry.type) out.push(new Token(`${entry.type}_close`, entry.tag, -1));
  }
  return out;
}

/** Adds the rich-text allowlist to a markdown-it instance created with `html: true`. */
export function richTextPlugin(md: Md, palette: RichPalette) {
  md.core.ruler.push("nura_rich_text", (state) => {
    state.tokens = state.tokens.filter((token) => token.type !== "html_block");
    for (const token of state.tokens) {
      if (token.type === "inline" && token.children) {
        token.children = convertInline(token.children, palette, state.Token);
      }
    }
  });
}
