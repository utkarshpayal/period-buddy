import React from "react";
import { Text, View } from "react-native";
import type { SchemeEligibilityResult } from "../../lib/api";
import { useTheme } from "../theme";
import { getSoftTints } from "../ui-tokens";
import { Icon } from "../Icon";

/** The eligibility checker's answer. Never claims a guarantee. */
export function EligibilityResultCard({ eligibility }: { eligibility: SchemeEligibilityResult }) {
  const { colors, fonts } = useTheme();
  const softTints = getSoftTints(colors);
  const mayBeEligible = eligibility.status === "may_be_eligible";
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        marginTop: 12,
        borderRadius: 16, borderCurve: "continuous",
        padding: 14,
        backgroundColor: mayBeEligible ? softTints.emerald : softTints.amber,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 8, marginBottom: 4 }}>
        <Icon set="ion"
          name={mayBeEligible ? "checkmark-circle" : "information-circle"}
          size={18}
          color={mayBeEligible ? colors.success : colors.warning}
        />
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}>
          {mayBeEligible ? "You may be eligible" : "You may not meet all the rules"}
        </Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}>
        {eligibility.message}
      </Text>
      {!mayBeEligible && eligibility.unmetCriteria?.length ? (
        <View style={{ marginTop: 8 }}>
          {eligibility.unmetCriteria.map((c, i) => (
            <Text
              key={i}
              style={{ fontSize: 14, lineHeight: 20, fontWeight: "400", color: colors.foreground, fontFamily: fonts.body }}
            >
              • {c}
            </Text>
          ))}
        </View>
      ) : null}
      <Text style={{ marginTop: 8, fontSize: 13, lineHeight: 18, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
        Only the scheme office can confirm if you qualify.
      </Text>
    </View>
  );
}
