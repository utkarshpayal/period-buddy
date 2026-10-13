/**
 * Each person's own Home (Profile → Customize Home). Pure logic, unit-tested
 * in lib/__tests__/homeLayout.test.ts; components/home-layout.tsx loads and
 * saves it (per account, via `authApi.getHomeLayout` / `saveHomeLayout`).
 *
 * It sits on top of the App CMS: the CMS decides which blocks and tiles
 * exist for this viewer (`shownSections` / `hubTilesFor`), and the person
 * only hides, reorders, renames, restyles and picks among those. Promo
 * banner slots are the CMS's alone and keep their place.
 */
import type { AppConfig, HomeSection, HomeSectionKey, HubPlacement, HubTile, TileColorKey, Viewer } from "./appConfig";
import { TILE_COLOR_KEYS, hubTilesFor } from "./appConfig";
import { LOG_FOCUS } from "./logFocus";

export const TITLE_MAX = 30;
export const LABEL_MAX = 24;

/** Icons a person can give a shortcut (Ionicons names). */
export const ICON_CHOICES = [
  "heart-outline", "flower-outline", "leaf-outline", "water-outline",
  "moon-outline", "sunny-outline", "flame-outline", "happy-outline", "pulse-outline", "fitness-outline",
  "bed-outline", "cafe-outline", "nutrition-outline", "medkit-outline", "bandage-outline", "body-outline",
  "calendar-outline", "time-outline", "alarm-outline", "notifications-outline", "chatbubbles-outline", "call-outline",
  "people-outline", "person-outline", "book-outline", "school-outline", "play-circle-outline", "musical-notes-outline",
  "camera-outline", "document-text-outline", "bar-chart-outline", "trophy-outline", "gift-outline", "planet-outline",
] as const;
const isIconChoice = (v: unknown): v is string => (ICON_CHOICES as readonly unknown[]).includes(v);

/** How a shortcut is drawn on Home: round icon (4 a row), tile (2 a row) or full-width card. */
export type ShortcutLook = "icon" | "tile" | "card";
export const SHORTCUT_LOOKS: { key: ShortcutLook; label: string; icon: string }[] = [
  { key: "icon", label: "Icon", icon: "ellipse-outline" },
  { key: "tile", label: "Tile", icon: "grid-outline" },
  { key: "card", label: "Card", icon: "reorder-four-outline" },
];
/** `color` / `label` / `icon` null = the tile's own. */
export type ShortcutStyle = { look: ShortcutLook; color: TileColorKey | null; label: string | null; icon: string | null };
export const DEFAULT_SHORTCUT_STYLE: ShortcutStyle = { look: "icon", color: null, label: null, icon: null };

/** Per-block options: a renamed heading and, for list blocks, which items in what order (null = default). */
export type BlockOptions = { title: string | null; items: string[] | null };
type Choice = { key: string; label: string; icon: string };

/**
 * Stats the "Stats" block can show (Home computes the values). The labels
 * are the ones Home prints under each value, so a pick is recognisable.
 */
export const STAT_OPTIONS: Choice[] = [
  { key: "streak", label: "Logging streak", icon: "water" },
  { key: "points", label: "Wallet points", icon: "trophy-outline" },
  { key: "cycleDay", label: "Cycle day", icon: "sync-outline" },
  { key: "nextPeriod", label: "To period", icon: "calendar-outline" },
  { key: "trackedDays", label: "Days tracked", icon: "checkmark-done-outline" },
  { key: "forest", label: "Forest", icon: "leaf-outline" },
];
export const HUB_OPTIONS: Choice[] = [
  { key: "care", label: "Care & Insights", icon: "pulse-outline" },
  { key: "wellness", label: "Wellness & Support", icon: "heart-outline" },
  { key: "explore", label: "Explore", icon: "compass-outline" },
];

/**
 * What each block lets a person change. `title.fallback` null = the block
 * has no heading unless they give it one. `items` blocks show the picked
 * options in the picked order, between `min` and `max` of them.
 */
export const BLOCK_SETTINGS: Partial<
  Record<HomeSectionKey, { title?: { fallback: string | null }; items?: { label: string; options: Choice[]; defaults: string[]; min: number; max: number } }>
