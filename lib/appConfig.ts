/**
 * Remote app layout from the App CMS (The-Nura-CMS portal → period-buddy-be
 * `GET /api/app-config`): which feature tiles show in which hub and how,
 * the Home screen's section order, theme colour overrides, and promo
 * banners. Pure data + helpers only (no React/RN imports) so it's
 * unit-testable; fetching and caching live in components/app-config.tsx.
 *
 * DEFAULT_APP_CONFIG is today's hard-coded layout. It's what the app shows
 * before the first fetch, offline with no cache, or against a backend
 * without the CMS, so the remote config can only ever *adjust* a layout
 * that already works. The feature registry below mirrors period-buddy-be's
 * constants/appCatalog.js: a key the backend sends that isn't in
 * FEATURE_REGISTRY is ignored (an older build can't open a screen it
 * doesn't have), and anything malformed falls back to the default.
 */

/**
 * Where a feature or link tile can live: one of the three hub screens, or a
 * "Shortcuts" block on Home or Profile (components/CmsShortcuts.tsx).
 */
export type HubPlacement = "care_hub" | "wellness_hub" | "explore_hub" | "home" | "profile";
export type FeatureSize = "small" | "large";
export type BannerPlacement = "home_top" | "home_middle" | "popup" | HubPlacement;

/** What a tap does. `app` opens another app by its link, else `fallbackUrl`. */
export type TapAction = {
  type: "none" | "route" | "url" | "app";
  value: string | null;
  fallbackUrl: string | null;
};

export type AudienceSegment = "all" | "signed_in" | "premium" | "free";
export type Platform = "android" | "ios" | "web";

/** Who sees a tile or banner (see period-buddy-be constants/appCatalog.js). */
export type Audience = {
  segment: AudienceSegment;
  platforms: Platform[];
  minAppVersion: string | null;
  maxAppVersion: string | null;
};

/** The viewer an Audience is matched against (hooks/useAudience.ts). */
export type Viewer = {
  signedIn: boolean;
  premium: boolean;
  platform: Platform;
  appVersion: string;
};

/** ThemeColors keys a tile may use (each has a matching `<key>Light` tint). */
export const TILE_COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "info",
  "warning",
  "success",
  "gold",
  "sky",
  "rose",
  "lavender",
  "mint",
] as const;
export type TileColorKey = (typeof TILE_COLOR_KEYS)[number];

export type FeatureDefinition = {
  key: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  placement: HubPlacement;
  size: FeatureSize;
  colorKey: TileColorKey;
};

/**
 * Launch state (The-Nura-CMS docs/launch-states.md §7.3), already decided
 * by the backend for this user/device: open, Coming soon (a locked tile) or
 * paused. `openFor` narrows "open" to viewers matching it (a rollout slice
 * such as "Android only"); everyone else gets `fallback`.
 */
export type LaunchAccess = "open" | "soon" | "paused";

/** What the Coming soon / Paused sheet shows (components/LaunchSheet.tsx). */
export type LaunchSheetInfo = {
  headline: string;
  /** null = show the tile's description instead. */
  message: string | null;
  notifyMe: boolean;
  onList: boolean;
  /** Paused only: where to send people meanwhile ("none" = no button). */
  alternative: TapAction;
  /** The alternative's button text from the CMS; null = a generic label. */
  alternativeLabel: string | null;
};

export type LaunchInfo = {
  access: LaunchAccess;
  beta: boolean;
  openFor: Audience | null;
  fallback: "soon" | "hidden";
  sheet: LaunchSheetInfo;
};

/** A launch resolved against one viewer: what their tile does. */
export type ViewerLaunch = { access: LaunchAccess; beta: boolean; sheet: LaunchSheetInfo };

export type ResolvedFeature = FeatureDefinition & {
  enabled: boolean;
  order: number;
  badge: string | null;
  audience: Audience;
  launch: LaunchInfo;
};

/** An admin-made link tile from the CMS, living in a hub next to the features. */
export type CustomTile = {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  colorKey: TileColorKey;
  placement: HubPlacement;
  size: FeatureSize;
  order: number;
  enabled: boolean;
  badge: string | null;
  action: TapAction;
  audience: Audience;
  launch: LaunchInfo;
};

