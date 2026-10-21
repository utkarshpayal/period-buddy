import React from "react";
import { Text, View } from "react-native";
import type { GovernmentBenefit } from "../../lib/api";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";
import { SCHEME_BODY, SchemeSection } from "./SchemeSection";

/** "How to apply or get it": the method line, then numbered steps. */
export function ApplicationSteps({ scheme }: { scheme: GovernmentBenefit }) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  if (!scheme.applicationMethod && !scheme.applicationSteps?.length) return null;
  return (
    <SchemeSection title="How to apply or get it" icon="clipboard-outline">
      {scheme.applicationMethod ? (
        <Text style={{ ...SCHEME_BODY, marginBottom: 12, color: colors.foreground, fontFamily: fonts.body }}>
          {scheme.applicationMethod}
        </Text>
      ) : null}
      {scheme.applicationSteps?.map((s, i) => (
        <View key={i} className="flex-row" style={{ gap: 12, marginBottom: 12 }}>
          <View
            className="items-center justify-center"
            style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: softTints.pink }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ fontSize: 13, fontWeight: "700", color: colors.primaryDark, fontFamily: fonts.mono }}
            >
              {i + 1}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
              {s.title}
            </Text>
            {s.detail ? (
              <Text style={{ ...SCHEME_BODY, color: colors.foreground, fontFamily: fonts.body }}>
                {s.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </SchemeSection>
  );
}
