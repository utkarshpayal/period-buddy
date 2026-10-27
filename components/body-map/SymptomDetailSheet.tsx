import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BottomSheet } from "../BottomSheet";
import { Icon } from "../Icon";
import { useTheme } from "../theme";
import { withAlpha } from "../ui-tokens";
import { escalationFor, INTENSITY_LABEL, type BodySymptom } from "../../lib/bodyRegions";
import { AskNuraRow, nuraQuestionFor } from "./AskNuraRow";
import { PAIN_COLORS } from "./painColors";

type Props = {
  visible: boolean;
  title: string;
  urgentAdvice: string | null;
  symptoms: BodySymptom[];
  rangeDays: number;
  rangeLabel: string;
  onClose: () => void;
  onAskNura: (question: string) => void;
  /** Only offered when a symptom here is worth checking. */
  onTalkToDoctor: () => void;
};

/**
 * One spot on the body: which symptoms show up there and how often (the
 * dot's colour), and that area's safety advice. When and how many are in the
 * trends right below on the same screen, so they aren't repeated here.
 */
export function SymptomDetailSheet(p: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const first = p.symptoms[0];
  return (
    <BottomSheet visible={p.visible} onClose={p.onClose} backdropLabel="Close">
      <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: insets.bottom + 16, gap: 14 }}>
        <View style={{ gap: 2 }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text, letterSpacing: -0.4 }} numberOfLines={1}>
            {p.title}
          </Text>
          <Text style={{ fontSize: 13, color: colors.mutedText }}>
            {p.symptoms.length ? `Logged here in the last ${p.rangeLabel}` : `Nothing logged here in the last ${p.rangeLabel}`}
          </Text>
        </View>

        {p.symptoms.length ? (
          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
            {p.symptoms.map((s, i) => {
              const tint = PAIN_COLORS[s.intensity];
              const escalation = escalationFor(s, p.rangeDays);
              return (
                <View key={s.key} style={{ padding: 14, gap: 10, borderTopWidth: i ? 1 : 0, borderTopColor: colors.border }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, borderCurve: "continuous", alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(tint, 0.14) }}>
                      <Icon set="ion" name={s.icon as any} size={18} color={tint} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: colors.text }} numberOfLines={1}>
                      {s.label}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tint }} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedText }}>{INTENSITY_LABEL[s.intensity]}</Text>
                    </View>
                  </View>
                  {escalation ? (
                    <View style={{ flexDirection: "row", gap: 10, borderRadius: 14, padding: 12, backgroundColor: colors.warningLight }}>
                      <Icon set="ion" name="medkit-outline" size={18} color={colors.warning} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{escalation.title}</Text>
                        <Text style={{ fontSize: 13, color: colors.text, marginTop: 2, lineHeight: 18 }}>{escalation.message}</Text>
                        <Text
                          onPress={p.onTalkToDoctor}
                          accessibilityRole="link"
                          suppressHighlighting
                          style={{ fontSize: 13.5, fontWeight: "700", color: colors.primaryDark, marginTop: 8, textDecorationLine: "underline" }}
                        >
                          Talk to a gynaecologist
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {first ? <AskNuraRow question={nuraQuestionFor(first.key, first.label)} onPress={() => p.onAskNura(nuraQuestionFor(first.key, first.label))} /> : null}

        {p.urgentAdvice ? (
          <View style={{ flexDirection: "row", gap: 10, borderRadius: 16, padding: 12, backgroundColor: colors.dangerLight }}>
            <Icon set="ion" name="alert-circle-outline" size={20} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 }}>
              <Text style={{ fontWeight: "700" }}>Get help now: </Text>
              {p.urgentAdvice}
            </Text>
          </View>
        ) : null}
        <Text style={{ fontSize: 13, color: colors.mutedText, lineHeight: 18 }}>From your own day logs. It shows where, not why: not a diagnosis.</Text>
      </ScrollView>
    </BottomSheet>
  );
}