/** Anything a hub renders: a built-in feature or a link tile, normalised. */
export type HubTile = {
  key: string;
  title: string;
  description: string;
  icon: string;
  colorKey: TileColorKey;
  size: FeatureSize;
  order: number;
  badge: string | null;
  action: TapAction;
  /** Built-in features get the GenZ label swap; admin text is shown as written. */
  builtIn: boolean;
  /** Open / Coming soon / paused for this viewer. `key` doubles as the launch item key. */
  launch: ViewerLaunch;
};

export type AppSettings = {
  maintenance: { enabled: boolean; title: string; message: string };
  update: {
    minVersion: string | null;
    latestVersion: string | null;
    title: string;
    message: string;
    androidUrl: string | null;
    iosUrl: string | null;
  };
};

export type HomeSectionKey =
  | "statPills"
  | "weekStrip"
  | "promo_top"
  | "phaseHero"
  | "quickActions"
  | "shortcuts"
  | "promo_middle"
  | "insights"
  | "moreForYou";

export type HomeSection = { key: HomeSectionKey; visible: boolean };

export type PromoBanner = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaLabel: string | null;
  imageUrl: string | null;
  placement: BannerPlacement;
  layout: "card" | "image" | "strip";
  action: TapAction;
  audience: Audience;
  backgroundColor: string | null;
  textColor: string | null;
  priority: number;
  dismissible: boolean;
  endAt: string | null;
};

export type ThemeOverrides = { light: Record<string, string>; dark: Record<string, string> };

export type AppConfig = {
  version: number;
  features: ResolvedFeature[];
  customTiles: CustomTile[];
  homeSections: HomeSection[];
  theme: ThemeOverrides;
  settings: AppSettings;
  banners: PromoBanner[];
};

