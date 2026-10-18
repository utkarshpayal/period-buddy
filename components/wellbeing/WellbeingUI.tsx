import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Linking, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { SkeletonBlock } from "../Skeleton";
import { useTheme, type ThemeColors } from "../theme";
import { getShadow } from "../ui-tokens";

/**
 * Shared building blocks for the wellbeing screens (health-issues, hygiene,
 * sexual-wellbeing): tinted icon circles, an intro card, readable article
 * rows, key-point lists, media buttons, a consult nudge, loading skeletons
 * and the privacy note. One look across all three, instead of each screen
 * hand-rolling its own card sizes and icon squares.
 */

export type WellbeingTone = { fg: string; bg: string };

/**
 * Text-safe foreground + pale wash pairs. `accentText`, not `accent`: the
 * mint accent is too pale to read as an icon colour on white.
 */
export function getWellbeingTones(colors: ThemeColors) {
  return {
    rose: { fg: colors.primaryDark, bg: colors.primaryLight },
    lavender: { fg: colors.secondary, bg: colors.secondaryLight },
    mint: { fg: colors.accentText, bg: colors.accentLight },
    amber: { fg: colors.warning, bg: colors.warningLight },
    sky: { fg: colors.sky, bg: colors.skyLight },
    green: { fg: colors.success, bg: colors.successLight },
    gold: { fg: colors.gold, bg: colors.goldLight },
    red: { fg: colors.danger, bg: colors.dangerLight },
  } satisfies Record<string, WellbeingTone>;
}

export type WellbeingToneKey = keyof ReturnType<typeof getWellbeingTones>;

/** Cycles through the tones so neighbouring rows never share a colour. */
export const TONE_ROTATION: WellbeingToneKey[] = ["rose", "lavender", "mint", "amber", "sky", "green"];

type IconFamily = "ion" | "mci" | "feather";

/**
 * CMS/back-end resources send a bare icon name with no family. Try Ionicons
 * first (what the CMS uses), then MaterialCommunityIcons, then Feather, so a
 * name from any of them still draws instead of a "?" glyph.
 */
export function resolveIcon(name: string | undefined, fallback = "sparkles-outline"): { family: IconFamily; name: string } {
  if (name) {
    if (name in Ionicons.glyphMap) return { family: "ion", name };
    if (name in MaterialCommunityIcons.glyphMap) return { family: "mci", name };
    if (name in Feather.glyphMap) return { family: "feather", name };
  }
  return { family: "ion", name: fallback };
}

export function WellbeingGlyph({ name, size, color, fallback }: { name: string | undefined; size: number; color: string; fallback?: string }) {
  const icon = resolveIcon(name, fallback);
  if (icon.family === "mci") return <MaterialCommunityIcons name={icon.name as any} size={size} color={color} />;
  if (icon.family === "feather") return <Feather name={icon.name as any} size={size - 2} color={color} />;
  return <Ionicons name={icon.name as any} size={size} color={color} />;
}

/** Round, tinted icon badge used for every wellbeing row/card. */
export function IconCircle({
  icon,
  tone,
  size = 44,
  fallback,
  solid = false,
}: {
  icon: string | undefined;
  tone: WellbeingTone;
  size?: number;
  fallback?: string;
  /** Solid fill with a white glyph, for a selected state. */
  solid?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: solid ? tone.fg : tone.bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <WellbeingGlyph name={icon} size={Math.round(size * 0.48)} color={solid ? colors.surface : tone.fg} fallback={fallback} />
    </View>
  );
}

/** White card with the app's soft shadow. */
export function WellbeingCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: 22,
          borderWidth: isDark ? 0 : 1,
          borderColor: colors.border,
          ...getShadow(colors, isDark),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Tinted intro card at the top of a wellbeing screen: icon, one-line title, short body, optional chips. */
