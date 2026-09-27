import { appConfigApi } from "./api";
import { ANY_VIEWER, AppConfig, DEFAULT_APP_CONFIG, HubTile, Viewer, launchForRoute } from "./appConfig";
import { showLaunchSheet } from "./modal-host";

/**
 * Route guard for App CMS launch states (The-Nura-CMS docs/launch-states.md
 * §4.4): banners, link tiles, the pop-up, push taps and shared links can
 * all point at a feature that's Coming soon or paused for this user, and
 * must open its sheet instead of the half-ready screen.
 *
 * Navigation helpers (lib/tapAction.ts, AppShell) have no React context, so
 * the latest config and viewer are mirrored here by `<AppConfigSync />`
 * (components/app-config.tsx). Before that first sync nothing is guarded,
 * which only matters for the instant before the root layout mounts.
 */
let current: { config: AppConfig; viewer: Viewer } = { config: DEFAULT_APP_CONFIG, viewer: ANY_VIEWER };

export function setLaunchContext(config: AppConfig, viewer: Viewer) {
  current = { config, viewer };
}

/**
 * If `route` opens a locked feature, show its sheet and return true (don't
 * navigate). False means go ahead.
 */
export function guardRoute(route: string): boolean {
  const locked = launchForRoute(current.config, route, current.viewer);
  if (!locked) return false;
  if (locked.access === "soon") appConfigApi.trackLockedTap(locked.itemKey).catch(() => undefined);
  // No host yet (can't happen once the app has rendered): still refuse to
  // open the screen; the tap just does nothing.
  showLaunchSheet(locked);
  return true;
}

/** A Coming soon or paused tile was tapped: show its sheet (and count the tap). */
export function openTileSheet(tile: HubTile) {
  if (tile.launch.access === "open") return;
  if (tile.launch.access === "soon") appConfigApi.trackLockedTap(tile.key).catch(() => undefined);
  showLaunchSheet({
    itemKey: tile.key,
    title: tile.title,
    description: tile.description,
    icon: tile.icon,
    colorKey: tile.colorKey,
    builtIn: tile.builtIn,
    access: tile.launch.access,
    sheet: tile.launch.sheet,
  });
}
