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
 * "Care & Insights" hub — everything data-driven about the user's cycle that
 * isn't the day-to-day tracker itself: forecasts, personalized insights,
 * symptom trends, the screener, and booking a consult. Reached from Home's
 * "Care & Insights" entry card (see (dashboard)/home.tsx).
 *
 * Which tiles show here, in what order and how, comes from the App CMS
 * (lib/appConfig.ts); the defaults reproduce the original hard-coded grid.
 */
export default function CareHub() {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const features = hubTilesFor(config, "care_hub", viewer);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title={genZLabel("Care & Insights", genZModeEnabled)} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 12.5, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Your forecasts, personalized insights, and everything to check in on your health.
          </Text>

          <PromoBanners placement="care_hub" style={{ marginBottom: 14 }} />

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
