import React from "react";
import { View } from "react-native";
import { CmsShortcuts } from "./CmsShortcuts";
import { HubFeatureTiles } from "./HubFeatureTiles";
import { StyledShortcut, shortcutRuns } from "../lib/homeLayout";

/**
 * Home's Shortcuts in the look each person picked (Profile → Customize Home):
 * round icons four a row, tiles two a row, cards full width, in their order.
 * Shared with the live preview on the Customize Home screen.
 */
export function HomeShortcuts({ tiles, style }: { tiles: StyledShortcut[]; style?: object }) {
  if (tiles.length === 0) return null;
  return (
    <View style={[{ gap: 16 }, style]}>
      {shortcutRuns(tiles).map((run) =>
        run.kind === "icons" ? (
          <CmsShortcuts key={run.tiles[0].key} placement="home" tiles={run.tiles} />
        ) : (
          <HubFeatureTiles key={run.tiles[0].key} features={run.tiles} />
        ),
      )}
    </View>
  );
}
