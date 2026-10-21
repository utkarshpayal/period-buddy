import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useAppConfig } from "./app-config";
import { reportImpressions } from "./PromoBanners";
import { useTheme } from "./theme";
import { useViewer } from "../hooks/useViewer";
import { appConfigApi } from "../lib/api";
import { PromoBanner, bannersFor } from "../lib/appConfig";
import { runTapAction } from "../lib/tapAction";
import { Icon } from "./Icon";
import { motion } from "./motion";
import { Button } from "./Button";

// A beat after Home settles, so it never lands on top of the first paint
// or a permission prompt.
const SHOW_DELAY_MS = 1200;

/**
 * Blinkit-style pop-up: the highest-priority "popup" banner from the App CMS
 * that this device hasn't seen, shown once over Home. Seeing it (closing or
 * tapping) marks it dismissed on this device, so it never shows again; a
 * new campaign is a new banner. Uses its own Modal rather than
 * AppModalHost because the host only renders alert/permission layouts.
 */
export function PromoPopup() {
  const { config, dismissedBanners, dismissBanner } = useAppConfig();
  const viewer = useViewer();
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const [banner, setBanner] = useState<PromoBanner | null>(null);

  const next = bannersFor(config, "popup", dismissedBanners, viewer)[0] ?? null;
  const nextId = next?.id ?? null;

  useFocusEffect(
    useCallback(() => {
      if (!next) return undefined;
      const timer = setTimeout(() => {
        setBanner(next);
        reportImpressions([next.id]);
      }, SHOW_DELAY_MS);
      // Leaving Home before it shows cancels it; it tries again next visit.
      return () => clearTimeout(timer);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nextId])
  );

  const close = () => {
    if (banner) dismissBanner(banner.id);
    setBanner(null);
  };

  const onPress = () => {
    if (!banner) return;
    const current = banner;
    close();
    appConfigApi.trackBannerClick(current.id).catch(() => undefined);
    runTapAction(current.action, router);
  };

  if (!banner) return null;
  const bg = banner.backgroundColor ?? colors.surface;
  const fg = banner.textColor ?? colors.foreground;
  const tappable = banner.action.type !== "none";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 28 }}>
        <Pressable
          onPress={() => undefined}
          style={{ width: "100%", maxWidth: 380, backgroundColor: bg, borderRadius: 28, borderCurve: "continuous", overflow: "hidden" }}
          accessibilityViewIsModal
        >
          {banner.imageUrl ? (
            <Image transition={motion.duration.base} source={{ uri: banner.imageUrl }} style={{ width: "100%", aspectRatio: banner.layout === "image" ? 0.8 : 1.6 }} contentFit="cover" />
          ) : null}
          {banner.layout !== "image" ? (
            <View style={{ padding: 22 }}>
              <Text style={{ color: fg, fontSize: 20, fontWeight: "800", fontFamily: fonts.heading, lineHeight: 26 }}>{banner.title}</Text>
              {banner.subtitle ? (
                <Text style={{ color: fg, opacity: 0.85, fontSize: 13.5, marginTop: 6, fontFamily: fonts.body, lineHeight: 19 }}>{banner.subtitle}</Text>
              ) : null}
            </View>
          ) : null}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 22, paddingBottom: 20, paddingTop: banner.layout === "image" ? 16 : 0 }}>
            <Button label={tappable ? "Not now" : "Close"} variant="neutral" size="md" onPress={close} style={{ flex: 1 }} />
            {tappable ? <Button label={banner.ctaLabel ?? "Open"} size="md" onPress={onPress} style={{ flex: 1.4 }} /> : null}
          </View>
          <TouchableOpacity
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ position: "absolute", top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" }}
          >
            <Icon set="ion" name="close" size={16} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
