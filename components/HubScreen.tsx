import React from "react";
import { ScrollView, StatusBar, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { HubFeatureTiles } from "./HubFeatureTiles";
import { PromoBanners } from "./PromoBanners";
import { ScreenHeader } from "./ScreenHeader";
import { useAppConfig } from "./app-config";
import { genZLabel, useGenZMode } from "./genz-mode";
import { useTheme } from "./theme";
import { HubSectionKey, hubTilesFor, sectionText, shownSections } from "../lib/appConfig";
import { useViewer } from "../hooks/useViewer";

/**
 * The body shared by the three hub screens (care-hub, wellness-hub,
 * explore-hub): an intro line, the hub's promo banners and its feature
 * tiles. Which tiles show comes from the App CMS, and so does the order of
 * these three blocks, who sees the intro and banners and when, and the
 * hub's title and intro text (lib/appConfig.ts `screenSections`, `screenTitles`).
 */
export function HubScreen({
  placement,
  title,
  intro,
  smallHeading,
}: {
  placement: "care_hub" | "wellness_hub" | "explore_hub";
  title: string;
  intro: string;
  smallHeading?: string;
}) {
  const { colors, isDark, fonts } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const features = hubTilesFor(config, placement, viewer);
  const sections = shownSections(config, placement, viewer);
  // An admin's title is shown as written; only the app's own gets the Gen Z swap.
  const customTitle = config.screenTitles[placement];

  const blocks: Record<HubSectionKey, React.ReactNode> = {
    intro: (
      <Text className="mx-6" style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, lineHeight: 18 }}>
        {sectionText(sections, "intro", intro)}
      </Text>
    ),
    promo: <PromoBanners placement={placement} />,
    tiles:
      features.length > 0 ? (
        <HubFeatureTiles features={features} smallHeading={smallHeading} />
      ) : (
        <Text className="mx-6" style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
          Nothing here right now — check back soon.
        </Text>
      ),
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title={customTitle ?? genZLabel(title, genZModeEnabled)} />

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 8, paddingBottom: 48, gap: 16 }}>
          {sections.map((s) => (
            <React.Fragment key={s.key}>{blocks[s.key]}</React.Fragment>
          ))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
