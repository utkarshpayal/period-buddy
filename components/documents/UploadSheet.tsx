import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
  Easing,
} from "react-native-reanimated";
import type { DocType } from "../../lib/api";
import { showPermissionModal } from "../../lib/modal-host";
import { requestPhotoLibraryAccess } from "../../lib/photoAccess";
import { CalendarModal } from "../CalendarModal";
import { useTheme } from "../theme";
import {
  DOC_TYPE_META,
  DOC_TYPE_ORDER,
  docTypeAccent,
  fileKind,
  fileKindStyle,
  formatDateLabel,
  formatFileSize,
  nameWithoutExtension,
  toDateKey,
} from "./documentMeta";
import { ChoiceChips, DateField, DocumentSheet, FieldLabel, SheetButton } from "./DocumentSheet";

export type PickedFile = {
  mimeType: string;
  name: string;
  size?: number;
  uri: string;
};

export type UploadRequest = {
  file: PickedFile;
  title: string;
  docType: DocType;
  documentDate: string;
};

type Phase = "source" | "details" | "uploading" | "done";

/**
 * Upload flow as one bottom sheet: pick a source (camera, photos, files),
 * then name, category and date, then an upload progress state and a short
 * "Saved" confirmation. `onUpload` does the request and resolves true on
 * success (false keeps the form so the person can retry).
 */
