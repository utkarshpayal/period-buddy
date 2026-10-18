import React from "react";
import { ScrollView, StatusBar, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EmptyState } from "./EmptyState";
import { HubHero, HubTileGrid, HubTileList } from "./HubFeatureTiles";
import { PromoBanners } from "./PromoBanners";
import { ScreenHeader, SectionHeader } from "./ScreenHeader";
import { useAppConfig } from "./app-config";
import { genZLabel, useGenZMode } from "./genz-mode";
import { useTheme } from "./theme";
import { HubSectionKey, hubTilesFor, sectionText, shownSections } from "../lib/appConfig";
import { arrangeHub } from "../lib/hubLayout";
import { useViewer } from "../hooks/useViewer";

/**
 * The body shared by the three hub screens (care-hub, wellness-hub,
 * explore-hub): the intro as the header's subtitle, the hub's promo banners
 * and its feature tiles. Which tiles show comes from the App CMS, and so does
 * the order of the banners and tiles, who sees the intro and banners and
 * when, and the hub's title and intro text (lib/appConfig.ts
 * `screenSections`, `screenTitles`). lib/hubLayout.ts groups the tiles into
 * a hero card and titled sections.
 */
export function HubScreen({
  placement,
  title,
  intro,
}: {
  placement: "care_hub" | "wellness_hub" | "explore_hub";
  title: string;
  /** One short line; shown under the title. */
  intro: string;
}) {
  const { colors, isDark } = useTheme();
  const { enabled: genZModeEnabled } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const features = hubTilesFor(config, placement, viewer);
  const sections = shownSections(config, placement, viewer);
  const { hero, sections: tileSections } = arrangeHub(placement, features);
  // An admin's title is shown as written; only the app's own gets the Gen Z swap.
  const customTitle = config.screenTitles[placement];
  const showIntro = sections.some((s) => s.key === "intro");

  const blocks: Record<HubSectionKey, React.ReactNode> = {
    // Drawn in the header instead (below).
    intro: null,
    promo: <PromoBanners placement={placement} />,
    tiles:
      features.length > 0 ? (
        <View style={{ gap: 28 }}>
          {hero ? <HubHero tile={hero} /> : null}
          {tileSections.map((section, i) => (
            // An untitled section straight after the hero sits close under it.
            <View key={section.id} style={i === 0 && hero && !section.title ? { marginTop: -16 } : undefined}>
              {section.title ? (
                <SectionHeader title={genZLabel(section.title, genZModeEnabled)} style={{ marginHorizontal: 24 }} />
              ) : null}
              {section.style === "list" ? <HubTileList tiles={section.tiles} /> : <HubTileGrid tiles={section.tiles} />}
            </View>
          ))}
        </View>
      ) : (
        <EmptyState compact icon="view-grid-outline" title="Nothing here yet" message="New features will show up here. Check back soon." />
      ),
  };

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader
          title={customTitle ?? genZLabel(title, genZModeEnabled)}
          subtitle={showIntro ? sectionText(sections, "intro", intro) : undefined}
          subtitleLines={2}
        />

        {/* "handled": the Nura AI hero's send button works on the first tap while the keyboard is up. */}
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 12, paddingBottom: 48, gap: 20 }}>
          {sections.map((s) => (blocks[s.key] ? <React.Fragment key={s.key}>{blocks[s.key]}</React.Fragment> : null))}
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
