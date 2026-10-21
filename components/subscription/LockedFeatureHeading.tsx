import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

/** Gold lock badge, feature name and one-line description: the top of LockedFeatureCard and PaywallModal. */
export function LockedFeatureHeading({ title, description }: { title: string; description?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <>
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.gold ?? colors.primary }}
      >
        <Icon set="mci" name="lock-outline" size={26} color={colors.buttonText} />
      </View>

      <Text
        className="mt-4 text-base font-bold text-center"
        style={{ color: colors.foreground, fontFamily: fonts.heading }}
      >
        {title}
      </Text>

      {description ? (
        <Text
          className="mt-1.5 text-xs text-center leading-5"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          {description}
        </Text>
      ) : null}
    </>
  );
}
