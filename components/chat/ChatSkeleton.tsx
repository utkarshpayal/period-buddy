import React from "react";
import { View } from "react-native";
import { SkeletonBlock } from "../Skeleton";

/** A chat thread's placeholder while its history loads: two replies around a question. */
export function ChatSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <SkeletonBlock width="70%" height={64} radius={20} />
      <SkeletonBlock width="55%" height={44} radius={20} style={{ alignSelf: "flex-end" }} />
      <SkeletonBlock width="80%" height={84} radius={20} />
    </View>
  );
}
