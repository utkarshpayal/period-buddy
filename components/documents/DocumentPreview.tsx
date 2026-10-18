import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, Modal, Platform, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { alert } from "../../lib/alert";
import type { MedicalDocument } from "../../lib/api";
import { AppModalHost } from "../modals/AppModalHost";
import { useContentWidth } from "../../lib/layout";
import { useTheme } from "../theme";
import {
  DOC_TYPE_META,
  docTypeAccent,
  extractionNote,
  fileKind,
  fileKindStyle,
  formatDateLabel,
  formatFileSize,
  documentsLayout,
  openPdfOnDevice,
} from "./documentMeta";

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Full-screen document viewer. `ready` turns true once the fresh signed
 * link has come back (or failed, keeping the list's copy), so the viewer
 * never starts loading a link that may already have expired.
 */
export function DocumentPreview({
  doc,
  ready,
  onClose,
  onAskAI,
  onShare,
  onDelete,
  sharing,
  deleting,
}: {
  doc: MedicalDocument | null;
  ready: boolean;
  onClose: () => void;
  onAskAI: (doc: MedicalDocument) => void;
  onShare: (doc: MedicalDocument) => void;
  onDelete: (doc: MedicalDocument) => void;
  sharing: boolean;
  deleting: boolean;
}) {
  const { colors, fonts } = useTheme();
  const { gutter } = documentsLayout(useContentWidth());
  // Keep the last document while the sheet slides away.
  const [shown, setShown] = useState<MedicalDocument | null>(doc);
  useEffect(() => {
    if (doc) setShown(doc);
  }, [doc]);

  const current = doc ?? shown;
  const kind = current ? fileKind(current.mimeType) : "file";
  const kindStyle = fileKindStyle(colors, kind);
  const meta = current ? DOC_TYPE_META[current.docType] ?? DOC_TYPE_META.other : DOC_TYPE_META.other;
  const accent = current ? docTypeAccent(colors, current.docType) : docTypeAccent(colors, "other");
  const note = current ? extractionNote(current) : null;

  return (
    <Modal visible={!!doc} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {current ? (
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: kindStyle.bg }}>
              <MaterialCommunityIcons name={kindStyle.icon} size={24} color={kindStyle.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {current.title}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: accent.color }} />
                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ flexShrink: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                  {[meta.label, formatDateLabel(current.documentDate), formatFileSize(current.fileSize)].filter(Boolean).join(" · ")}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
            >
              <Ionicons name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {note ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginHorizontal: gutter,
                marginBottom: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 14,
                backgroundColor: current.extractionStatus === "pending" ? colors.surfaceSoft : colors.warningLight,
              }}
            >
              <Ionicons name={current.extractionStatus === "pending" ? "hourglass-outline" : "alert-circle-outline"} size={16} color={current.extractionStatus === "pending" ? colors.mutedText : colors.warning} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.foreground, fontFamily: fonts.body }}>
                {current.extractionStatus === "pending" ? "Still reading this file. Ask AI will know about it in a moment." : `${note}. The AI may not be able to answer about it.`}
              </Text>
            </View>
          ) : null}

          {/* Viewer */}
          <View style={{ flex: 1, marginHorizontal: gutter, borderRadius: 22, overflow: "hidden", backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.border }}>
            {!ready ? (
              <CenterSpinner label="Opening securely…" />
            ) : kind === "image" ? (
              <ImageViewer key={current.fileUrl} uri={current.fileUrl} />
            ) : Platform.OS === "web" ? (
              <ViewerNotice
                icon="open-outline"
                text="In-page preview isn't supported in the browser yet. Open the document in a new tab instead."
                actionLabel="View in browser"
                onAction={() => Linking.openURL(current.fileUrl)}
              />
            ) : Platform.OS === "ios" ? (
              // iOS shows PDFs itself: the file goes nowhere else.
              <WebView
                source={{ uri: current.fileUrl }}
                style={{ flex: 1, backgroundColor: colors.surfaceSoft }}
                startInLoadingState
                renderLoading={() => <CenterSpinner label="Loading PDF…" absolute />}
              />
            ) : (
              <ViewerNotice
                icon="document-text-outline"
                text="Opens in your phone's PDF app. The file stays on your phone."
                actionLabel="Open PDF"
                onAction={() => openPdfOnDevice(current).catch(() => alert("Couldn't open the PDF", "Please try again."))}
              />
            )}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 12 }}>
            <PreviewAction icon="sparkles-outline" label="Ask AI" onPress={() => onAskAI(current)} primary />
            {Platform.OS !== "web" ? (
              <PreviewAction icon="share-outline" label="Share" onPress={() => onShare(current)} loading={sharing} disabled={!ready} />
            ) : null}
            <PreviewAction icon="trash-outline" label="Delete" onPress={() => onDelete(current)} loading={deleting} danger />
          </View>
        </SafeAreaView>
      ) : null}
      {/* Alerts raised here (delete confirm, share errors) draw over the sheet. */}
      {doc ? <AppModalHost inline /> : null}
    </Modal>
  );
}

function ImageViewer({ uri }: { uri: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      {!loaded && !failed ? <CenterSpinner label="Loading image…" absolute /> : null}
      {failed ? (
        <ViewerNotice icon="cloud-offline-outline" text="Couldn't load this image. Check your connection and try again." />
      ) : (
        <Animated.View entering={FadeIn.duration(250)} style={{ flex: 1, opacity: loaded ? 1 : 0 }}>
          <Image
            source={{ uri }}
            style={{ flex: 1 }}
            resizeMode="contain"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      )}
    </View>
  );
}

function CenterSpinner({ label, absolute }: { label: string; absolute?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <View
      style={[
        { alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.surfaceSoft },
        absolute ? { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } : { flex: 1 },
      ]}
    >
      <ActivityIndicator color={colors.primary} />
      <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>{label}</Text>
    </View>
  );
}

function ViewerNotice({ icon, text, actionLabel, onAction }: { icon: IconName; text: string; actionLabel?: string; onAction?: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 }}>
      <View style={{ width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <Ionicons name={icon} size={26} color={colors.mutedText} />
      </View>
      <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body }}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, height: 44, borderRadius: 22, backgroundColor: colors.primary }}
        >
          <Feather name="external-link" size={15} color={colors.buttonText} />
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.buttonText, fontFamily: fonts.body }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

function PreviewAction({
  icon,
  label,
  onPress,
  primary,
  danger,
  loading,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const fg = primary ? colors.buttonText : danger ? colors.danger : colors.foreground;
  const bg = primary ? colors.primary : danger ? colors.dangerLight : colors.surface;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(loading || disabled), busy: Boolean(loading) }}
      style={{
        flex: primary ? 1.4 : 1,
        height: 50,
        borderRadius: 16,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: bg,
        borderWidth: primary || danger ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={17} color={fg} />}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 14, fontWeight: "700", color: fg, fontFamily: fonts.body }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