const HUBS: HubPlacement[] = ["care_hub", "wellness_hub", "explore_hub", "home", "profile"];
const BANNER_PLACEMENTS: BannerPlacement[] = ["home_top", "home_middle", "popup", ...HUBS];

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // Care & Insights
  { key: "predictions", title: "Predictions", description: "Cycle forecasts & trends", icon: "trending-up-outline", route: "/(app)/predictions", placement: "care_hub", size: "small", colorKey: "primary" },
  { key: "insights", title: "Daily Insights", description: "Mood, hormone & energy", icon: "sparkles-outline", route: "/(app)/insights", placement: "care_hub", size: "small", colorKey: "secondary" },
  { key: "symptomTrends", title: "Symptom Trends", description: "Likely by cycle phase", icon: "pulse-outline", route: "/(app)/symptom-predictions", placement: "care_hub", size: "small", colorKey: "accent" },
  { key: "symptomChecker", title: "Symptom Checker", description: "PCOS, thyroid & more", icon: "clipboard-outline", route: "/(app)/symptom-checker", placement: "care_hub", size: "small", colorKey: "info" },
  { key: "graphsReports", title: "Graphs & Reports", description: "Cycle history at a glance", icon: "bar-chart-outline", route: "/(app)/graphs-reports", placement: "care_hub", size: "small", colorKey: "gold" },
  { key: "documents", title: "Documents", description: "Reports, prescriptions & chat", icon: "document-text-outline", route: "/documents", placement: "care_hub", size: "small", colorKey: "primary" },
  { key: "consultation", title: "Talk to a gynecologist", description: "Private consult, secure chat & video call", icon: "chatbubbles-outline", route: "/(app)/consultation", placement: "care_hub", size: "large", colorKey: "primary" },
  // Wellness & Support
  // ?new=1 always starts a fresh chat — qa.tsx redirects a bare push to the
  // chat-history list instead (see docs/fixes.md 2.3).
  { key: "nuraAi", title: "Nura AI", description: "Ask privately, anytime", icon: "help-circle-outline", route: "/(app)/qa", placement: "wellness_hub", size: "large", colorKey: "info" },
  { key: "healthConcerns", title: "Health Concerns", description: "Irregularities & symptoms", icon: "alert-circle-outline", route: "/(app)/health-issues", placement: "wellness_hub", size: "large", colorKey: "warning" },
  { key: "hygiene", title: "Hygiene & Care", description: "Product guidance & comfort", icon: "leaf-outline", route: "/(app)/hygiene", placement: "wellness_hub", size: "small", colorKey: "accent" },
  { key: "sexualWellbeing", title: "Sexual Wellbeing", description: "Consent, intimacy & safety", icon: "heart-outline", route: "/(app)/sexual-wellbeing", placement: "wellness_hub", size: "small", colorKey: "secondary" },
  { key: "checkinCall", title: "Check-in Call", description: "Buddy calls you, hands-free", icon: "call-outline", route: "/(app)/checkin-call", placement: "wellness_hub", size: "small", colorKey: "sky" },
  // Explore
  { key: "forest", title: "Forest", description: "Grow your wellness tree", icon: "leaf-outline", route: "/(app)/forest", placement: "explore_hub", size: "small", colorKey: "success" },
  { key: "blogs", title: "Blogs", description: "Articles on cycle health", icon: "book-outline", route: "/(app)/blogs", placement: "explore_hub", size: "small", colorKey: "info" },
  { key: "videos", title: "Videos", description: "Short videos and reels", icon: "play-circle-outline", route: "/(app)/reels", placement: "explore_hub", size: "small", colorKey: "primary" },
  { key: "partnerSync", title: "Partner Sync", description: "Share cycle info & chat", icon: "git-merge-outline", route: "/(app)/partner", placement: "explore_hub", size: "small", colorKey: "accent" },
  { key: "habits", title: "Habits", description: "Daily habit tracking", icon: "checkmark-done-outline", route: "/(app)/habits", placement: "explore_hub", size: "small", colorKey: "warning" },
  { key: "buddyNomination", title: "Nominate Buddy", description: "Anonymous peer support", icon: "star-outline", route: "/(app)/buddy-nomination", placement: "explore_hub", size: "small", colorKey: "secondary" },
  // Gen Z pack — Home's Shortcuts block by default
  { key: "wrapped", title: "Cycle Wrapped", description: "Your month, story-style", icon: "sparkles", route: "/(app)/wrapped", placement: "home", size: "small", colorKey: "rose" },
  { key: "cycleEra", title: "Your Era", description: "Phase vibes & cycle syncing", icon: "planet-outline", route: "/(app)/era", placement: "home", size: "small", colorKey: "lavender" },
  { key: "badges", title: "Streaks & Badges", description: "Collect them all", icon: "trophy-outline", route: "/(app)/badges", placement: "home", size: "small", colorKey: "gold" },
  { key: "circles", title: "Bestie Circles", description: "Your squad, your vibes", icon: "people-circle-outline", route: "/(app)/circles", placement: "home", size: "small", colorKey: "mint" },
];

const REGISTRY_BY_KEY = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));

export const DEFAULT_HOME_SECTIONS: HomeSection[] = (
  ["statPills", "weekStrip", "promo_top", "phaseHero", "quickActions", "promo_middle", "insights", "moreForYou", "shortcuts"] as HomeSectionKey[]
).map((key) => ({ key, visible: true }));

const SECTION_KEYS = new Set<string>(DEFAULT_HOME_SECTIONS.map((s) => s.key));

/**
 * Theme tokens the CMS may override (mirrors the backend's THEME_TOKENS).
 * Everything else in ThemeColors — danger, overlays, shadows — stays local.
 */
export const OVERRIDABLE_THEME_TOKENS = new Set([
  "primary", "primaryDark", "primaryLight", "secondary", "secondaryLight", "accent", "accentLight",
  "background", "surface", "surfaceSoft", "border", "button", "buttonText", "foreground", "text", "mutedText",
]);

export const EVERYONE: Audience = { segment: "all", platforms: [], minAppVersion: null, maxAppVersion: null };

const NO_ACTION: TapAction = { type: "none", value: null, fallbackUrl: null };

/** Plainly open: what every item is without a `launch` from the backend. */
export const OPEN_LAUNCH: LaunchInfo = {
  access: "open",
  beta: false,
  openFor: null,
  fallback: "soon",
  sheet: { headline: "Coming soon", message: null, notifyMe: false, onList: false, alternative: NO_ACTION, alternativeLabel: null },
};

