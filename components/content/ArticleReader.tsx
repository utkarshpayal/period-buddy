import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, type ScrollViewProps } from "react-native";
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Markdown from "react-native-markdown-display";
import type { Language, LanguageCode, MedicalReview } from "../../lib/api";
import { formatReviewDate } from "../../lib/medicalReview";
import { FilterChips } from "../FilterChips";
import { MedicalReviewBadge } from "../MedicalReviewBadge";
import { HeaderIconButton } from "../ScreenHeader";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { MediaCover, type MediaTone } from "./MediaTile";
import { Icon } from "../Icon";
import { motion } from "../motion";
import { Button } from "../Button";

const GUTTER = 24;

export type ArticleReaderProps = {
  title: string;
  author?: string;
  readTime?: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  imageUrl?: string | null;
  categoryLabel?: string;
  tone: MediaTone;
  review?: MedicalReview | null;
  /** Full markdown body; null while loading or when only the summary is known. */
  content?: string | null;
  summary?: string;
  loading?: boolean;
  onClose: () => void;

  saved: boolean;
  onToggleSave: () => void;
  onShare: () => void;

  listening: boolean;
  preparingAudio: boolean;
  onListen: () => void;

  languages: Language[];
  language: LanguageCode;
  onSelectLanguage: (code: LanguageCode) => void;
  translating: boolean;
  /** True when the body shown is a translation (enables "Show original"). */
  translated: boolean;

  /** Scroll/touch handlers for the read timer (owned by the screen). */
  scrollProps?: Pick<ScrollViewProps, "onScroll" | "onLayout" | "onContentSizeChange" | "onTouchStart" | "scrollEventThrottle">;
};

/**
 * The article reading view: hero (16:9) → title → meta → medical-review
 * badge → body → updated date → one-line disclaimer. The actions never need
 * a scroll: Save and Share sit in the top bar, Listen and the language
 * picker in a bar pinned to the bottom, with a reading-progress line under
 * the top bar. Purely presentational: the screen owns fetching, bookmarks,
 * translation and text-to-speech.
 */
