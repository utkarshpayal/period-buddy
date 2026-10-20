// App code's `import ... from "react-native"` resolves here (see metro.config.js).
// Everything passes through untouched except Text and TextInput, which get
// Manrope as their default font, and TouchableOpacity, whose default press
// dim (0.2) is a harsh flash; an explicit activeOpacity still wins. React 19 ignores `defaultProps` on function
// components, so `Text.defaultProps = { style: ... }` no longer does anything,
// and any Text without an explicit `fontFamily` rendered in Roboto/SF.
// An explicit fontFamily in `style` still wins, since it comes after the default.
// Written as JSX on purpose: NativeWind's JSX runtime then turns `className` on
// the inner Text into styles, exactly as it did before.
import React from "react";
import * as RN from "react-native";

const DEFAULT_FONT = { fontFamily: "Manrope" };

function Text(props: React.ComponentProps<typeof RN.Text>) {
  return <RN.Text {...props} style={[DEFAULT_FONT, props.style]} />;
}
Text.displayName = "Text";

function TextInput(props: React.ComponentProps<typeof RN.TextInput>) {
  return <RN.TextInput {...props} style={[DEFAULT_FONT, props.style]} />;
}
TextInput.displayName = "TextInput";
// Static helper some code reaches for (TextInput.State.currentlyFocusedInput()).
TextInput.State = RN.TextInput.State;

// One soft dim for every tap that doesn't pick its own.
const DEFAULT_ACTIVE_OPACITY = 0.7;

function TouchableOpacity(props: React.ComponentProps<typeof RN.TouchableOpacity>) {
  return <RN.TouchableOpacity activeOpacity={DEFAULT_ACTIVE_OPACITY} {...props} />;
}
TouchableOpacity.displayName = "TouchableOpacity";

const overrides: Record<string, unknown> = { Text, TextInput, TouchableOpacity };

module.exports = new Proxy(RN, {
  get(target, key) {
    if (typeof key === "string" && key in overrides) return overrides[key];
    return (target as Record<string | symbol, unknown>)[key];
  },
  // `import * as X from "react-native"` copies properties by descriptor.
  getOwnPropertyDescriptor(target, key) {
    if (typeof key === "string" && key in overrides) {
      return { value: overrides[key], enumerable: true, configurable: true, writable: false };
    }
    return Reflect.getOwnPropertyDescriptor(target, key);
  },
});