> = {
  statPills: { items: { label: "Stats", options: STAT_OPTIONS, defaults: ["streak", "points"], min: 1, max: 3 } },
  quickActions: {
    title: { fallback: null },
    items: { label: "Buttons", options: LOG_FOCUS.map((f) => ({ ...f })), defaults: ["flow", "symptoms", "mood"], min: 1, max: 4 },
  },
  insights: { title: { fallback: "Insights" } },
  moreForYou: { title: { fallback: "More for you" }, items: { label: "Areas", options: HUB_OPTIONS, defaults: ["care", "wellness", "explore"], min: 1, max: 3 } },
  // A heading by default: a bare row of icons at the end of Home reads as stray.
  shortcuts: { title: { fallback: "Shortcuts" } },
};

/**
 * Ready-made Homes (templates), one per kind of person, picked in Customize
 * Home. A template is a whole look: which blocks show and in what order, the
 * items of list blocks and their headings (missing = the block's default),
 * and, when it names them, the shortcuts with their look and colour. A
 * template without `shortcuts` keeps the person's shortcuts and styles.
 * The full default Home is the screen's Reset, not a template.
 *
 * Every template keeps the same top, in the default Home's order, so Home
 * always opens the same way: stats → this week → cycle card → quick log
 * ("where am I today, log it"). What makes each one different comes after.
 * `order` lists all seven blocks, hidden ones in their default place, so the
 * CMS promo slots (after the week strip, after quick log) stay where they are.
 */
export type HomePreset = {
  key: string;
  label: string;
  /** Who it's for, in their words. */
  forWho: string;
  icon: string;
  order: HomeSectionKey[];
  hidden: HomeSectionKey[];
  items?: Partial<Record<HomeSectionKey, string[]>>;
  titles?: Partial<Record<HomeSectionKey, string>>;
  shortcuts?: string[];
  shortcutStyles?: Record<string, { look: ShortcutLook; color?: TileColorKey }>;
};
export const HOME_PRESETS: HomePreset[] = [
  {
    // Working, short on time: log fast, know what's next, nothing else.
    key: "busy",
    label: "On the go",
    forWho: "Busy days. Log in seconds and know what's next.",
    icon: "flash-outline",
    order: ["statPills", "weekStrip", "phaseHero", "quickActions", "shortcuts", "insights", "moreForYou"],
    hidden: ["insights", "moreForYou"],
    items: { quickActions: ["flow", "symptoms", "mood", "medications"], statPills: ["nextPeriod", "cycleDay"] },
    titles: { shortcuts: "Handy" },
    shortcuts: ["predictions", "nuraAi", "checkinCall", "consultation"],
  },
  {
    // PCOS / irregular cycles / trying to conceive: symptoms, trends, doctors, reports.
    key: "health",
    label: "Health focus",
    forWho: "Managing PCOS, irregular cycles or planning a baby.",
    icon: "medkit-outline",
    order: ["statPills", "weekStrip", "phaseHero", "quickActions", "insights", "shortcuts", "moreForYou"],
    hidden: [],
    items: {
      quickActions: ["symptoms", "flow", "medications", "sleep"],
      statPills: ["cycleDay", "nextPeriod", "trackedDays"],
      moreForYou: ["care", "wellness"],
    },
    titles: { insights: "My cycle health", shortcuts: "My care" },
    shortcuts: ["consultation", "symptomChecker", "symptomTrends", "graphsReports", "documents", "nuraAi"],
    shortcutStyles: {
      consultation: { look: "card" },
      symptomChecker: { look: "tile" },
      symptomTrends: { look: "tile" },
      graphsReports: { look: "tile" },
      documents: { look: "tile" },
      nuraAi: { look: "card" },
    },
  },
  {
    // Gen Z: streaks, badges, besties, sharing.
    key: "social",
    label: "Fun & social",
    forWho: "Streaks, badges and your besties.",
    icon: "people-outline",
    order: ["statPills", "weekStrip", "phaseHero", "quickActions", "shortcuts", "moreForYou", "insights"],
    hidden: ["insights"],
    items: { statPills: ["streak", "points", "forest"], quickActions: ["flow", "mood", "symptoms"], moreForYou: ["explore", "wellness"] },
    titles: { shortcuts: "Your squad & streaks" },
    shortcuts: ["circles", "badges", "wrapped", "cycleEra", "forest", "buddyNomination", "partnerSync", "videos"],
    shortcutStyles: {
      circles: { look: "tile", color: "mint" },
      badges: { look: "tile", color: "gold" },
      wrapped: { look: "tile", color: "rose" },
      cycleEra: { look: "tile", color: "lavender" },
    },
  },
  {
    // New to periods or tracking: simple answers, guides, videos, no numbers.
    key: "learn",
    label: "Learning my body",
    forWho: "New to periods or tracking. Simple answers, no charts.",
    icon: "school-outline",
    order: ["statPills", "weekStrip", "phaseHero", "quickActions", "shortcuts", "moreForYou", "insights"],
    hidden: ["statPills", "insights"],
    items: { quickActions: ["flow", "mood", "symptoms"], moreForYou: ["wellness", "explore"] },
    titles: { shortcuts: "Learn & ask" },
    shortcuts: ["nuraAi", "blogs", "videos", "hygiene", "healthConcerns", "cycleEra"],
    shortcutStyles: {
      nuraAi: { look: "card" },
      blogs: { look: "tile" },
      videos: { look: "tile" },
      hygiene: { look: "tile" },
      healthConcerns: { look: "tile" },
      cycleEra: { look: "tile" },
    },
  },
];
export type StyledShortcut = HubTile & { look: ShortcutLook };

