import React from "react";
import { ScrollView, StatusBar, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HubFeatureTiles } from "../../components/HubFeatureTiles";
import { PromoBanners } from "../../components/PromoBanners";
import { ScreenHeader } from "../../components/ScreenHeader";
import { useAppConfig } from "../../components/app-config";
import { genZLabel, useGenZMode } from "../../components/genz-mode";
import { useTheme } from "../../components/theme";
import { hubTilesFor } from "../../lib/appConfig";
import { useViewer } from "../../hooks/useViewer";

/**
 * "Explore" hub — the lighter-weight, browse-anytime destinations (forest,
 * blogs, videos, partner sync, habits, buddy). Reached from Home's
 * "Explore" entry card (see (dashboard)/home.tsx). Tiles come from the App
 * CMS (lib/appConfig.ts); the defaults are the original grid.
 */
export default function ExploreHub() {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const features = hubTilesFor(config, "explore_hub", viewer);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title={genZLabel("Explore", genZModeEnabled)} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Community, content, and everything to explore beyond tracking.
          </Text>

          <PromoBanners placement="explore_hub" style={{ marginBottom: 14 }} />

          {features.length > 0 ? (
            <HubFeatureTiles features={features} />
          ) : (
            <Text className="mx-6" style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body }}>
              Nothing here right now — check back soon.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
