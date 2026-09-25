import type { ThemeColors } from "../components/theme";

/**
 * Single source of truth for the handful of browse tiles that show up in
 * more than one place — the owner-side hubs (wellness-hub.tsx, explore-hub.tsx)
 * and partner-view's read-only overview.tsx "Knowledge & resources" section
 * used to each hand-roll their own copy of these, which drifted (see
 * docs/fixes.md 2.8). `colorKey`/`bgKey` name a `ThemeColors` property rather than
 * a literal color so each screen still resolves them through its own
 * `useTheme()` call and stays theme/light-dark correct.
 */
export type SharedHubTileId =
  | "blogs"
  | "healthConcerns"
  | "hygiene"
  | "nuraAi"
  | "sexualWellbeing"
  | "videos";

export type SharedHubTile = {
  bgKey: keyof ThemeColors;
  colorKey: keyof ThemeColors;
  desc: string;
  icon: string;
  id: SharedHubTileId;
  route: string;
  title: string;
};

export const SHARED_HUB_TILES: Record<SharedHubTileId, SharedHubTile> = {
  blogs: {
    bgKey: "infoLight",
    colorKey: "info",
    desc: "Articles on cycle health",
    icon: "book-outline",
    id: "blogs",
    route: "/(app)/blogs",
    title: "Blogs",
  },
  healthConcerns: {
    bgKey: "warningLight",
    colorKey: "warning",
    desc: "Irregularities & symptoms",
    icon: "alert-circle-outline",
    id: "healthConcerns",
    route: "/(app)/health-issues",
    title: "Health Concerns",
  },
  hygiene: {
    bgKey: "accentLight",
    colorKey: "accent",
    desc: "Product guidance & comfort",
    icon: "leaf-outline",
    id: "hygiene",
    route: "/(app)/hygiene",
    title: "Hygiene & Care",
  },
  nuraAi: {
    bgKey: "infoLight",
    colorKey: "info",
    desc: "Ask privately, anytime",
    icon: "help-circle-outline",
    id: "nuraAi",
    // ?new=1 always starts a fresh chat — qa.tsx redirects a bare push to
    // the chat-history list instead (see docs/fixes.md 2.3).
    route: "/(app)/qa?new=1",
    title: "Nura AI",
  },
  sexualWellbeing: {
    bgKey: "secondaryLight",
    colorKey: "secondary",
    desc: "Consent, intimacy & safety",
    icon: "heart-outline",
    id: "sexualWellbeing",
    route: "/(app)/sexual-wellbeing",
    title: "Sexual Wellbeing",
  },
  videos: {
    bgKey: "primaryLight",
    colorKey: "primary",
    desc: "Short videos and reels",
    icon: "play-circle-outline",
    id: "videos",
    route: "/(app)/reels",
    title: "Videos",
  },
};

export function getSharedHubTiles(ids: SharedHubTileId[]): SharedHubTile[] {
  return ids.map((id) => SHARED_HUB_TILES[id]);
}
