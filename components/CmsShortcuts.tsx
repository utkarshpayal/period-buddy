import React from "react";
import { Text, View } from "react-native";
import { useAppConfig } from "./app-config";
import { HubFeatureTiles } from "./HubFeatureTiles";
import { useTheme } from "./theme";
import { useViewer } from "../hooks/useViewer";
import { hubTilesFor } from "../lib/appConfig";

/**
 * Features and link tiles the App CMS moved onto Home or Profile (placement
 * "home" / "profile"), under a small heading. Renders nothing when the CMS
 * put nothing there, which is the default.
 */
export function CmsShortcuts({ placement, title = "Shortcuts", style }: { placement: "home" | "profile"; title?: string; style?: object }) {
  const { colors, fonts } = useTheme();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const tiles = hubTilesFor(config, placement, viewer);
  if (tiles.length === 0) return null;

  return (
    <View style={style}>
      <View className="mx-6 mb-2.5 flex-row items-center" style={{ gap: 7 }}>
        <View style={{ width: 5, height: 14, borderRadius: 3, backgroundColor: colors.accent }} />
        <Text style={{ fontSize: 14.5, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}>{title}</Text>
      </View>
      <HubFeatureTiles features={tiles} />
    </View>
  );
}
