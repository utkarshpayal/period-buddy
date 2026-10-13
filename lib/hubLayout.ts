import type { HubTile } from "./appConfig";

/**
 * How a hub screen draws the tiles the App CMS gives it (components/HubScreen.tsx).
 *
 * The CMS decides which tiles a hub has and their order. On top of that the
 * app groups its built-in features into titled sections, each drawn either
 * as a `list` (rows in one white card) or as `tiles` (a two-column grid of
 * tinted cards), and can lift one feature into a `hero` card at the top.
 *
 * - A section is placed where its first tile appears in the CMS order, and
 *   keeps the CMS order inside it.
 * - Anything this file doesn't name (an admin link tile, a feature the CMS
 *   moved to another hub) falls back to its CMS size: `large` as a list row,
 *   `small` as a grid tile, in untitled sections.
 * - The hero is used only while that feature is open for the viewer; a
 *   Coming soon or paused one is drawn as a normal row instead.
 */

export type HubPlacementKey = "care_hub" | "wellness_hub" | "explore_hub";
export type HubSectionStyle = "list" | "tiles";

type SectionDef = { id: string; title: string | null; style: HubSectionStyle; keys: string[] };

export const HUB_HERO: Partial<Record<HubPlacementKey, string>> = {
  care_hub: "consultation",
  wellness_hub: "nuraAi",
};

export const HUB_SECTIONS: Record<HubPlacementKey, SectionDef[]> = {
  care_hub: [
    { id: "understand", title: "Understand your cycle", style: "list", keys: ["predictions", "insights", "symptomTrends", "graphsReports"] },
    { id: "tools", title: "Health tools", style: "tiles", keys: ["symptomChecker", "documents"] },
  ],
  wellness_hub: [
    { id: "concerns", title: null, style: "list", keys: ["healthConcerns"] },
    { id: "support", title: "More support", style: "list", keys: ["hygiene", "sexualWellbeing", "checkinCall"] },
  ],
  explore_hub: [
    { id: "grow", title: "Grow", style: "tiles", keys: ["forest", "habits"] },
    { id: "learn", title: "Learn", style: "tiles", keys: ["blogs", "videos"] },
    { id: "connect", title: "Connect", style: "list", keys: ["partnerSync", "buddyNomination"] },
  ],
};

export type HubSection = { id: string; title: string | null; style: HubSectionStyle; tiles: HubTile[] };

export function arrangeHub(placement: HubPlacementKey, tiles: HubTile[]): { hero: HubTile | null; sections: HubSection[] } {
  const heroKey = HUB_HERO[placement];
  const hero = tiles.find((t) => t.key === heroKey && t.launch.access === "open") ?? null;
  const defs = HUB_SECTIONS[placement];
  const sections: HubSection[] = [];
  const byId = new Map<string, HubSection>();

  for (const tile of tiles) {
    if (tile === hero) continue;
    const def = defs.find((d) => d.keys.includes(tile.key));
    if (def) {
      let section = byId.get(def.id);
      if (!section) {
        section = { id: def.id, title: def.title, style: def.style, tiles: [] };
        byId.set(def.id, section);
        sections.push(section);
      }
      section.tiles.push(tile);
      continue;
    }
    // Not one of ours: by CMS size, joining the previous untitled run of the same style.
    const style: HubSectionStyle = tile.size === "large" ? "list" : "tiles";
    const last = sections[sections.length - 1];
    if (last && last.title === null && last.style === style && last.id.startsWith("more-")) {
      last.tiles.push(tile);
    } else {
      sections.push({ id: `more-${sections.length}`, title: null, style, tiles: [tile] });
    }
  }
  return { hero, sections };
}