export function ArticleReader(props: ArticleReaderProps) {
  const {
    title,
    author,
    readTime,
    publishedAt,
    updatedAt,
    imageUrl,
    categoryLabel,
    tone,
    review,
    content,
    summary,
    loading,
    onClose,
    saved,
    onToggleSave,
    onShare,
    listening,
    preparingAudio,
    onListen,
    languages,
    language,
    onSelectLanguage,
    translating,
    translated,
    scrollProps,
  } = props;
  const { colors, fonts } = useTheme();

  const published = formatReviewDate(publishedAt);
  const updated = formatReviewDate(updatedAt);
  const meta = [author, readTime, published].filter(Boolean).join(" · ");
  const languageLabel = languages.find((l) => l.code === language)?.label ?? "English";
  const [languagesOpen, setLanguagesOpen] = useState(false);

  // Reading progress (0–1), on the UI thread so scrolling never re-renders the body.
  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({ width: `${Math.round(progress.value * 100)}%` }));
  const onScroll: ScrollViewProps["onScroll"] = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const scrollable = contentSize.height - layoutMeasurement.height;
    progress.value = scrollable > 0 ? Math.min(1, Math.max(0, contentOffset.y / scrollable)) : 1;
    scrollProps?.onScroll?.(e);
  };

  // Stable between renders: a new object makes Markdown re-parse the whole article.
  const markdownStyles = useMemo(() => ({
    body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 16, lineHeight: 26, fontWeight: "400" as const },
    paragraph: { marginTop: 0, marginBottom: 14 },
    heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 22, lineHeight: 29, fontWeight: "800" as const, marginTop: 24, marginBottom: 10 },
    heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 18, lineHeight: 25, fontWeight: "700" as const, marginTop: 24, marginBottom: 8 },
    heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 16, lineHeight: 23, fontWeight: "700" as const, marginTop: 18, marginBottom: 6 },
    heading4: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 16, lineHeight: 23, fontWeight: "700" as const, marginTop: 14, marginBottom: 6 },
    strong: { fontWeight: "700" as const },
    em: { fontStyle: "italic" as const },
    bullet_list: { marginBottom: 14 },
    ordered_list: { marginBottom: 14 },
    list_item: { marginBottom: 6 },
    bullet_list_icon: { color: colors.primaryDark, fontWeight: "800" as const, marginLeft: 2, marginRight: 10 },
    ordered_list_icon: { color: colors.primaryDark, fontWeight: "700" as const, marginRight: 8 },
    link: { color: colors.primaryDark, fontWeight: "600" as const, textDecorationLine: "underline" as const },
    blockquote: {
      backgroundColor: colors.surfaceSoft,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginVertical: 8,
      marginLeft: 0,
    },
    hr: { backgroundColor: colors.border, height: 1, marginVertical: 18 },
    code_inline: { backgroundColor: colors.surfaceSoft, color: colors.foreground, borderRadius: 4, paddingHorizontal: 4 },
    table: { borderColor: colors.border },
    tr: { borderColor: colors.border },
  }), [colors, fonts]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="flex-row items-center" style={{ paddingHorizontal: GUTTER, paddingTop: 8, paddingBottom: 10, gap: 10 }}>
        <HeaderIconButton icon="close" accessibilityLabel="Close article" onPress={onClose} />
        <View style={{ flex: 1 }} />
        <HeaderIconButton
          icon={saved ? "bookmark" : "bookmark-outline"}
          accessibilityLabel={saved ? "Saved. Tap to remove" : "Save article"}
          onPress={onToggleSave}
        />
        <HeaderIconButton icon="share-social-outline" accessibilityLabel="Share article" onPress={onShare} />
      </View>
      {/* Reading progress */}
      <View style={{ height: 3, backgroundColor: colors.border }} importantForAccessibility="no-hide-descendants">
        <Animated.View style={[{ height: 3, backgroundColor: colors.primary, borderTopRightRadius: 2, borderBottomRightRadius: 2 }, progressStyle]} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        scrollEventThrottle={16}
        {...scrollProps}
        onScroll={onScroll}
      >
        <View style={{ paddingHorizontal: GUTTER, paddingTop: 4 }}>
          <View style={{ borderRadius: 24, borderCurve: "continuous", overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
            <MediaCover imageUrl={imageUrl} tone={tone} aspectRatio={16 / 9} iconSize={44} />
          </View>

          {categoryLabel ? (
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ marginTop: 20, color: tone.fg, fontSize: 11.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase", fontFamily: fonts.body }}
            >
              {categoryLabel}
            </Text>
          ) : null}
          <Text
            accessibilityRole="header"
            style={{
              marginTop: categoryLabel ? 6 : 20,
              color: colors.foreground,
              fontSize: 24,
              lineHeight: 31,
              fontWeight: "800",
              letterSpacing: -0.2,
              fontFamily: fonts.heading,
            }}
          >
            {title}
          </Text>
          {meta ? (
            <Text style={{ marginTop: 8, color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: "500", fontFamily: fonts.body }}>
              {meta}
            </Text>
          ) : null}
          <MedicalReviewBadge item={review} style={{ marginTop: 12 }} />

          {translated ? (
            <View className="flex-row items-center flex-wrap" style={{ marginTop: 16, gap: 6 }}>
              <Icon set="ion" name="language-outline" size={16} color={colors.mutedText} />
              <Text style={{ color: colors.mutedText, fontSize: 13, fontWeight: "500", fontFamily: fonts.body }}>
                Showing {languageLabel}
              </Text>
              <TouchableOpacity
                onPress={() => onSelectLanguage("en-IN")}
                accessibilityRole="button"
                accessibilityLabel="Show original"
                hitSlop={12}
              >
                <Text style={{ color: colors.primaryDark, fontSize: 13, fontWeight: "700", textDecorationLine: "underline", fontFamily: fonts.body }}>
                  Show original
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ marginTop: 20 }}>
            {loading ? (
              <View style={{ gap: 12 }} accessibilityLabel="Loading article">
                <SkeletonBlock width="100%" height={14} />
                <SkeletonBlock width="96%" height={14} />
                <SkeletonBlock width="88%" height={14} />
                <SkeletonBlock width="100%" height={14} />
                <SkeletonBlock width="70%" height={14} />
                <SkeletonBlock width="94%" height={14} style={{ marginTop: 14 }} />
                <SkeletonBlock width="82%" height={14} />
              </View>
            ) : content ? (
              <Markdown style={markdownStyles}>{content}</Markdown>
            ) : summary ? (
              <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 26, fontWeight: "400", fontFamily: fonts.body }}>{summary}</Text>
            ) : null}
          </View>

          {updated && updated !== published ? (
            <Text style={{ marginTop: 10, color: colors.mutedText, fontSize: 13, fontWeight: "500", fontFamily: fonts.body }}>
              Last updated {updated}
            </Text>
          ) : null}

          <Text style={{ marginTop: 14, color: colors.mutedText, fontSize: 13, lineHeight: 19, fontWeight: "400", fontFamily: fonts.body }}>
            This is general information, not a diagnosis. If something worries you, talk to a doctor.
          </Text>

        </View>
      </ScrollView>

      {/* Pinned bottom bar: Listen + language, always in reach */}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
        {languagesOpen && languages.length > 1 ? (
          <Animated.View entering={FadeInDown.duration(motion.duration.fast)} exiting={FadeOutDown.duration(motion.duration.fast)} style={{ paddingTop: 12 }}>
            <View className="flex-row items-center" style={{ paddingHorizontal: GUTTER, marginBottom: 10, gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", fontFamily: fonts.body }}>Read in</Text>
              {translated && !translating ? (
                <TouchableOpacity onPress={() => onSelectLanguage("en-IN")} accessibilityRole="button" accessibilityLabel="Show original" hitSlop={12}>
                  <Text style={{ color: colors.primaryDark, fontSize: 13, fontWeight: "700", textDecorationLine: "underline", fontFamily: fonts.body }}>
                    Show original
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <FilterChips
              options={languages.map((l) => ({ key: l.code, label: l.label }))}
              value={language}
              onChange={(code) => {
                if (translating) return;
                onSelectLanguage(code);
                setLanguagesOpen(false);
              }}
              gutter={GUTTER}
            />
          </Animated.View>
        ) : null}

        <View className="flex-row items-center" style={{ paddingHorizontal: GUTTER, paddingTop: 10, paddingBottom: 10, gap: 10 }}>
          <Button
            label={preparingAudio ? "Getting audio ready…" : listening ? "Stop listening" : "Listen"}
            icon={listening ? "stop" : "play"}
            variant={listening ? "tonal" : "primary"}
            size="md"
            onPress={onListen}
            loading={preparingAudio}
            accessibilityLabel={listening ? "Stop listening" : `Listen in ${languageLabel}`}
            style={{ flex: 1 }}
          />

          {languages.length > 1 ? (
            <TouchableOpacity
              onPress={() => setLanguagesOpen((v) => !v)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Language: ${languageLabel}. Change language`}
              accessibilityState={{ expanded: languagesOpen, busy: translating }}
              style={{
                height: 48,
                paddingHorizontal: 14,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: languagesOpen ? colors.primary : colors.border,
                backgroundColor: colors.surface,
              }}
            >
              {translating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Icon set="ion" name="language-outline" size={18} color={colors.foreground} />
              )}
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ maxWidth: 96, fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {translating ? "Translating…" : languageLabel}
              </Text>
              <Icon set="ion" name={languagesOpen ? "chevron-down" : "chevron-up"} size={16} color={colors.mutedText} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}