export function WellbeingIntro({
  icon,
  tone,
  title,
  body,
  chips,
}: {
  icon: string;
  tone: WellbeingTone;
  title: string;
  body: string;
  chips?: { icon: string; label: string }[];
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 24, padding: 18 }}>
      <View className="flex-row items-center" style={{ gap: 14 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
          <WellbeingGlyph name={icon} size={26} color={tone.fg} />
        </View>
        <View className="flex-1">
          <Text
            numberOfLines={2}
            maxFontSizeMultiplier={1.3}
            style={{ color: colors.foreground, fontSize: 17, lineHeight: 23, fontWeight: "800", letterSpacing: -0.2, fontFamily: fonts.heading }}
          >
            {title}
          </Text>
          <Text style={{ color: colors.foreground, opacity: 0.75, fontSize: 13, lineHeight: 19, marginTop: 2, fontFamily: fonts.body }}>
            {body}
          </Text>
        </View>
      </View>
      {chips && chips.length > 0 ? (
        <View className="flex-row flex-wrap" style={{ gap: 8, marginTop: 14 }}>
          {chips.map((chip) => (
            <View
              key={chip.label}
              className="flex-row items-center"
              style={{ gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: colors.surface }}
            >
              <WellbeingGlyph name={chip.icon} size={13} color={tone.fg} />
              <Text maxFontSizeMultiplier={1.3} style={{ color: colors.foreground, fontSize: 12, fontWeight: "700", fontFamily: fonts.body }}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Small rounded meta pill: "5 min read", "3 key points", "Video". */
export function MetaPill({ icon, label }: { icon: string; label: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-center" style={{ gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceSoft }}>
      <WellbeingGlyph name={icon} size={12} color={colors.mutedText} />
      <Text maxFontSizeMultiplier={1.3} style={{ color: colors.mutedText, fontSize: 12, fontWeight: "600", fontFamily: fonts.body }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One readable article/resource row: icon circle, title, two-line summary,
 * meta pills, chevron. Meant to sit inside a WellbeingCard list with
 * dividers (pass `first` for the top row).
 */
export function ArticleRow({
  icon,
  tone,
  eyebrow,
  title,
  summary,
  meta,
  onPress,
  first,
  fallbackIcon,
}: {
  icon: string | undefined;
  tone: WellbeingTone;
  eyebrow?: string;
  title: string;
  summary?: string;
  meta?: { icon: string; label: string }[];
  onPress: () => void;
  first?: boolean;
  fallbackIcon?: string;
}) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[eyebrow, title, summary].filter(Boolean).join(". ")}
      className="flex-row"
      style={{ gap: 14, paddingHorizontal: 16, paddingVertical: 16 }}
    >
      {!first ? <View style={{ position: "absolute", top: 0, left: 74, right: 0, height: 1, backgroundColor: colors.border }} /> : null}
      <IconCircle icon={icon} tone={tone} size={44} fallback={fallbackIcon} />
      <View className="flex-1" style={{ minWidth: 0 }}>
        {eyebrow ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
            style={{ color: tone.fg, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body, marginBottom: 2 }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Text
          numberOfLines={2}
          maxFontSizeMultiplier={1.4}
          style={{ flexShrink: 1, color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "700", fontFamily: fonts.heading }}
        >
          {title}
        </Text>
        {summary ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 19, marginTop: 3, fontFamily: fonts.body }}>
            {summary}
          </Text>
        ) : null}
        {meta && meta.length > 0 ? (
          <View className="flex-row flex-wrap" style={{ gap: 6, marginTop: 10 }}>
            {meta.map((m) => (
              <MetaPill key={m.label} icon={m.icon} label={m.label} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ justifyContent: "center" }}>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedText} />
      </View>
    </TouchableOpacity>
  );
}

/** Uppercase label + content block used inside article detail sheets. */
export function DetailSection({
  icon,
  tone,
  title,
  children,
  style,
}: {
  icon: string;
  tone: WellbeingTone;
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts } = useTheme();
  return (
    <View style={[{ marginTop: 24 }, style]}>
      <View className="flex-row items-center" style={{ gap: 10, marginBottom: 12 }}>
        <IconCircle icon={icon} tone={tone} size={30} />
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", fontFamily: fonts.heading }}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

/** Check-marked list in a card, one hairline between items. */
export function KeyPointList({ points, tone }: { points: string[]; tone?: WellbeingTone }) {
  const { colors, fonts } = useTheme();
  const check = tone ?? { fg: colors.success, bg: colors.successLight };
  return (
    <WellbeingCard style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
      {points.map((point, idx) => (
        <View
          key={idx}
          className="flex-row items-start"
          style={{ gap: 12, paddingVertical: 14, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}
        >
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: check.bg, alignItems: "center", justifyContent: "center", marginTop: 1 }}>
            <Ionicons name="checkmark" size={14} color={check.fg} />
          </View>
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 14.5, lineHeight: 22, fontFamily: fonts.body }}>{point}</Text>
        </View>
      ))}
    </WellbeingCard>
  );
}

/** Bulleted list without a card, for compact detail blocks (symptoms, causes). */
export function BulletList({ items, color }: { items: string[]; color: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {items.map((item, idx) => (
        <View key={idx} className="flex-row items-start" style={{ gap: 10 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, marginTop: 8 }} />
          <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

/** Watch / Listen buttons for a resource with media links. Renders nothing without any. */
export function MediaButtons({ videoUrl, audioUrl, style }: { videoUrl?: string; audioUrl?: string; style?: StyleProp<ViewStyle> }) {
  const { colors, fonts } = useTheme();
  if (!videoUrl && !audioUrl) return null;
  const button = (icon: "play-circle" | "headset", label: string, url: string) => (
    <TouchableOpacity
      key={label}
      activeOpacity={0.8}
      onPress={() => Linking.openURL(url).catch(() => {})}
      accessibilityRole="link"
      accessibilityLabel={label}
      className="flex-1 flex-row items-center justify-center"
      style={{ height: 46, borderRadius: 23, gap: 8, backgroundColor: colors.primaryLight }}
    >
      <Ionicons name={icon} size={18} color={colors.primaryDark} />
      <Text style={{ color: colors.primaryDark, fontSize: 14, fontWeight: "800", fontFamily: fonts.body }}>{label}</Text>
    </TouchableOpacity>
  );
  return (
    <View className="flex-row" style={[{ gap: 10 }, style]}>
      {videoUrl ? button("play-circle", "Watch", videoUrl) : null}
      {audioUrl ? button("headset", "Listen", audioUrl) : null}
    </View>
  );
}

/** "Talk to a gynecologist" nudge card with a Consult button. */
export function ConsultNudge({ title, body, onPress, style }: { title: string; body: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors, fonts } = useTheme();
  const tone = getWellbeingTones(colors).rose;
  return (
    <WellbeingCard style={[{ padding: 16 }, style]}>
      <View className="flex-row items-center" style={{ gap: 14 }}>
        <IconCircle icon="medical-outline" tone={tone} size={44} />
        <View className="flex-1">
          <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ color: colors.foreground, fontSize: 15, lineHeight: 21, fontWeight: "700", fontFamily: fonts.heading }}>
            {title}
          </Text>
          <Text maxFontSizeMultiplier={1.4} style={{ color: colors.mutedText, fontSize: 13, lineHeight: 18, marginTop: 2, fontFamily: fonts.body }}>
            {body}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        className="flex-row items-center justify-center"
        style={{ marginTop: 14, height: 46, borderRadius: 23, backgroundColor: colors.primary, gap: 8 }}
      >
        <Ionicons name="chatbubbles-outline" size={17} color={colors.buttonText} />
        <Text style={{ color: colors.buttonText, fontSize: 14.5, fontWeight: "800", fontFamily: fonts.body }}>Talk to a gynecologist</Text>
      </TouchableOpacity>
    </WellbeingCard>
  );
}

/** Lock icon + one line: private, general guidance, not a diagnosis. */
export function PrivacyNote({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-start" style={[{ gap: 10, paddingHorizontal: 4 }, style]}>
      <Ionicons name="lock-closed-outline" size={15} color={colors.mutedText} style={{ marginTop: 2 }} />
      <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}

/** Placeholder for a WellbeingCard of ArticleRows while content loads. */
export function ArticleListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <WellbeingCard>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} className="flex-row" style={{ gap: 14, padding: 16 }}>
          <SkeletonBlock width={44} height={44} radius={22} />
          <View className="flex-1" style={{ gap: 8 }}>
            <SkeletonBlock width="60%" height={14} />
            <SkeletonBlock width="95%" height={12} />
            <SkeletonBlock width="40%" height={12} />
          </View>
        </View>
      ))}
    </WellbeingCard>
  );
}

/** Inline empty state for a wellbeing list (loaded fine, nothing to show). */
export function WellbeingEmpty({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, fonts } = useTheme();
  const tone = getWellbeingTones(colors).lavender;
  return (
    <WellbeingCard style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 24 }}>
      <IconCircle icon={icon} tone={tone} size={56} />
      <Text style={{ marginTop: 14, color: colors.foreground, fontSize: 15.5, fontWeight: "700", textAlign: "center", fontFamily: fonts.heading }}>{title}</Text>
      {message ? (
        <Text style={{ marginTop: 4, color: colors.mutedText, fontSize: 13, lineHeight: 19, textAlign: "center", fontFamily: fonts.body }}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={{ marginTop: 14, paddingHorizontal: 18, height: 40, borderRadius: 20, justifyContent: "center", backgroundColor: colors.primaryLight }}
        >
          <Text style={{ color: colors.primaryDark, fontSize: 13.5, fontWeight: "800", fontFamily: fonts.body }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </WellbeingCard>
  );
}

/** Header row of an article detail sheet: icon circle, eyebrow, title, close button. */
export function DetailSheetHeader({
  icon,
  tone,
  eyebrow,
  title,
  onClose,
}: {
  icon: string | undefined;
  tone: WellbeingTone;
  eyebrow?: string;
  title: string;
  onClose: () => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  return (
    <View className="flex-row items-center" style={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 14, gap: 14 }}>
      <IconCircle icon={icon} tone={tone} size={48} />
      <View className="flex-1">
        {eyebrow ? (
          <Text numberOfLines={1} style={{ color: tone.fg, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body }}>
            {eyebrow}
          </Text>
        ) : null}
        <Text
          accessibilityRole="header"
          numberOfLines={2}
          style={{ color: colors.foreground, fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3, fontFamily: fonts.heading }}
        >
          {title}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        hitSlop={6}
        style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
      >
        <Ionicons name="close" size={20} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}