export type HomeLayout = {
  /** Customizable blocks in the person's order; ones missing keep CMS order after them. */
  order: HomeSectionKey[];
  hidden: HomeSectionKey[];
  /** Tile keys for Home's Shortcuts, in order. null = the CMS default ("home" placement). */
  shortcuts: string[] | null;
  /** Per-shortcut look, colour, name and icon; a shortcut missing here is a round icon as the CMS drew it. */
  shortcutStyles: Record<string, ShortcutStyle>;
  /** Per-block heading and item picks (BLOCK_SETTINGS); a block missing here uses its defaults. */
  blocks: Partial<Record<HomeSectionKey, BlockOptions>>;
};

export const DEFAULT_HOME_LAYOUT: HomeLayout = { order: [], hidden: [], shortcuts: null, shortcutStyles: {}, blocks: {} };
export const MAX_SHORTCUTS = 12;

export type CustomizableBlock = { key: HomeSectionKey; label: string; description: string; icon: string };

/** The Home blocks a person may hide or move (not the promo slots). */
export const CUSTOMIZABLE_BLOCKS: CustomizableBlock[] = [
  { key: "statPills", label: "Stats", description: "Streak, points, cycle day and more", icon: "flame-outline" },
  { key: "weekStrip", label: "This week", description: "Seven-day strip with your cycle days", icon: "calendar-outline" },
  { key: "phaseHero", label: "Cycle phase card", description: "Today's phase and next period", icon: "water-outline" },
  { key: "quickActions", label: "Quick log", description: "Buttons that open today's log", icon: "add-circle-outline" },
  { key: "insights", label: "Insights", description: "Cycle health and length trend", icon: "analytics-outline" },
  { key: "moreForYou", label: "More for you", description: "Care, Wellness and Explore", icon: "grid-outline" },
  { key: "shortcuts", label: "Shortcuts", description: "Features you pick", icon: "apps-outline" },
];
const CUSTOMIZABLE = new Set<string>(CUSTOMIZABLE_BLOCKS.map((b) => b.key));
export const isCustomizable = (key: string): key is HomeSectionKey => CUSTOMIZABLE.has(key);

const stringList = (v: unknown, max: number): string[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === "string" && x && !out.includes(x)) out.push(x);
  return out.slice(0, max);
};

/** Trimmed one-line text up to `max` characters, or null when empty. */
export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return t || null;
}

