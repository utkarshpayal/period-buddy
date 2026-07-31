import React from "react";
import { Image, Text, View, type ViewStyle } from "react-native";

type AvatarProps = {
  uri?: string;
  name: string;
  size?: number;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  textColor?: string;
  fontFamily?: string;
  style?: ViewStyle;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0];
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return [first, last].filter(Boolean).join("").toUpperCase() || "N";
}

/**
 * Profile picture with an initials fallback (first+last initial, uppercase,
 * "N" default) — matches the logic previously hand-rolled in profile.tsx.
 */
export default function Avatar({
  uri,
  name,
  size = 112,
  backgroundColor,
  borderColor,
  borderWidth,
  textColor,
  fontFamily,
  style,
}: AvatarProps) {
  const initials = getInitials(name);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth,
        borderColor,
        // Soft outer glow ring around the circle, matching the mockup's
        // avatar treatment (a diffuse shadow rather than a hard border).
        shadowColor: borderColor ?? backgroundColor,
        shadowOpacity: 0.35,
        shadowRadius: Math.max(8, size * 0.14),
        shadowOffset: { width: 0, height: Math.max(4, size * 0.05) },
        elevation: 4,
        ...style,
      }}
    >
      <View
        style={{
          width: "100%",
          height: "100%",
          borderRadius: size / 2,
          backgroundColor,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <Text
            style={{
              fontSize: Math.round(size * 0.27),
              fontWeight: "900",
              color: textColor,
              fontFamily,
            }}
          >
            {initials}
          </Text>
        )}
      </View>
    </View>
  );
}