export const DEFAULT_SETTINGS: AppSettings = {
  maintenance: {
    enabled: false,
    title: "We\u2019ll be right back",
    message: "The Nura app is getting an update. Please check back in a little while.",
  },
  update: {
    minVersion: null,
    latestVersion: null,
    title: "A new version is available",
    message: "Update The Nura to get the latest features and fixes.",
    androidUrl: null,
    iosUrl: null,
  },
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  version: 0,
  features: FEATURE_REGISTRY.map((f, order) => ({ ...f, enabled: true, order, badge: null, audience: EVERYONE, launch: OPEN_LAUNCH })),
  customTiles: [],
  homeSections: DEFAULT_HOME_SECTIONS,
  theme: { light: {}, dark: {} },
  settings: DEFAULT_SETTINGS,
  banners: [],
};

/* ------------------------------ Validation ------------------------------ */

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGBA = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
export const isSafeColor = (v: unknown): v is string =>
  typeof v === "string" && (HEX.test(v.trim()) || RGBA.test(v.trim()));

/** In-app path only (same rule as notification taps): "/x", no scheme, no "//". */
export const isInAppRoute = (v: unknown): v is string =>
  typeof v === "string" && /^\/(?!\/)[A-Za-z0-9\-._~()/?=&%]*$/.test(v) && !v.includes("..");

const isHttpsUrl = (v: unknown): v is string => typeof v === "string" && /^https:\/\/[^\s]+$/i.test(v);

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const VERSION = /^\d{1,4}(\.\d{1,4}){0,2}$/;
const version = (v: unknown): string | null => (typeof v === "string" && VERSION.test(v.trim()) ? v.trim() : null);

/** -1 / 0 / 1, "1.2" == "1.2.0". A non-version compares as 0.0.0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Another app's link. Code-running schemes are refused here as well as on
// the server, since the cached copy on the device is only as safe as this check.
const BLOCKED_SCHEMES = new Set(["javascript", "data", "file", "vbscript", "blob", "about"]);
export const isAppLink = (v: unknown): v is string => {
  if (typeof v !== "string") return false;
  const m = /^([a-z][a-z0-9+.-]{1,31}):\/{0,2}\S+$/i.exec(v.trim());
  return Boolean(m) && !BLOCKED_SCHEMES.has(m![1].toLowerCase());
};

/** Validated tap action; anything unsafe or malformed becomes "none". */
function parseAction(raw: unknown): TapAction {
  const a = (raw ?? {}) as { type?: string; value?: unknown; fallbackUrl?: unknown };
  const fallbackUrl = isHttpsUrl(a.fallbackUrl) ? a.fallbackUrl : null;
  if (a.type === "route" && isInAppRoute(a.value)) return { type: "route", value: a.value, fallbackUrl: null };
  if (a.type === "url" && isHttpsUrl(a.value)) return { type: "url", value: a.value, fallbackUrl: null };
  if (a.type === "app" && isAppLink(a.value)) return { type: "app", value: a.value.trim(), fallbackUrl };
  return { type: "none", value: null, fallbackUrl: null };
}

function parseAudience(raw: unknown): Audience {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    segment: oneOf(a.segment, ["all", "signed_in", "premium", "free"] as const, "all"),
    platforms: Array.isArray(a.platforms)
      ? (a.platforms.filter((p) => p === "android" || p === "ios" || p === "web") as Platform[])
      : [],
    minAppVersion: version(a.minAppVersion),
    maxAppVersion: version(a.maxAppVersion),
  };
}

/**
 * `launch` from the backend → LaunchInfo. Missing or malformed means open
 * (an older backend has no launch states), so this can only ever lock a
 * tile the backend explicitly said to lock.
 */