const isLook = (v: unknown): v is ShortcutLook => SHORTCUT_LOOKS.some((l) => l.key === v);
const isColorKey = (v: unknown): v is TileColorKey => (TILE_COLOR_KEYS as readonly unknown[]).includes(v);

function parseStyles(raw: unknown): Record<string, ShortcutStyle> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, ShortcutStyle> = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_SHORTCUTS)) {
    const s = v as Record<string, unknown> | null;
    if (!s || typeof s !== "object" || !isLook(s.look)) continue;
    out[key] = {
      look: s.look,
      color: isColorKey(s.color) ? s.color : null,
      label: cleanText(s.label, LABEL_MAX),
      icon: isIconChoice(s.icon) ? s.icon : null,
    };
  }
  return out;
}

function parseBlocks(raw: unknown): HomeLayout["blocks"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: HomeLayout["blocks"] = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const settings = BLOCK_SETTINGS[key as HomeSectionKey];
    if (!settings || !v || typeof v !== "object") continue;
    const opts = normalizeBlock(key as HomeSectionKey, v as Partial<BlockOptions>);
    if (opts) out[key as HomeSectionKey] = opts;
  }
  return out;
}

/** A block's options cleaned against BLOCK_SETTINGS; null when it's all defaults. */
function normalizeBlock(key: HomeSectionKey, v: Partial<BlockOptions>): BlockOptions | null {
  const settings = BLOCK_SETTINGS[key];
  if (!settings) return null;
  const title = settings.title ? cleanText(v.title, TITLE_MAX) : null;
  let items: string[] | null = null;
  if (settings.items && Array.isArray(v.items)) {
    const allowed = settings.items.options.map((o) => o.key);
    const picked = stringList(v.items, settings.items.max).filter((k) => allowed.includes(k));
    const isDefault = picked.join() === settings.items.defaults.join();
    items = picked.length >= settings.items.min && !isDefault ? picked : null;
  }
  return title === null && items === null ? null : { title, items };
}

/** Server or cache value → a layout; anything malformed becomes the default. */
export function parseHomeLayout(raw: unknown): HomeLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return DEFAULT_HOME_LAYOUT;
  const r = raw as Record<string, unknown>;
  return {
    order: stringList(r.order, 40).filter(isCustomizable),
    hidden: stringList(r.hidden, 40).filter(isCustomizable),
    shortcuts: Array.isArray(r.shortcuts) ? stringList(r.shortcuts, MAX_SHORTCUTS) : null,
    shortcutStyles: parseStyles(r.shortcutStyles),
    blocks: parseBlocks(r.blocks),
  };
}

export const isDefaultLayout = (l: HomeLayout) =>
  l.order.length === 0 &&
  l.hidden.length === 0 &&
  l.shortcuts === null &&
  Object.keys(l.shortcutStyles).length === 0 &&
  Object.keys(l.blocks).length === 0;

/** The person's heading for a block, else its own (null = no heading). */
export const blockTitle = (layout: HomeLayout, key: HomeSectionKey): string | null =>
  layout.blocks[key]?.title ?? BLOCK_SETTINGS[key]?.title?.fallback ?? null;

/** The items a list block shows, in order: the person's picks or the defaults. */
export const blockItems = (layout: HomeLayout, key: HomeSectionKey): string[] =>
  layout.blocks[key]?.items ?? BLOCK_SETTINGS[key]?.items?.defaults ?? [];

/** Change a block's heading or items; going back to the defaults drops the entry. */
export function withBlockOptions(layout: HomeLayout, key: HomeSectionKey, patch: Partial<BlockOptions>): HomeLayout {
  const { [key]: current, ...rest } = layout.blocks;
  const next = normalizeBlock(key, { title: current?.title ?? null, items: current?.items ?? null, ...patch });
  return { ...layout, blocks: next ? { ...rest, [key]: next } : rest };
}

/** Pick or unpick an item of a list block, respecting its min and max. */
export function toggleBlockItem(layout: HomeLayout, key: HomeSectionKey, item: string): HomeLayout {
  const settings = BLOCK_SETTINGS[key]?.items;
  if (!settings) return layout;
  const items = blockItems(layout, key);
  if (items.includes(item)) {
    if (items.length <= settings.min) return layout;
    return withBlockOptions(layout, key, { items: items.filter((k) => k !== item) });
  }
  if (items.length >= settings.max) return layout;
  return withBlockOptions(layout, key, { items: [...items, item] });
}

