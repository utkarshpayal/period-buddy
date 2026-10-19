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
  Easing,
} from "react-native-reanimated";
import { alert } from "../../lib/alert";
import type { DocType } from "../../lib/api";
import { showPermissionModal } from "../../lib/modal-host";
import { requestPhotoLibraryAccess } from "../../lib/photoAccess";
import { CalendarModal } from "../CalendarModal";
import { useTheme } from "../theme";
import {
  DOC_TYPE_META,
  DOC_TYPE_ORDER,
  fileKind,
  formatDateLabel,
  formatFileSize,
  nameWithoutExtension,
  toDateKey,
} from "./documentMeta";
import { fileBadge, PageBadge } from "./DocumentCard";
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
  // The title we filled in from the file name, so "Change" can replace it
  // (but never a title the person typed).
  const autoTitleRef = useRef("");
  // A ref, not `phase`: a double tap lands before the re-render.
  const submittingRef = useRef(false);
  // The pickers reject when one is already open ("Different document picking
  // in progress") or the camera fails.
  const pickingRef = useRef(false);

  // Fresh form every time the sheet opens.
  useEffect(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    if (!visible) return;
    setPhase("source");
    setFile(null);
    setTitle("");
    autoTitleRef.current = "";
    setDocType("other");
    setDateKey(toDateKey(new Date()));
  }, [visible]);

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const busy = phase === "uploading";

  function accept(picked: PickedFile) {
    setFile(picked);
    const autoTitle = nameWithoutExtension(picked.name);
    setTitle((prev) => (!prev || prev === autoTitleRef.current ? autoTitle : prev));
    autoTitleRef.current = autoTitle;
    setPhase("details");
  }

  async function runPicker(pick: () => Promise<void>) {
    if (pickingRef.current) return;
    pickingRef.current = true;
    try {
      await pick();
    } catch {
      alert("Couldn't open that", "Please try again.");
    } finally {
      pickingRef.current = false;
    }
  }

  const pickCamera = () => runPicker(pickCameraInner);
  const pickPhoto = () => runPicker(pickPhotoInner);
  const pickFile = () => runPicker(pickFileInner);

  async function pickCameraInner() {
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

  async function pickPhotoInner() {
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

  async function pickFileInner() {
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
    if (!file || !canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setPhase("uploading");
    let ok = false;
    try {
      ok = await onUpload({ file, title: title.trim(), docType, documentDate: dateKey });
    } finally {
      submittingRef.current = false;
    }
    if (!ok) {
      setPhase("details");
      return;
    }
    setPhase("done");
    closeTimer.current = setTimeout(onClose, 900);
  }

  const sheetTitle = phase === "source" ? "Add a document" : phase === "done" ? "Saved" : "Details";
  const sheetSubtitle = phase === "source" ? "A PDF or a photo of a report, prescription or bill. Only you can see it." : undefined;

  const sources: { key: string; label: string; onPress: () => void }[] = [
    { key: "camera", label: "Take a photo", onPress: pickCamera },
    { key: "photos", label: "Choose from photos", onPress: pickPhoto },
    { key: "files", label: "Choose a file", onPress: pickFile },
  ];

  return (
    <DocumentSheet
      visible={visible}
      onClose={onClose}
      locked={busy}
      title={sheetTitle}
      subtitle={sheetSubtitle}
      footer={
        phase === "details" || phase === "uploading" ? (
          <SheetButton
            label="Save"
            loadingLabel="Uploading…"
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
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" }}>
          {sources.map((source, i) => (
            <TouchableOpacity
              key={source.key}
              onPress={source.onPress}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel={source.label}
              style={{ height: 52, justifyContent: "center", paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderColor: colors.border }}
            >
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ fontSize: 15, fontWeight: "500", color: colors.foreground, fontFamily: fonts.body }}>
                {source.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : phase === "done" ? (
        <View style={{ paddingVertical: 8 }}>
          <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>
            {title.trim()}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>Added to your documents.</Text>
        </View>
      ) : file ? (
        <Animated.View entering={FadeInDown.duration(240)} style={{ gap: 20 }}>
          {/* Picked file */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {fileKind(file.mimeType) === "image" ? (
              <Image
                source={{ uri: file.uri }}
                style={{ width: 34, height: 42, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSoft }}
                resizeMode="cover"
              />
            ) : (
              <PageBadge label={fileBadge(file.mimeType)} />
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: colors.foreground, fontFamily: fonts.body }}>
                {file.name}
              </Text>
              <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}>
                {[fileBadge(file.mimeType), formatFileSize(file.size)].filter(Boolean).join(" · ")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPhase("source")}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Choose a different file"
              hitSlop={8}
              style={{ opacity: busy ? 0.4 : 1 }}
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primaryDark, fontFamily: fonts.body }}>Change</Text>
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
                  minHeight: 48,
                  paddingHorizontal: 14,
                  borderRadius: 12,
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
                options={DOC_TYPE_ORDER.map((type) => ({ value: type, label: DOC_TYPE_META[type].label }))}
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
  const { colors } = useTheme();
  const x = useSharedValue(0);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [x]);
  const barStyle = useAnimatedStyle(() => ({ left: `${-40 + x.value * 140}%` }));
  return (
    <Animated.View entering={FadeIn.duration(180)} style={{ gap: 8 }}>
      <View style={{ height: 3, borderRadius: 2, overflow: "hidden", backgroundColor: colors.track }}>
        <Animated.View style={[{ position: "absolute", top: 0, bottom: 0, width: "40%", borderRadius: 3, backgroundColor: colors.primary }, barStyle]} />
      </View>
    </Animated.View>
  );
}
