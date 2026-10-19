import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { MedicalDocument } from "../../lib/api";
import PressableFeedback from "../PressableFeedback";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { DOC_TYPE_META, extractionNote, formatDateLabel, formatFileSize } from "./documentMeta";
import { Icon } from "../Icon";

/** "PDF", "JPG", "PNG"… from the MIME type, for the small page badge. */
export function fileBadge(mimeType: string | undefined) {
  if (!mimeType) return "FILE";
  if (mimeType === "application/pdf") return "PDF";
  const sub = mimeType.split("/")[1]?.split(/[+;.-]/)[0]?.toUpperCase();
  if (sub === "JPEG") return "JPG";
  return sub && sub.length <= 4 ? sub : "FILE";
}

/**
 * The file's extension on a small tinted page, standing in for a thumbnail:
 * rose for PDFs, sky for photos, lavender for anything else (the app's soft tints).
 */
export function PageBadge({ label }: { label: string }) {
  const { colors, fonts } = useTheme();
  const tint =
    label === "PDF"
      ? { fg: colors.primaryDark, bg: colors.primaryLight }
      : label === "FILE"
        ? { fg: colors.secondary, bg: colors.secondaryLight }
        : { fg: colors.sky, bg: colors.skyLight };
  return (
    <View style={{ width: 36, height: 44, borderRadius: 10, borderTopRightRadius: 16, backgroundColor: tint.bg, justifyContent: "flex-end", alignItems: "center", paddingBottom: 7 }}>
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 10, fontWeight: "800", letterSpacing: 0.4, color: tint.fg, fontFamily: fonts.body }}>
        {label}
      </Text>
    </View>
  );
}

/**
 * One document row in a month's list: page badge, title, category · date ·
 * size, an optional reading note, and a ⋯ button. Tap opens it, long-press
 * or ⋯ opens the actions.
 */
export function DocumentCard({
  doc,
  divider,
  onOpen,
  onMore,
}: {
  doc: MedicalDocument;
  /** Hairline above the row (every row but a group's first). */
  divider: boolean;
  onOpen: (doc: MedicalDocument) => void;
  onMore: (doc: MedicalDocument) => void;
}) {
  const { colors, fonts } = useTheme();
  const meta = DOC_TYPE_META[doc.docType] ?? DOC_TYPE_META.other;
  const note = extractionNote(doc);
  const size = formatFileSize(doc.fileSize);
  const pending = doc.extractionStatus === "pending";
  const badge = fileBadge(doc.mimeType);

  return (
    <PressableFeedback
      onPress={() => onOpen(doc)}
      onLongPress={() => onMore(doc)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${doc.title}, ${badge}, ${meta.label}, ${formatDateLabel(doc.documentDate)}`}
      accessibilityHint="Opens the document. Long-press for more actions."
      // Rows highlight while held, like a native list.
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingLeft: 16,
        paddingRight: 4,
        backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
      })}
    >
      <PageBadge label={badge} />
      <View
        style={{
          flex: 1,
          minWidth: 0,
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          borderTopWidth: divider ? 1 : 0,
          borderColor: colors.track,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}
          >
            {doc.title}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
            {[meta.label, formatDateLabel(doc.documentDate), size].filter(Boolean).join(" · ")}
          </Text>
          {note ? (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={{ marginTop: 2, fontSize: 13, lineHeight: 18, color: pending ? colors.mutedText : colors.warning, fontFamily: fonts.body }}
            >
              {note}
            </Text>
          ) : null}
        </View>
        <TouchableOpacity
          onPress={() => onMore(doc)}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${doc.title}`}
          hitSlop={6}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Icon set="ion" name="ellipsis-horizontal" size={18} color={colors.mutedText} />
        </TouchableOpacity>
      </View>
    </PressableFeedback>
  );
}

/** Loading placeholder shaped like the rows above. */
export function DocumentListSkeleton({ count = 5 }: { count?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <View accessibilityLabel="Loading documents" style={{ borderRadius: 22, backgroundColor: colors.surface, borderWidth: isDark ? 1 : 0, borderColor: colors.border, ...getShadow(colors, isDark) }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingLeft: 16 }}>
          <SkeletonBlock width={36} height={44} radius={10} />
          <View style={{ flex: 1, gap: 8, paddingVertical: 18, borderTopWidth: i ? 1 : 0, borderColor: colors.track }}>
            <SkeletonBlock width={i % 2 ? "55%" : "72%"} height={13} radius={6} />
            <SkeletonBlock width="40%" height={11} radius={5} />
          </View>
        </View>
      ))}
    </View>
  );
}