const ALL_BLOCK_KEYS = CUSTOMIZABLE_BLOCKS.map((b) => b.key);

/** Apply a template: blocks, list items, headings and (if it names them) shortcuts with their styles. */
export function applyPreset(layout: HomeLayout, preset: HomePreset): HomeLayout {
  let next: HomeLayout = { ...layout, order: [...preset.order], hidden: [...preset.hidden] };
  for (const key of ALL_BLOCK_KEYS) {
    const settings = BLOCK_SETTINGS[key];
    if (!settings) continue;
    next = withBlockOptions(next, key, {
      ...(settings.items ? { items: preset.items?.[key] ?? null } : {}),
      ...(settings.title ? { title: preset.titles?.[key] ?? null } : {}),
    });
  }
  if (!preset.shortcuts) return next;
  next = withShortcuts({ ...next, shortcutStyles: {} }, [...preset.shortcuts]);
  for (const [key, style] of Object.entries(preset.shortcutStyles ?? {})) {
    next = withShortcutStyle(next, key, { look: style.look, color: style.color ?? null });
  }
  return next;
}

/** The blocks a preset shows, in order, by their names in CUSTOMIZABLE_BLOCKS. */
export function presetBlockLabels(preset: HomePreset): string[] {
  return orderedBlocks(ALL_BLOCK_KEYS, { ...DEFAULT_HOME_LAYOUT, order: preset.order })
    .filter((k) => !preset.hidden.includes(k))
    .map((k) => CUSTOMIZABLE_BLOCKS.find((b) => b.key === k)!.label);
}

/** The preset the layout currently matches (blocks, items and any shortcuts it names), if any. */
export function activePreset(layout: HomeLayout): string | null {
  const order = orderedBlocks(ALL_BLOCK_KEYS, layout).join();
  const hidden = [...layout.hidden].sort().join();
  const match = HOME_PRESETS.find(
    (p) =>
      orderedBlocks(ALL_BLOCK_KEYS, { ...DEFAULT_HOME_LAYOUT, order: p.order }).join() === order &&
      [...p.hidden].sort().join() === hidden &&
      ALL_BLOCK_KEYS.every(
        (k) => !BLOCK_SETTINGS[k]?.items || blockItems(layout, k).join() === (p.items?.[k] ?? BLOCK_SETTINGS[k]!.items!.defaults).join(),
      ) &&
      (!p.shortcuts || (layout.shortcuts ?? []).join() === p.shortcuts.join()),
  );
  return match?.key ?? null;
}

/**
 * The person's order of `keys` (the customizable blocks the CMS shows):
 * ones they placed first, in their order, then the rest in CMS order.
 */
export function orderedBlocks(keys: HomeSectionKey[], layout: HomeLayout): HomeSectionKey[] {
  const placed = layout.order.filter((k) => keys.includes(k));
  return [...placed, ...keys.filter((k) => !placed.includes(k))];
}

/**
 * Home's blocks for this person: hidden ones dropped, customizable ones
 * reordered into the slots customizable blocks held, so promo slots stay
 * exactly where the CMS put them.
 */
export function applyHomeLayout(sections: HomeSection[], layout: HomeLayout): HomeSection[] {
  const byKey = new Map(sections.map((s) => [s.key, s]));
  const queue = orderedBlocks(sections.map((s) => s.key).filter(isCustomizable), layout);
  return sections
    .map((s) => (isCustomizable(s.key) ? byKey.get(queue.shift()!)! : s))
    .filter((s) => !layout.hidden.includes(s.key));
}

/** Where a tile can come from, in the order the picker groups them. */
export const SHORTCUT_SOURCES: { placement: HubPlacement; label: string }[] = [
  { placement: "home", label: "Extras" },
  { placement: "care_hub", label: "Care & Insights" },
  { placement: "wellness_hub", label: "Wellness & Support" },
  { placement: "explore_hub", label: "Explore" },
  { placement: "profile", label: "Profile" },
];