function parseLaunch(raw: unknown): LaunchInfo {
  if (!raw || typeof raw !== "object") return OPEN_LAUNCH;
  const l = raw as Record<string, unknown>;
  const access = oneOf(l.access, ["open", "soon", "paused"] as const, "open");
  const s = (l.sheet && typeof l.sheet === "object" ? l.sheet : {}) as Record<string, unknown>;
  return {
    access,
    beta: access === "open" && l.beta === true,
    openFor: l.openFor && typeof l.openFor === "object" ? parseAudience(l.openFor) : null,
    fallback: oneOf(l.fallback, ["soon", "hidden"] as const, "soon"),
    sheet: {
      headline: text(s.headline, 60) ?? (access === "paused" ? "Taking a short break" : "Coming soon"),
      message: text(s.message, 200),
      notifyMe: s.notifyMe === true,
      onList: s.onList === true,
      alternative: parseAction(s.alternative),
      alternativeLabel: text(s.alternativeLabel, 24),
    },
  };
}

/** Whether `viewer` is in `audience`. Unknown rules never hide anything. */
export function matchesAudience(audience: Audience, viewer: Viewer): boolean {
  if (audience.segment === "signed_in" && !viewer.signedIn) return false;
  if (audience.segment === "premium" && !viewer.premium) return false;
  if (audience.segment === "free" && (!viewer.signedIn || viewer.premium)) return false;
  if (audience.platforms.length > 0 && !audience.platforms.includes(viewer.platform)) return false;
  if (audience.minAppVersion && compareVersions(viewer.appVersion, audience.minAppVersion) < 0) return false;
  if (audience.maxAppVersion && compareVersions(viewer.appVersion, audience.maxAppVersion) > 0) return false;
  return true;
}

/**
 * Turn whatever `GET /api/app-config` returned (or a cached copy) into a
 * safe AppConfig. Never throws: bad or missing parts fall back to defaults.
 */
