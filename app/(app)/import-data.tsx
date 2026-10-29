import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Platform, StatusBar, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { useTheme } from "../../components/theme";
import { useTodayKey } from "../../hooks/useTodayKey";
import { cycleApi, getFriendlyErrorMessage } from "../../lib/api";
import {
  chunk,
  ImportFormatError,
  parseImportFile,
  ZipPasswordError,
  type ImportPreview,
} from "../../lib/cycleImport";
import { dateFromDayKey } from "../../lib/format";
import { haptics } from "../../lib/haptics";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { showErrorToast } from "../../lib/toast";

// Days per request: a few small requests instead of one big one.
const BATCH_DAYS = 500;

type Picked = { bytes: Uint8Array; name: string };
type Result = { added: number; updated: number; unchanged: number };
type Step =
  | { kind: "pick" }
  | { kind: "password"; file: Picked; wrong: boolean }
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "importing"; preview: ImportPreview; done: number }
  | { kind: "done"; preview: ImportPreview; result: Result };

const SOURCE_NAME = { clue: "Clue", flo: "Flo" } as const;

const formatDay = (dateKey: string) =>
  dateFromDayKey(dateKey).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

async function readPickedFile(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  if (Platform.OS === "web") {
    return new Uint8Array(await (asset.file ? asset.file.arrayBuffer() : (await fetch(asset.uri)).arrayBuffer()));
  }
  const file = new File(asset.uri);
  try {
    return await file.bytes();
  } finally {
    // The picker's cache copy holds health data: don't leave it behind.
    try {
      file.delete();
    } catch {}
  }
}

/**
 * Import from Clue or Flo (Profile → Data privacy & security → Import).
 * The export is read on the phone (`lib/cycleImport.ts`) and only the day
 * logs are sent, in batches, to `POST /api/cycle/import`, which never
 * overwrites what was logged in Nura.
 */