/** Every tile this viewer could pin, grouped by where it lives; a tile is listed once. */
export function pickableTiles(config: AppConfig, viewer: Viewer): { placement: HubPlacement; label: string; tiles: HubTile[] }[] {
  const seen = new Set<string>();
  return SHORTCUT_SOURCES.map((s) => ({
    ...s,
    tiles: hubTilesFor(config, s.placement, viewer).filter((t) => !seen.has(t.key) && seen.add(t.key)),
  })).filter((g) => g.tiles.length > 0);
}

/**
 * Home's Shortcuts for this person: the CMS's "home" tiles until they pick
 * their own, then their picks in order. A pick the CMS has since hidden
 * from them is skipped (and comes back if it returns).
 */
export function shortcutTiles(config: AppConfig, viewer: Viewer, layout: HomeLayout): HubTile[] {
  if (layout.shortcuts === null) return hubTilesFor(config, "home", viewer);
  const all = new Map(pickableTiles(config, viewer).flatMap((g) => g.tiles.map((t) => [t.key, t] as const)));
  return layout.shortcuts.map((k) => all.get(k)).filter((t): t is HubTile => Boolean(t));
}

export const shortcutStyle = (layout: HomeLayout, key: string): ShortcutStyle => layout.shortcutStyles[key] ?? DEFAULT_SHORTCUT_STYLE;

/** The person's shortcuts with their chosen look, colour, name and icon applied (tile/card set the hub tile size). */
export function styledShortcuts(config: AppConfig, viewer: Viewer, layout: HomeLayout): StyledShortcut[] {
  return shortcutTiles(config, viewer, layout).map((t) => {
    const s = shortcutStyle(layout, t.key);
    return {
      ...t,
      look: s.look,
      colorKey: s.color ?? t.colorKey,
      title: s.label ?? t.title,
      icon: s.icon ?? t.icon,
      size: s.look === "card" ? "large" : "small",
    };
  });
}

/**
 * Shortcuts cut into runs Home draws one after another: consecutive icons
 * share an icon grid, consecutive tiles/cards share a tile grid.
 */
export function shortcutRuns(tiles: StyledShortcut[]): { kind: "icons" | "tiles"; tiles: StyledShortcut[] }[] {
  const runs: { kind: "icons" | "tiles"; tiles: StyledShortcut[] }[] = [];
  for (const t of tiles) {
    const kind = t.look === "icon" ? "icons" : "tiles";
    const last = runs[runs.length - 1];
    if (last?.kind === kind) last.tiles.push(t);
    else runs.push({ kind, tiles: [t] });
  }
  return runs;
}

/** New shortcut list, with styles of removed shortcuts dropped. */
export function withShortcuts(layout: HomeLayout, keys: string[]): HomeLayout {
  const shortcutStyles = Object.fromEntries(Object.entries(layout.shortcutStyles).filter(([k]) => keys.includes(k)));
  return { ...layout, shortcuts: keys, shortcutStyles };
}

/** Change one shortcut's look, colour, name or icon; back to the default style drops the entry. */
export function withShortcutStyle(layout: HomeLayout, key: string, patch: Partial<ShortcutStyle>): HomeLayout {
  const merged = { ...shortcutStyle(layout, key), ...patch };
  const next: ShortcutStyle = { ...merged, label: cleanText(merged.label, LABEL_MAX), icon: isIconChoice(merged.icon) ? merged.icon : null };
  const { [key]: _old, ...rest } = layout.shortcutStyles;
  const isDefault = next.look === DEFAULT_SHORTCUT_STYLE.look && next.color === null && next.label === null && next.icon === null;
  return { ...layout, shortcutStyles: isDefault ? rest : { ...rest, [key]: next } };
}

/** Move `key` one step within `keys` (-1 up, 1 down); unchanged at the ends. */
export function moveKey<T>(keys: T[], key: T, dir: -1 | 1): T[] {
  const i = keys.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= keys.length) return keys;
  const next = [...keys];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
