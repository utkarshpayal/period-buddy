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
 * "Wellness & Support" hub — health concerns, private Q&A, hygiene guidance,
 * and sexual wellbeing. Reached from Home's "Wellness & Support" entry card
 * (see (dashboard)/home.tsx).
 *
 * Most-used-first: by default Nura AI and Health Concerns are "large"
 * full-width rows and the lower-frequency tiles sit in a "More support"
 * grid below (docs/fixes.md 2.7). The App CMS (lib/appConfig.ts) can
 * reorder, resize, hide or move any of them.
 */
export default function WellnessHub() {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const features = hubTilesFor(config, "wellness_hub", viewer);

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title={genZLabel("Wellness & Support", genZModeEnabled)} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          <Text
            className="mx-6 mt-2 mb-5"
            style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}
          >
            Support for your body and mind — private, judgment-free, and always here.
          </Text>

          <PromoBanners placement="wellness_hub" style={{ marginBottom: 14 }} />

          {features.length > 0 ? (
            <HubFeatureTiles features={features} smallHeading={"More support"} />
          ) : (
            <Text className="mx-6" style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
              Nothing here right now — check back soon.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
