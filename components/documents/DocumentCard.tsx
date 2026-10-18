import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import type { MedicalDocument } from "../../lib/api";
import { SkeletonBlock } from "../Skeleton";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import {
  DOC_TYPE_META,
  docTypeAccent,
  extractionNote,
  fileKind,
  fileKindStyle,
  formatDateLabel,
  formatFileSize,
} from "./documentMeta";

/**
 * One document in the list: file-type icon in a tinted square, title,
 * category · date · size, an optional "couldn't read" note, and a ⋯ button.
 * Tap opens it, long-press or ⋯ opens the actions.
 */
export function DocumentCard({
  doc,
  index,
  onOpen,
  onMore,
  width,
}: {
  doc: MedicalDocument;
  /** Fixed card width in the two-column tablet grid; full width otherwise. */
  width?: number;
  /** Position in the list; the first few cards stagger in. */
  index: number;
  onOpen: (doc: MedicalDocument) => void;
  onMore: (doc: MedicalDocument) => void;
}) {
  const { colors, fonts, isDark } = useTheme();
  const kind = fileKindStyle(colors, fileKind(doc.mimeType));
  const meta = DOC_TYPE_META[doc.docType] ?? DOC_TYPE_META.other;
  const accent = docTypeAccent(colors, doc.docType);
  const note = extractionNote(doc);
  const size = formatFileSize(doc.fileSize);
  const pending = doc.extractionStatus === "pending";
  const noteColor = pending ? colors.mutedText : colors.warning;

  return (
    <Animated.View
      entering={index < 8 ? FadeInDown.delay(index * 40).duration(260) : undefined}
      layout={LinearTransition.duration(220)}
      style={width ? { width } : undefined}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onOpen(doc)}
        onLongPress={() => onMore(doc)}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={`${doc.title}, ${kind.label}, ${meta.label}, ${formatDateLabel(doc.documentDate)}`}
        accessibilityHint="Opens the document. Long-press for more actions."
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          minHeight: 76,
          paddingVertical: 14,
          paddingLeft: 14,
          paddingRight: 6,
          borderRadius: 20,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: isDark ? colors.border : "transparent",
          ...getShadow(colors, isDark),
        }}
      >
        <View style={{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: kind.bg }}>
          <MaterialCommunityIcons name={kind.icon} size={26} color={kind.color} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{ flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}
          >
            {doc.title}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent.color }} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
              {[meta.label, formatDateLabel(doc.documentDate), size].filter(Boolean).join(" · ")}
            </Text>
          </View>
          {note ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
              <Ionicons name={pending ? "hourglass-outline" : "alert-circle-outline"} size={14} color={noteColor} />
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, fontSize: 13, fontWeight: "600", color: noteColor, fontFamily: fonts.body }}>
                {note}
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => onMore(doc)}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${doc.title}`}
          hitSlop={6}
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.mutedText} />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Loading placeholder shaped like the cards above. */
export function DocumentListSkeleton({ count = 5, width }: { count?: number; width?: number }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }} accessibilityLabel="Loading documents">
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={{
            width: width ?? "100%",
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            padding: 14,
            borderRadius: 20,
            backgroundColor: colors.surface,
            ...getShadow(colors, isDark),
          }}
        >
          <SkeletonBlock width={48} height={48} radius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBlock width={i % 2 ? "55%" : "72%"} height={14} radius={7} />
            <SkeletonBlock width="48%" height={12} radius={6} />
          </View>
          <SkeletonBlock width={20} height={6} radius={3} style={{ marginRight: 10 }} />
        </View>
      ))}
    </View>
  );
}