export default function ImportData() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const todayKey = useTodayKey();
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [picking, setPicking] = useState(false);
  const [password, setPassword] = useState("");
  const importing = useRef(false);
  useSecureScreen("import-data");

  const read = (file: Picked, pass?: string) => {
    try {
      const preview = parseImportFile(file.bytes, file.name, todayKey, pass);
      setPassword("");
      setStep({ kind: "preview", preview });
    } catch (err) {
      if (err instanceof ZipPasswordError) {
        setStep({ kind: "password", file, wrong: err.reason === "wrong" });
        if (err.reason === "wrong") haptics.error();
      } else {
        setStep({ kind: "pick" });
        showErrorToast(err instanceof ImportFormatError ? err.message : "This file couldn't be read.", "Can't import this file");
      }
    }
  };

  const pick = async () => {
    setPicking(true);
    try {
      // Clue's .cluedata and some zips have no useful type, so allow any file.
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, type: "*/*" });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      read({ bytes: await readPickedFile(asset), name: asset.name ?? "" });
    } catch (err) {
      showErrorToast(getFriendlyErrorMessage(err), "Couldn't open the file");
    } finally {
      setPicking(false);
    }
  };

  const runImport = async (preview: ImportPreview) => {
    if (importing.current) return;
    importing.current = true;
    const totals: Result = { added: 0, updated: 0, unchanged: 0 };
    let done = 0;
    setStep({ kind: "importing", preview, done });
    try {
      for (const batch of chunk(preview.days, BATCH_DAYS)) {
        const res = await cycleApi.importLogs(preview.source, batch);
        totals.added += res.added;
        totals.updated += res.updated;
        totals.unchanged += res.unchanged;
        done += batch.length;
        setStep({ kind: "importing", preview, done });
      }
      haptics.success();
      setStep({ kind: "done", preview, result: totals });
    } catch (err) {
      haptics.error();
      // Batches already sent are saved; importing again skips them.
      setStep({ kind: "preview", preview });
      showErrorToast(
        done > 0
          ? `${plural(done, "day")} were saved. Try again to import the rest.`
          : getFriendlyErrorMessage(err),
        "Import stopped",
      );
    } finally {
      importing.current = false;
    }
  };

  const card = {
    marginHorizontal: 24,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  };
  const body = { color: colors.foreground, fontSize: 14, lineHeight: 21, fontFamily: fonts.body };
  const muted = { color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body };
  const strong = { ...body, fontWeight: "700" as const };
  const section = (title: string) => <SectionHeader title={title} style={{ marginHorizontal: 24, marginTop: 24 }} />;

  const howTo = [
    {
      key: "clue",
      title: "From Clue",
      text: "In Clue, ask for a download of your data in its privacy settings. Clue gives you a .zip file and a password for it.",
    },
    {
      key: "flo",
      title: "From Flo",
      text: "In Flo, ask for a copy of your data in its settings. Flo sends you a file by email.",
    },
  ];

  const stat = (value: string, label: string) => (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <Text
        style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", letterSpacing: -0.4, fontVariant: ["tabular-nums"], fontFamily: fonts.heading }}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
      <Text style={muted} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );

  const summary = (preview: ImportPreview) => (
    <View style={card}>
      <View className="flex-row items-center" style={{ gap: 12 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, borderCurve: "continuous", backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
          <Icon set="ion" name="document-text-outline" size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text style={strong}>Your {SOURCE_NAME[preview.source]} data</Text>
          {preview.firstDateKey && preview.lastDateKey && (
            <Text style={muted}>
              {formatDay(preview.firstDateKey)} – {formatDay(preview.lastDateKey)}
            </Text>
          )}
        </View>
      </View>
      <View className="flex-row" style={{ paddingVertical: 4 }}>
        {stat(preview.days.length.toLocaleString("en-IN"), "days")}
        {stat(preview.periods.toLocaleString("en-IN"), preview.periods === 1 ? "period" : "periods")}
        {stat(preview.periodDays.toLocaleString("en-IN"), "period days")}
      </View>
      {preview.savedAsNotes.length > 0 && (
        <Text style={muted}>Saved in each day&apos;s note, as Nura has no field for them: {preview.savedAsNotes.join(", ")}.</Text>
      )}
    </View>
  );

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScreenHeader title="Import from Clue or Flo" />
        <KeyboardAwareScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {step.kind === "pick" && (
            <>
              <View style={[card, { marginTop: 12 }]}>
                <Text style={body}>
                  Bring your period history, symptoms and moods from another app, so your predictions start from your real cycles.
                </Text>
                <View className="flex-row" style={{ gap: 12 }}>
                  <Icon set="ion" name="lock-closed-outline" size={18} color={colors.accent} style={{ marginTop: 1 }} />
                  <Text style={[muted, { flex: 1 }]}>
                    The file is read on this phone. Only your day logs are saved to your account, and nothing you&apos;ve logged in Nura is changed.
                  </Text>
                </View>
              </View>

              {section("Get your file")}
              <View style={card}>
                {howTo.map((item) => (
                  <View key={item.key} style={{ gap: 2 }}>
                    <Text style={strong}>{item.title}</Text>
                    <Text style={muted}>{item.text}</Text>
                  </View>
                ))}
              </View>

              <Button
                label="Choose file"
                icon="folder-open-outline"
                loading={picking}
                onPress={pick}
                style={{ marginHorizontal: 24, marginTop: 24 }}
              />
            </>
          )}

          {step.kind === "password" && (
            <>
              <View style={[card, { marginTop: 12 }]}>
                <Text style={strong}>This file is locked</Text>
                <Text style={muted}>
                  Clue locks its download with a password. You&apos;ll find it in Clue, where you asked for your data.
                </Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  placeholderTextColor={colors.mutedText}
                  accessibilityLabel="Password for the file"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => password && read(step.file, password)}
                  style={{
                    color: colors.foreground,
                    fontFamily: fonts.body,
                    fontSize: 16,
                    minHeight: 50,
                    paddingHorizontal: 14,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: step.wrong ? colors.danger : colors.border,
                    backgroundColor: colors.background,
                  }}
                />
                {step.wrong && <Text style={[muted, { color: colors.danger }]}>That password didn&apos;t open the file.</Text>}
              </View>
              <Button
                label="Open file"
                disabled={!password}
                onPress={() => read(step.file, password)}
                style={{ marginHorizontal: 24, marginTop: 24 }}
              />
              <Button
                label="Choose another file"
                variant="ghost"
                onPress={() => {
                  setPassword("");
                  setStep({ kind: "pick" });
                }}
                style={{ marginHorizontal: 24, marginTop: 8 }}
              />
            </>
          )}

          {(step.kind === "preview" || step.kind === "importing") && (
            <>
              <View style={{ marginTop: 12 }}>{summary(step.preview)}</View>
              <Text style={[muted, { marginHorizontal: 24, marginTop: 12 }]}>
                Days you&apos;ve already logged in Nura keep what you logged; the import only adds what&apos;s missing.
              </Text>
              <Button
                label={
                  step.kind === "importing"
                    ? `Importing ${step.done.toLocaleString("en-IN")} of ${step.preview.days.length.toLocaleString("en-IN")} days…`
                    : `Import ${plural(step.preview.days.length, "day")}`
                }
                loading={step.kind === "importing" && step.preview.days.length <= BATCH_DAYS}
                disabled={step.kind === "importing"}
                onPress={() => runImport(step.preview)}
                style={{ marginHorizontal: 24, marginTop: 24 }}
              />
              {step.kind === "preview" && (
                <Button
                  label="Choose another file"
                  variant="ghost"
                  onPress={() => setStep({ kind: "pick" })}
                  style={{ marginHorizontal: 24, marginTop: 8 }}
                />
              )}
            </>
          )}

          {step.kind === "done" && (
            <>
              <View style={[card, { marginTop: 12, alignItems: "center", paddingVertical: 24 }]}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" }}>
                  <Icon set="ion" name="checkmark" size={28} color={colors.primary} />
                </View>
                <Text style={[strong, { fontSize: 18, textAlign: "center" }]}>Your history is in</Text>
                <Text style={[muted, { textAlign: "center" }]}>
                  {step.result.added + step.result.updated === 0
                    ? `Everything from ${SOURCE_NAME[step.preview.source]} was already here.`
                    : [
                        step.result.added > 0 && `${plural(step.result.added, "day")} added`,
                        step.result.updated > 0 && `${plural(step.result.updated, "day")} filled in`,
                        step.result.unchanged > 0 && `${plural(step.result.unchanged, "day")} already up to date`,
                      ]
                        .filter(Boolean)
                        .join(" · ") + "."}
                </Text>
                <Text style={[muted, { textAlign: "center" }]}>Your predictions now use these cycles too.</Text>
              </View>
              <Button
                label="Open tracker"
                iconRight="arrow-forward"
                onPress={() => router.replace("/tracker")}
                style={{ marginHorizontal: 24, marginTop: 24 }}
              />
            </>
          )}
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </>
  );
}
