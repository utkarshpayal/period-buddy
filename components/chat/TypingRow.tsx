import React from "react";
import { View } from "react-native";
import { TypingDots } from "../TypingDots";

/** The assistant's "is typing" row: its avatar (or the space for one), then the dots. */
export function TypingRow({ avatar }: { avatar: React.ReactNode }) {
  return (
    <View className="flex-row items-end" style={{ gap: 8 }}>
      <View style={{ width: 28 }}>{avatar}</View>
      <TypingDots />
    </View>
  );
}