export function UploadSheet({
  visible,
  onClose,
  onUpload,
}: {
  visible: boolean;
  onClose: () => void;
  onUpload: (request: UploadRequest) => Promise<boolean>;
}) {
  const { colors, fonts } = useTheme();
  const [phase, setPhase] = useState<Phase>("source");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("other");
  const [dateKey, setDateKey] = useState("");
  const [calendarVisible, setCalendarVisible] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (!visible) return;
    setPhase("source");
    setFile(null);
    setTitle("");
    setDocType("other");
    setDateKey(toDateKey(new Date()));
  }, [visible]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const busy = phase === "uploading";

  function accept(picked: PickedFile) {
    setFile(picked);
    setTitle((prev) => prev || nameWithoutExtension(picked.name));
    setPhase("details");
  }

  async function pickCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showPermissionModal({
        title: "Camera access needed",
        message: "Allow camera access to photograph a document.",
        icon: "camera-outline",
      });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    accept({
      mimeType: asset.mimeType || "image/jpeg",
      name: asset.fileName || `document-${Date.now()}.jpg`,
      size: asset.fileSize,
      uri: asset.uri,
    });
  }

  async function pickPhoto() {
    const permission = await requestPhotoLibraryAccess();
    if (!permission.granted) {
      showPermissionModal({
        title: "Photo access needed",
        message: "Allow photo library access to choose a document image.",
        icon: "images-outline",
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    accept({
      mimeType: asset.mimeType || "image/jpeg",
      name: asset.fileName || `document-${Date.now()}.jpg`,
      size: asset.fileSize,
      uri: asset.uri,
    });
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      type: ["application/pdf", "image/*"],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    accept({
      mimeType: asset.mimeType || "application/pdf",
      name: asset.name,
      size: asset.size ?? undefined,
      uri: asset.uri,
    });
  }

  const canSubmit = !!file && !!title.trim() && !!dateKey;

  async function submit() {
    if (!file || !canSubmit || busy) return;
    setPhase("uploading");
    const ok = await onUpload({ file, title: title.trim(), docType, documentDate: dateKey });
    if (!ok) {
      setPhase("details");
      return;
    }
    setPhase("done");
    closeTimer.current = setTimeout(onClose, 900);
  }

  const sheetTitle = phase === "source" ? "Add a document" : phase === "done" ? "Saved" : "Document details";
  const sheetSubtitle =
    phase === "source"
      ? "PDF or photo · stays private to you"
      : phase === "uploading"
        ? "Uploading securely…"
        : phase === "done"
          ? "Your document is in your list"
          : "Name it so it's easy to find";

  const sources: { key: string; label: string; hint: string; icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; onPress: () => void }[] = [
    { key: "camera", label: "Camera", hint: "Scan a page", icon: "camera-outline", color: colors.primary, bg: colors.primaryLight, onPress: pickCamera },
    { key: "photos", label: "Photos", hint: "From gallery", icon: "images-outline", color: colors.sky, bg: colors.skyLight, onPress: pickPhoto },
    { key: "files", label: "Files", hint: "PDF or image", icon: "folder-open-outline", color: colors.accent, bg: colors.accentLight, onPress: pickFile },
  ];

  const kind = file ? fileKindStyle(colors, fileKind(file.mimeType)) : null;

  return (
    <DocumentSheet
      visible={visible}
      onClose={onClose}
      locked={busy}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      icon={phase === "done" ? "checkmark-circle-outline" : "cloud-upload-outline"}
      iconColor={phase === "done" ? colors.success : colors.primary}
      iconBg={phase === "done" ? colors.successLight : colors.primaryLight}
      footer={
        phase === "details" || phase === "uploading" ? (
          <SheetButton
            label="Upload document"
            loadingLabel="Uploading…"
            icon="cloud-upload-outline"
            onPress={submit}
            disabled={!canSubmit}
            loading={busy}
          />
        ) : undefined
      }
      overlay={
        <CalendarModal
          title="Document date"
          initialDateKey={dateKey || undefined}
          maximumDate={new Date()}
          onClose={() => setCalendarVisible(false)}
          onSelect={(key) => {
            setDateKey(key);
            setCalendarVisible(false);
          }}
          visible={calendarVisible}
        />
      }
    >
      {phase === "source" ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ flexDirection: "row", gap: 10 }}>
          {sources.map((source) => (
            <TouchableOpacity
              key={source.key}
              onPress={source.onPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${source.label}. ${source.hint}`}
              style={{
                flex: 1,
                alignItems: "center",
                paddingVertical: 18,
                paddingHorizontal: 6,
                borderRadius: 20,
                backgroundColor: colors.surface,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <View style={{ width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: source.bg }}>
                <Ionicons name={source.icon} size={22} color={source.color} />
              </View>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 10, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {source.label}
              </Text>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ marginTop: 1, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
                {source.hint}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      ) : phase === "done" ? (
        <View style={{ alignItems: "center", paddingVertical: 24 }}>
          <Animated.View
            entering={ZoomIn.duration(320)}
            style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: colors.successLight }}
          >
            <Ionicons name="checkmark" size={36} color={colors.success} />
          </Animated.View>
          <Text numberOfLines={2} style={{ marginTop: 14, fontSize: 15, fontWeight: "700", textAlign: "center", color: colors.foreground, fontFamily: fonts.body }}>
            {title.trim()}
          </Text>
        </View>
      ) : file && kind ? (
        <Animated.View entering={FadeInDown.duration(240)} style={{ gap: 20 }}>
          {/* Picked file */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: 18,
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            {fileKind(file.mimeType) === "image" ? (
              <Image source={{ uri: file.uri }} style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: kind.bg }} resizeMode="cover" />
            ) : (
              <View style={{ width: 52, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: kind.bg }}>
                <MaterialCommunityIcons name={kind.icon} size={26} color={kind.color} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                {file.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}>
                {[kind.label, formatFileSize(file.size)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPhase("source")}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Choose a different file"
              hitSlop={8}
              style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: colors.surfaceSoft, opacity: busy ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>Change</Text>
            </TouchableOpacity>
          </View>

          {busy ? <UploadProgress /> : null}

          <View pointerEvents={busy ? "none" : "auto"} style={{ gap: 20, opacity: busy ? 0.55 : 1 }}>
            <View>
              <FieldLabel>Name</FieldLabel>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Blood test, Jan 2026"
                placeholderTextColor={colors.mutedText}
                maxLength={150}
                returnKeyType="done"
                accessibilityLabel="Document name"
                style={{
                  minHeight: 50,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  fontSize: 15,
                  backgroundColor: colors.input,
                  borderWidth: 1,
                  borderColor: colors.border,
                  color: colors.foreground,
                  fontFamily: fonts.body,
                }}
              />
            </View>

            <View>
              <FieldLabel>Category</FieldLabel>
              <ChoiceChips
                value={docType}
                onChange={setDocType}
                options={DOC_TYPE_ORDER.map((type) => {
                  const accent = docTypeAccent(colors, type);
                  return { value: type, label: DOC_TYPE_META[type].label, icon: DOC_TYPE_META[type].icon, color: accent.color, bg: accent.bg };
                })}
              />
            </View>

            <View>
              <FieldLabel>Date on the document</FieldLabel>
              <DateField value={dateKey ? formatDateLabel(dateKey) : ""} placeholder="Select a date" onPress={() => setCalendarVisible(true)} />
            </View>
          </View>
        </Animated.View>
      ) : null}
    </DocumentSheet>
  );
}

/**
 * Indeterminate bar: the upload request doesn't report byte progress, so
 * this shows that it's working without pretending to know how far along.
 */
function UploadProgress() {
  const { colors, fonts } = useTheme();
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [x]);
  const barStyle = useAnimatedStyle(() => ({ left: `${-40 + x.value * 140}%` }));
  return (
    <Animated.View entering={FadeIn.duration(180)} style={{ gap: 8 }}>
      <View style={{ height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: colors.track }}>
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 3, backgroundColor: colors.primary }, barStyle]} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name="lock-closed" size={13} color={colors.mutedText} />
        <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>Sending over a secure connection</Text>
      </View>
    </Animated.View>
  );
}
