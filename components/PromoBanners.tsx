import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useAppConfig } from "./app-config";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";
import { useViewer } from "../hooks/useViewer";
import { appConfigApi } from "../lib/api";
import { BannerPlacement, PromoBanner, bannersFor } from "../lib/appConfig";
import { runTapAction } from "../lib/tapAction";
import { useContentWidth } from "../lib/layout";

/*
 * Impressions for CTR in the CMS: each banner is reported once per app
 * session, batched so a screen with a carousel sends one small request.
 */
const reported = new Set<string>();
let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
export function reportImpressions(ids: string[]) {
  const fresh = ids.filter((id) => !reported.has(id));
  if (fresh.length === 0) return;
  fresh.forEach((id) => reported.add(id));
  pending.push(...fresh);
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    const batch = pending.slice(0, 20);
    pending = pending.slice(20);
    flushTimer = null;
    appConfigApi.trackBannerImpressions(batch).catch(() => undefined);
    if (pending.length) reportImpressions([]);
  }, 1500);
}

/**
 * Promo banners the App CMS placed at `placement` (Home's top/middle slots
 * or a hub screen). One banner is full width; several become a horizontal,
 * snapping carousel, highest priority first. Renders nothing when there are
 * none, so screens can drop it in unconditionally.
 *
 * Tap: see lib/tapAction.ts (in-app screen, website, or another app with a
 * fallback link); a fire-and-forget beacon bumps the banner's tap count.
 */
export function PromoBanners({ placement, style }: { placement: BannerPlacement; style?: object }) {
  const { config, dismissedBanners, dismissBanner } = useAppConfig();
  const viewer = useViewer();
  const width = useContentWidth();
  const banners = bannersFor(config, placement, dismissedBanners, viewer);
  const ids = banners.map((b) => b.id).join(",");
  useEffect(() => {
    if (ids) reportImpressions(ids.split(","));
  }, [ids]);
  if (banners.length === 0) return null;

  // Matches the screens' 24px (mx-6) gutter.
  const single = banners.length === 1;
  const cardWidth = single ? width - 48 : Math.min(340, width - 72);

  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEnabled={!single}
        snapToInterval={single ? undefined : cardWidth + 10}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 24, gap: 10 }}
      >
        {banners.map((b) => (
          <BannerCard key={b.id} banner={b} width={cardWidth} onDismiss={() => dismissBanner(b.id)} />
        ))}
      </ScrollView>
    </View>
  );
}

function BannerCard({ banner, width, onDismiss }: { banner: PromoBanner; width: number; onDismiss: () => void }) {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const bg = banner.backgroundColor ?? colors.primary;
  const fg = banner.textColor ?? colors.buttonText;
  const tappable = banner.action.type !== "none";

  const onPress = () => {
    if (!banner.action.value) return;
    appConfigApi.trackBannerClick(banner.id).catch(() => undefined);
    runTapAction(banner.action, router);
  };

  const close = banner.dismissible ? (
    <TouchableOpacity
      onPress={onDismiss}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Hide this banner"
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "rgba(0,0,0,0.18)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="close" size={13} color="#fff" />
    </TouchableOpacity>
  ) : null;

  const a11y = {
    accessibilityRole: tappable ? ("button" as const) : undefined,
    accessibilityLabel: [banner.title, banner.subtitle, banner.ctaLabel].filter(Boolean).join(". "),
  };

  if (banner.layout === "image" && banner.imageUrl) {
    return (
      <TouchableOpacity activeOpacity={tappable ? 0.9 : 1} disabled={!tappable} onPress={onPress} {...a11y}
        style={{ width, borderRadius: 20, overflow: "hidden", ...getShadow(colors, isDark) }}>
        <Image source={{ uri: banner.imageUrl }} style={{ width, aspectRatio: 3 }} resizeMode="cover" />
        {close}
      </TouchableOpacity>
    );
  }

  if (banner.layout === "strip") {
    return (
      <TouchableOpacity activeOpacity={tappable ? 0.85 : 1} disabled={!tappable} onPress={onPress} {...a11y}
        style={{ width, backgroundColor: bg, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 14, paddingRight: banner.dismissible ? 36 : 14, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, color: fg, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }} numberOfLines={1}>
          {banner.title}
        </Text>
        {banner.ctaLabel && tappable ? (
          <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
            <Text style={{ color: fg, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }}>{banner.ctaLabel}</Text>
            <Ionicons name="arrow-forward" size={13} color={fg} style={{ marginLeft: 3 }} />
          </View>
        ) : null}
        {close}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity activeOpacity={tappable ? 0.88 : 1} disabled={!tappable} onPress={onPress} {...a11y}
      style={{ width, minHeight: 104, backgroundColor: bg, borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", ...getShadow(colors, isDark) }}>
      <View style={{ flex: 1, paddingRight: banner.imageUrl ? 10 : banner.dismissible ? 18 : 0 }}>
        <Text style={{ color: fg, fontSize: 15, fontWeight: "800", fontFamily: fonts.heading, lineHeight: 20 }} numberOfLines={2}>
          {banner.title}
        </Text>
        {banner.subtitle ? (
          <Text style={{ color: fg, opacity: 0.9, fontSize: 12, marginTop: 3, fontFamily: fonts.body, lineHeight: 16 }} numberOfLines={2}>
            {banner.subtitle}
          </Text>
        ) : null}
        {banner.ctaLabel && tappable ? (
          <View style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: fg, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 }}>
            <Text style={{ color: bg, fontSize: 12.5, fontWeight: "800", fontFamily: fonts.body }}>{banner.ctaLabel}</Text>
          </View>
        ) : null}
      </View>
      {banner.imageUrl ? (
        <Image source={{ uri: banner.imageUrl }} style={{ width: 86, height: 72, borderRadius: 14 }} resizeMode="cover" />
      ) : null}
      {close}
    </TouchableOpacity>
  );
}
