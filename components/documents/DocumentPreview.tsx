import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Modal, Platform, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
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
  extractionNote,
  fileKind,
  formatDateLabel,
  formatFileSize,
  documentsLayout,
  openPdfOnDevice,
} from "./documentMeta";
import { Icon } from "../Icon";
import { motion } from "../motion";

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
  // Two quick taps would both delete and re-download the same cache file.
  const [openingPdf, setOpeningPdf] = useState(false);
  const openingPdfRef = useRef(false);

  async function openPdf(target: MedicalDocument) {
    if (openingPdfRef.current) return;
    openingPdfRef.current = true;
    setOpeningPdf(true);
    try {
      await openPdfOnDevice(target);
    } catch {
      alert("Couldn't open the PDF", "Please try again.");
    } finally {
      openingPdfRef.current = false;
      setOpeningPdf(false);
    }
  }
  useEffect(() => {
    if (doc) setShown(doc);
  }, [doc]);

  const current = doc ?? shown;
  const kind = current ? fileKind(current.mimeType) : "file";
  const meta = current ? DOC_TYPE_META[current.docType] ?? DOC_TYPE_META.other : DOC_TYPE_META.other;
  const note = current ? extractionNote(current) : null;

  return (
    <Modal visible={!!doc} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {current ? (
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter, paddingTop: 16, paddingBottom: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {current.title}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ marginTop: 2, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                {[meta.label, formatDateLabel(current.documentDate), formatFileSize(current.fileSize)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              hitSlop={8}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft }}
            >
              <Icon set="ion" name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {note ? (
            <Text
              style={{
                marginHorizontal: gutter,
                marginBottom: 12,
                fontSize: 13,
                lineHeight: 18,
                color: current.extractionStatus === "pending" ? colors.mutedText : colors.warning,
                fontFamily: fonts.body,
              }}
            >
              {current.extractionStatus === "pending" ? "Still reading this file. You can ask about it in a moment." : `${note}, so answers about it may be incomplete.`}
            </Text>
          ) : null}

          {/* Viewer */}
          <View style={{ flex: 1, marginHorizontal: gutter, borderRadius: 12, overflow: "hidden", backgroundColor: colors.surfaceSoft }}>
            {!ready ? (
              <CenterSpinner label="Opening…" />
            ) : kind === "image" ? (
              <ImageViewer key={current.fileUrl} uri={current.fileUrl} />
            ) : Platform.OS === "web" ? (
              <ViewerNotice
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
                text="Opens in your phone's PDF app. The file stays on your phone."
                actionLabel={openingPdf ? "Opening…" : "Open PDF"}
                onAction={() => void openPdf(current)}
                disabled={openingPdf}
              />
            )}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: gutter, paddingTop: 14, paddingBottom: 12 }}>
            <PreviewAction label="Ask about this" onPress={() => onAskAI(current)} primary />
            {Platform.OS !== "web" ? <PreviewAction label="Share" onPress={() => onShare(current)} loading={sharing} disabled={!ready} /> : null}
            <PreviewAction label="Delete" onPress={() => onDelete(current)} loading={deleting} danger />
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
        <ViewerNotice text="Couldn't load this image. Check your connection and try again." />
      ) : (
        <Animated.View entering={FadeIn.duration(motion.duration.base)} style={{ flex: 1, opacity: loaded ? 1 : 0 }}>
          <Image
            cachePolicy="memory"
            source={{ uri }}
            style={{ flex: 1 }}
            contentFit="contain"
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

function ViewerNotice({
  text,
  actionLabel,
  onAction,
  disabled,
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  const { colors, fonts } = useTheme();
  return (
    <Animated.View entering={FadeIn.duration(motion.duration.base)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14, paddingHorizontal: 32 }}>
      <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: colors.mutedText, fontFamily: fonts.body }}>{text}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled }}
          style={{ justifyContent: "center", paddingHorizontal: 20, height: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, opacity: disabled ? 0.6 : 1 }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Animated.View>
  );
}

function PreviewAction({
  label,
  onPress,
  primary,
  danger,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  danger?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const fg = primary ? colors.buttonText : danger ? colors.danger : colors.foreground;
  const bg = primary ? colors.primary : colors.background;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(loading || disabled), busy: Boolean(loading) }}
      style={{
        flex: primary ? 1.6 : 1,
        height: 48,
        borderRadius: 14, borderCurve: "continuous",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        backgroundColor: bg,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : null}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "600", color: fg, fontFamily: fonts.body }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