export function parseAppConfig(raw: unknown): AppConfig {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // Features: start from the registry so a feature the backend doesn't send
  // (e.g. added in this build, not yet in the CMS) still shows.
  const sent = new Map<string, Record<string, unknown>>();
  if (Array.isArray(data.features)) {
    for (const f of data.features) {
      if (f && typeof f === "object" && REGISTRY_BY_KEY.has((f as { key?: string }).key ?? "")) {
        sent.set((f as { key: string }).key, f as Record<string, unknown>);
      }
    }
  }
  const features: ResolvedFeature[] = FEATURE_REGISTRY.map((def, i) => {
    const s = sent.get(def.key);
    if (!s) return { ...def, enabled: true, order: 100 + i, badge: null, audience: EVERYONE, launch: OPEN_LAUNCH };
    return {
      ...def,
      title: text(s.title, 40) ?? def.title,
      description: text(s.description, 80) ?? def.description,
      placement: oneOf(s.placement, HUBS, def.placement),
      size: oneOf(s.size, ["small", "large"] as const, def.size),
      colorKey: oneOf(s.colorKey, TILE_COLOR_KEYS, def.colorKey),
      enabled: s.enabled !== false,
      order: typeof s.order === "number" && Number.isFinite(s.order) ? s.order : 100 + i,
      badge: text(s.badge, 12),
      audience: parseAudience(s.audience),
      launch: parseLaunch(s.launch),
    };
  });

  const customTiles: CustomTile[] = [];
  if (Array.isArray(data.customTiles)) {
    for (const t of data.customTiles as Record<string, unknown>[]) {
      if (!t || typeof t !== "object") continue;
      const title = text(t.title, 40);
      const action = parseAction(t.action);
      if (!title || typeof t.icon !== "string") continue;
      // No action = a Coming soon teaser for something not in the app yet
      // (the CMS allows that only while it's locked); hubTilesFor drops it
      // for anyone it would open for, since there's nothing to open.
      customTiles.push({
        id: String(t.id ?? title),
        title,
        description: text(t.description, 80),
        icon: t.icon,
        colorKey: oneOf(t.colorKey, TILE_COLOR_KEYS, "primary"),
        placement: oneOf(t.placement, HUBS, "explore_hub"),
        size: oneOf(t.size, ["small", "large"] as const, "small"),
        order: typeof t.order === "number" && Number.isFinite(t.order) ? t.order : 999,
        enabled: t.enabled !== false,
        badge: text(t.badge, 12),
        action,
        audience: parseAudience(t.audience),
        launch: parseLaunch(t.launch),
      });
    }
  }

  // Home sections: the sent order, then any known section it left out
  // (visible, in default order) so a new section in this build never vanishes.
  const homeSections: HomeSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(data.homeSections)) {
    const sorted = [...data.homeSections]
      .filter((s): s is { key: HomeSectionKey; visible?: boolean; order?: number } =>
        Boolean(s) && typeof s === "object" && SECTION_KEYS.has((s as { key?: string }).key ?? ""))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    for (const s of sorted) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      homeSections.push({ key: s.key, visible: s.visible !== false });
    }
  }
  for (const s of DEFAULT_HOME_SECTIONS) if (!seen.has(s.key)) homeSections.push(s);

  const theme: ThemeOverrides = { light: {}, dark: {} };
  const rawTheme = (data.theme ?? {}) as Record<string, unknown>;
  for (const mode of ["light", "dark"] as const) {
    const colors = rawTheme[mode];
    if (!colors || typeof colors !== "object") continue;
    for (const [token, color] of Object.entries(colors as Record<string, unknown>)) {
      if (OVERRIDABLE_THEME_TOKENS.has(token) && isSafeColor(color)) theme[mode][token] = color.trim();
    }
  }

  const banners: PromoBanner[] = [];
  if (Array.isArray(data.banners)) {
    for (const b of data.banners as Record<string, unknown>[]) {
      if (!b || typeof b !== "object") continue;
      const title = text(b.title, 60);
      const placement = oneOf(b.placement, BANNER_PLACEMENTS, "home_top");
      if (!title || !BANNER_PLACEMENTS.includes(b.placement as BannerPlacement)) continue;
      const layout = oneOf(b.layout, ["card", "image", "strip"] as const, "card");
      const imageUrl = isHttpsUrl(b.imageUrl) ? b.imageUrl : null;
      if (layout === "image" && !imageUrl) continue;
      const action = parseAction(b.action);
      banners.push({
        id: String(b.id ?? title),
        title,
        subtitle: text(b.subtitle, 140),
        ctaLabel: text(b.ctaLabel, 24),
        imageUrl,
        placement,
        layout,
        action,
        audience: parseAudience(b.audience),
        backgroundColor: isSafeColor(b.backgroundColor) ? b.backgroundColor : null,
        textColor: isSafeColor(b.textColor) ? b.textColor : null,
        priority: typeof b.priority === "number" ? b.priority : 0,
        dismissible: b.dismissible === true,
        endAt: typeof b.endAt === "string" ? b.endAt : null,
      });
    }
  }

  const rawSettings = (data.settings ?? {}) as { maintenance?: Record<string, unknown>; update?: Record<string, unknown> };
  const m = rawSettings.maintenance ?? {};
  const u = rawSettings.update ?? {};
  const settings: AppSettings = {
    maintenance: {
      enabled: m.enabled === true,
      title: text(m.title, 60) ?? DEFAULT_SETTINGS.maintenance.title,
      message: text(m.message, 300) ?? DEFAULT_SETTINGS.maintenance.message,
    },
    update: {
      minVersion: version(u.minVersion),
      latestVersion: version(u.latestVersion),
      title: text(u.title, 60) ?? DEFAULT_SETTINGS.update.title,
      message: text(u.message, 300) ?? DEFAULT_SETTINGS.update.message,
      androidUrl: isHttpsUrl(u.androidUrl) ? u.androidUrl : null,
      iosUrl: isHttpsUrl(u.iosUrl) ? u.iosUrl : null,
    },
  };

  return {
    version: typeof data.version === "number" ? data.version : 0,
    features,
    customTiles,
    homeSections,
    theme,
    settings,
    banners,
  };
}

/* ------------------------------ Selectors ------------------------------ */

/** Viewer used when there's nobody to match (e.g. tests): everything shows. */
export const ANY_VIEWER: Viewer = { signedIn: true, premium: true, platform: "android", appVersion: "999.0.0" };

/**
 * An item's launch for `viewer`, or null when it's hidden from them (open
 * only for a rollout slice they're not in, with "everyone else sees
 * nothing"). Outside the slice with the Coming soon fallback, they get a
 * locked tile.
 */
export function resolveLaunch(launch: LaunchInfo, viewer: Viewer): ViewerLaunch | null {
  if (launch.access === "open" && launch.openFor && !matchesAudience(launch.openFor, viewer)) {
    if (launch.fallback === "hidden") return null;
    return { access: "soon", beta: false, sheet: launch.sheet };
  }
  return { access: launch.access, beta: launch.beta, sheet: launch.sheet };
}

