import React, { useState } from "react";
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
};

// Drop-in Pressable that resolves `style={({ pressed }) => ...}` itself and
// hands Pressable a plain style. NativeWind's Pressable interop drops function
// styles in release builds (the whole style vanishes: no background, height or
// centring), so any Pressable with a pressed-state style should use this.
export default function PressableFeedback({ style, onPressIn, onPressOut, ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        setPressed(false);
        onPressOut?.(e);
      }}
      style={typeof style === "function" ? style({ pressed }) : style}
    />
  );
}
