import React from "react";
import { Text, View } from "react-native";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";

/** The bordered, shadowed card every partner-overview section sits in. */
export function SectionCard({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      className={`rounded-3xl border ${compact ? "p-4" : "p-5"} mb-4`}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        ...getShadow(colors, isDark),
      }}
    >
      {children}
    </View>
  );
}

/** The small uppercase pink label at the top of a section card. */
export function SectionLabel({ children, className = "mb-3" }: { children: React.ReactNode; className?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text
      className={`text-[11.5px] font-black uppercase tracking-widest ${className}`}
      style={{ color: colors.primary, fontFamily: fonts.body }}
    >
      {children}
    </Text>
  );
}