/**
 * What a hub shows for `viewer`: its enabled built-in features and link
 * tiles, filtered by audience and launch state, in one CMS order. Coming
 * soon and paused tiles stay in (drawn locked); `launch` says which.
 */
export function hubTilesFor(config: AppConfig, placement: HubPlacement, viewer: Viewer = ANY_VIEWER): HubTile[] {
  const tiles: HubTile[] = [];
  for (const f of config.features) {
    if (!f.enabled || f.placement !== placement || !matchesAudience(f.audience, viewer)) continue;
    const launch = resolveLaunch(f.launch, viewer);
    if (!launch) continue;
    tiles.push({
      key: f.key,
      title: f.title,
      description: f.description,
      icon: f.icon,
      colorKey: f.colorKey,
      size: f.size,
      order: f.order,
      badge: f.badge,
      action: { type: "route", value: f.route, fallbackUrl: null },
      builtIn: true,
      launch,
    });
  }
  for (const t of config.customTiles) {
    if (!t.enabled || t.placement !== placement || !matchesAudience(t.audience, viewer)) continue;
    const launch = resolveLaunch(t.launch, viewer);
    if (!launch || (launch.access === "open" && t.action.type === "none")) continue;
    tiles.push({
      key: `link:${t.id}`,
      title: t.title,
      description: t.description ?? "",
      icon: t.icon,
      colorKey: t.colorKey,
      size: t.size,
      order: t.order,
      badge: t.badge,
      action: t.action,
      builtIn: false,
      launch,
    });
  }
  return tiles.sort((a, b) => a.order - b.order);
}

/** Built-in features only (kept for callers that need the feature objects). */
export const featuresFor = (config: AppConfig, placement: HubPlacement): ResolvedFeature[] =>
  config.features.filter((f) => f.enabled && f.placement === placement).sort((a, b) => a.order - b.order);

/**
 * Whether `key` is shown to `viewer` *and* usable. A Coming soon or paused
 * feature counts as not visible here: callers use this to offer plain links
 * to a feature, and a link to something locked would just open its sheet.
 */
export const isFeatureVisible = (config: AppConfig, key: string, viewer: Viewer = ANY_VIEWER) =>
  config.features.some(
    (f) => f.key === key && f.enabled && matchesAudience(f.audience, viewer) && resolveLaunch(f.launch, viewer)?.access === "open"
  );

