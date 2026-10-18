import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Markdown from "react-native-markdown-display";
import Animated, { FadeInDown } from "react-native-reanimated";
import type { LanguageCode } from "../../lib/api";
import { SUPPORTED_LANGUAGES } from "../../lib/languages";
import { CalendarModal } from "../CalendarModal";
import { useTheme } from "../theme";
import { dateKeyToDate, formatDateLabel, lastDaysRange } from "./documentMeta";
import { ChoiceChips, DateField, DocumentSheet, FieldLabel, SheetButton } from "./DocumentSheet";

const PRESETS = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 3 months", days: 90 },
  { key: "180", label: "Last 6 months", days: 180 },
  { key: "365", label: "Last year", days: 365 },
] as const;

type Range = { start: string; end: string };

/**
 * Start/end dates (with one-tap presets) plus a language, shared by the
 * Summarize and Doctor report sheets. The calendars are returned separately
 * so the caller can mount them inside its Modal.
 */
function useRangeForm(range: Range, setRange: (r: Range) => void) {
  const [startOpen, setStartOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);

  const calendars = (
    <>
      <CalendarModal
        initialDateKey={range.start || undefined}
        maximumDate={range.end ? dateKeyToDate(range.end) : new Date()}
        onClose={() => setStartOpen(false)}
        onSelect={(key) => {
          setRange({ ...range, start: key });
          setStartOpen(false);
        }}
        visible={startOpen}
      />
      <CalendarModal
        initialDateKey={range.end || undefined}
        maximumDate={new Date()}
        minimumDate={range.start ? dateKeyToDate(range.start) : undefined}
        onClose={() => setEndOpen(false)}
        onSelect={(key) => {
          setRange({ ...range, end: key });
          setEndOpen(false);
        }}
        visible={endOpen}
      />
    </>
  );

  return { calendars, openStart: () => setStartOpen(true), openEnd: () => setEndOpen(true) };
}

function RangeFields({
  range,
  setRange,
  openStart,
  openEnd,
  language,
  setLanguage,
  languageLabel,
}: {
  range: Range;
  setRange: (r: Range) => void;
  openStart: () => void;
  openEnd: () => void;
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  languageLabel: string;
}) {
  const presetMatch = PRESETS.find((p) => {
    const r = lastDaysRange(p.days);
    return r.start === range.start && r.end === range.end;
  });
  return (
    <View style={{ gap: 20 }}>
      <View>
        <FieldLabel>Date range</FieldLabel>
        <ChoiceChips
          scroll
          value={presetMatch?.key ?? null}
          onChange={(key) => {
            const preset = PRESETS.find((p) => p.key === key);
            if (preset) setRange(lastDaysRange(preset.days));
          }}
          options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        />
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <DateField value={range.start ? formatDateLabel(range.start) : ""} placeholder="Start date" onPress={openStart} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField value={range.end ? formatDateLabel(range.end) : ""} placeholder="End date" onPress={openEnd} />
          </View>
        </View>
      </View>
      <View>
        <FieldLabel>{languageLabel}</FieldLabel>
        <ChoiceChips
          scroll
          value={language}
          onChange={(code) => setLanguage(code || "en-IN")}
          options={SUPPORTED_LANGUAGES.map((l) => ({ value: l.code, label: l.label }))}
        />
      </View>
    </View>
  );
}

/** AI summary of the documents in a date range. */
export function SummarizeSheet({
  visible,
  onClose,
  range,
  setRange,
  language,
  setLanguage,
  summarizing,
  result,
  onGenerate,
  onReset,
}: {
  visible: boolean;
  onClose: () => void;
  range: Range;
  setRange: (r: Range) => void;
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  summarizing: boolean;
  result: { documentCount: number; summary: string } | null;
  onGenerate: () => void;
  onReset: () => void;
}) {
  const { colors, fonts } = useTheme();
  const { calendars, openStart, openEnd } = useRangeForm(range, setRange);
  const ready = !!range.start && !!range.end;

  return (
    <DocumentSheet
      visible={visible}
      onClose={onClose}
      locked={summarizing}
      title="Summarize reports"
      subtitle={result ? `${formatDateLabel(range.start)} – ${formatDateLabel(range.end)}` : "Plain-language summary of a date range"}
      icon="sparkles-outline"
      iconColor={colors.accentText}
      iconBg={colors.accentLight}
      overlay={calendars}
      footer={
        result ? (
          <TouchableOpacity
            onPress={onReset}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={{ height: 50, borderRadius: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.primary }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.body }}>Choose a different range</Text>
          </TouchableOpacity>
        ) : (
          <SheetButton label="Generate summary" loadingLabel="Reading your reports…" icon="sparkles-outline" onPress={onGenerate} disabled={!ready} loading={summarizing} />
        )
      }
    >
      {result ? (
        <Animated.View entering={FadeInDown.duration(260)}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
            <Ionicons name="documents-outline" size={15} color={colors.mutedText} />
            <Text style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body }}>
              Based on {result.documentCount} document{result.documentCount === 1 ? "" : "s"}
            </Text>
          </View>
          <View style={{ borderRadius: 20, padding: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
            <Markdown
              style={{
                body: { color: colors.foreground, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
                heading1: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, marginBottom: 6 },
                heading2: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 15, marginTop: 12, marginBottom: 4 },
                heading3: { color: colors.foreground, fontFamily: fonts.heading, fontSize: 14, marginTop: 10, marginBottom: 4 },
                strong: { fontFamily: fonts.heading },
                bullet_list: { marginBottom: 6 },
                list_item: { marginBottom: 3 },
                paragraph: { marginTop: 0, marginBottom: 8 },
              }}
            >
              {result.summary}
            </Markdown>
          </View>
          <Text style={{ marginTop: 12, fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body }}>
            AI summaries can miss things. Check anything important with your doctor.
          </Text>
        </Animated.View>
      ) : (
        <RangeFields
          range={range}
          setRange={setRange}
          openStart={openStart}
          openEnd={openEnd}
          language={language}
          setLanguage={setLanguage}
          languageLabel="Summary language"
        />
      )}
    </DocumentSheet>
  );
}

/** PDF of the person's cycle and logs for a doctor. */
export function DoctorReportSheet({
  visible,
  onClose,
  range,
  setRange,
  language,
  setLanguage,
  generating,
  onGenerate,
}: {
  visible: boolean;
  onClose: () => void;
  range: Range;
  setRange: (r: Range) => void;
  language: LanguageCode;
  setLanguage: (code: LanguageCode) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  const { colors } = useTheme();
  const { calendars, openStart, openEnd } = useRangeForm(range, setRange);
  return (
    <DocumentSheet
      visible={visible}
      onClose={onClose}
      locked={generating}
      title="Doctor report"
      subtitle="A PDF you can save or share"
      icon="document-attach-outline"
      iconColor={colors.secondary}
      iconBg={colors.secondaryLight}
      overlay={calendars}
      footer={
        <SheetButton
          label="Generate & download"
          loadingLabel="Creating your PDF…"
          icon="download-outline"
          onPress={onGenerate}
          disabled={!range.start || !range.end}
          loading={generating}
        />
      }
    >
      <RangeFields
        range={range}
        setRange={setRange}
        openStart={openStart}
        openEnd={openEnd}
        language={language}
        setLanguage={setLanguage}
        languageLabel="Report language"
      />
    </DocumentSheet>
  );
}
