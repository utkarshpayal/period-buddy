import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { motion } from "./motion";

function initialsOf(name: string): string {
  const parts = name.replace(/^dr\.?\s+/i, "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return [first, last].filter(Boolean).join("").toUpperCase() || "DR";
}

/**
 * A gynecologist's profile photo (Doctor.avatarUrl, set in the clinician
 * portal), or their initials when there's none or it fails to load.
 */
export function DoctorPhoto({
  name,
  uri,
  size = 44,
  backgroundColor,
  textColor,
  fontFamily,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  backgroundColor: string;
  textColor: string;
  fontFamily?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {uri && !failed ? (
        <Image
          transition={motion.duration.base}
          source={{ uri }}
          style={{ width: size, height: size }}
          contentFit="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={{ color: textColor, fontFamily, fontSize: Math.round(size * 0.34), fontWeight: "700" }}>
          {initialsOf(name)}
        </Text>
      )}
    </View>
  );
}