/** "/(app)/qa?new=1" → "/qa": route groups, query and hash dropped, no trailing slash. */
export function routePath(route: string): string {
  const path = route
    .split(/[?#]/)[0]
    .replace(/\/\([^/)]*\)/g, "")
    .replace(/\/+$/, "");
  return path.startsWith("/") ? path : `/${path}`;
}

/** What the route guard shows instead of a locked feature's screen. */
export type LockedRoute = {
  itemKey: string;
  title: string;
  description: string;
  icon: string;
  colorKey: TileColorKey;
  builtIn: boolean;
  access: Exclude<LaunchAccess, "open">;
  sheet: LaunchSheetInfo;
};

/**
 * Route guard: if `route` (from a banner, link tile, pop-up, push or shared
 * link) opens a feature that's Coming soon or paused for `viewer`, the
 * sheet to show instead; null when it may open. A route belongs to a
 * feature when its path equals the feature route's path or sits under it
 * ("/consultation/book/…" belongs to "/(app)/consultation").
 *
 * A feature hidden from this viewer by its rollout ("everyone else sees
 * nothing") is guarded with the Coming soon sheet too, minus Notify me:
 * a stale link must not open an unlaunched screen. A feature the CMS
 * simply switched off (no launch lock) isn't guarded, as before.
 */
export function launchForRoute(config: AppConfig, route: string, viewer: Viewer = ANY_VIEWER): LockedRoute | null {
  const path = routePath(route);
  for (const f of config.features) {
    const base = routePath(f.route);
    if (path !== base && !path.startsWith(`${base}/`)) continue;
    // An item the backend hid (enabled: false) still carries its lock, if any.
    const launch = resolveLaunch(f.launch, viewer) ?? { access: "soon" as const, beta: false, sheet: { ...f.launch.sheet, notifyMe: false } };
    if (launch.access === "open") continue;
    return {
      itemKey: f.key,
      title: f.title,
      description: f.description,
      icon: f.icon,
      colorKey: f.colorKey,
      builtIn: true,
      access: launch.access,
      sheet: launch.sheet,
    };
  }
  return null;
}

/**
 * Banners for a placement, highest priority first. `endAt` is re-checked on
 * the device so a cached banner doesn't outlive its campaign while offline.
 */
export const bannersFor = (
  config: AppConfig,
  placement: BannerPlacement,
  dismissed: ReadonlySet<string> = new Set(),
  viewer: Viewer = ANY_VIEWER,
  now: number = Date.now()
): PromoBanner[] =>
  config.banners
    .filter(
      (b) =>
        b.placement === placement &&
        !dismissed.has(b.id) &&
        matchesAudience(b.audience, viewer) &&
        (!b.endAt || new Date(b.endAt).getTime() > now)
    )
    .sort((a, b) => b.priority - a.priority);

/**
 * What the app-wide gate should show: maintenance (blocks everything),
 * a required update (blocks), an optional update (dismissible), or nothing.
 * The optional prompt is keyed by `latestVersion` so dismissing it once
 * hides it until the CMS announces a newer version.
 */
export type GateState =
  | { kind: "none" }
  | { kind: "maintenance"; title: string; message: string }
  | { kind: "update"; required: boolean; title: string; message: string; storeUrl: string | null; version: string };

export function gateState(settings: AppSettings, viewer: Viewer, dismissedUpdate: string | null): GateState {
  if (settings.maintenance.enabled) {
    return { kind: "maintenance", title: settings.maintenance.title, message: settings.maintenance.message };
  }
  const u = settings.update;
  const storeUrl = viewer.platform === "ios" ? u.iosUrl ?? u.androidUrl : u.androidUrl ?? u.iosUrl;
  // Web builds are always current, so version prompts are for the store apps only.
  if (viewer.platform === "web") return { kind: "none" };
  if (u.minVersion && compareVersions(viewer.appVersion, u.minVersion) < 0) {
    return { kind: "update", required: true, title: u.title, message: u.message, storeUrl, version: u.minVersion };
  }
  if (u.latestVersion && compareVersions(viewer.appVersion, u.latestVersion) < 0 && dismissedUpdate !== u.latestVersion) {
    return { kind: "update", required: false, title: u.title, message: u.message, storeUrl, version: u.latestVersion };
  }
  return { kind: "none" };
}

/**
 * Group a hub's tiles for rendering: consecutive small tiles share a
 * two-column grid, a large tile gets its own full-width row.
 */
export function groupTiles<T extends { size: FeatureSize }>(features: T[]): (T | T[])[] {
  const blocks: (T | T[])[] = [];
  for (const f of features) {
    const last = blocks[blocks.length - 1];
    if (f.size === "small" && Array.isArray(last)) last.push(f);
    else blocks.push(f.size === "small" ? [f] : f);
  }
  return blocks;
}

/**
 * Subtitle for a hub's entry card on Home. While the hub holds exactly its
 * default features the hand-written `fallback` stays; once the CMS moves
 * tiles around it's built from the real titles, so the card never
 * advertises a feature that now lives somewhere else.
 */
export function describeHub(
  config: AppConfig,
  placement: HubPlacement,
  fallback: string,
  viewer: Viewer = ANY_VIEWER
): string {
  const visible = hubTilesFor(config, placement, viewer);
  const defaults = FEATURE_REGISTRY.filter((f) => f.placement === placement).map((f) => f.key);
  const same = visible.length === defaults.length && visible.every((f) => defaults.includes(f.key));
  if (same) return fallback;
  const titles = visible.slice(0, 3).map((f) => f.title);
  if (titles.length === 0) return fallback;
  return visible.length > 3 ? `${titles.join(", ")} & more` : titles.length > 1 ? `${titles.slice(0, -1).join(", ")} & ${titles[titles.length - 1]}` : titles[0];
}
