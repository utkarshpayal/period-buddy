import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { forwardRef, useState } from "react";
import {
  Image,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { getShadow, withAlpha } from "./ui-tokens";
import { ThemeToggle, useTheme } from "./theme";
import { Button } from "./Button";
import { Icon } from "./Icon";

/** Back button + theme toggle row shown above the auth card. */
export function AuthTopBar() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  return (
    <View className="flex-row items-center justify-between px-5 pt-1 pb-3">
      <TouchableOpacity
        hitSlop={5}
        accessibilityLabel="Go back"
        accessibilityRole="button"
        activeOpacity={0.85}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        className="items-center justify-center rounded-full"
        style={{
          width: 44,
          height: 44,
          backgroundColor: colors.surface,
          ...getShadow(colors, isDark),
        }}
      >
        <Icon set="ion" name="chevron-back" size={18} color={colors.foreground} />
      </TouchableOpacity>
      <ThemeToggle />
    </View>
  );
}

/** Brand mark shown at the top of the auth card. */
export function AuthBrandMark() {
  const { colors, isDark } = useTheme();

  return (
    <View
      className="items-center justify-center overflow-hidden"
      style={{
        width: 96,
        height: 96,
        borderRadius: 30,
        borderCurve: "continuous",
        backgroundColor: colors.surface,
        ...getShadow(colors, isDark),
      }}
    >
      <Image
        source={require("../assets/images/brand/logo-mark.png")}
        resizeMode="contain"
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

type AuthFieldProps = TextInputProps & {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  isPassword?: boolean;
};

/** Text field with a left icon, focus ring, and optional password-visibility toggle. */
export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { icon, isPassword, style, ...inputProps },
  ref,
) {
  const { colors, fonts } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecure, setIsSecure] = useState(Boolean(isPassword));

  return (
    <View
      className="w-full flex-row items-center"
      style={{
        backgroundColor: isFocused ? colors.surface : colors.input,
        borderColor: isFocused ? colors.primary : colors.border,
        // Same border width either way so focusing never nudges the text;
        // the focus halo is a spread shadow outside the field.
        borderWidth: 1.5,
        borderRadius: 16,
        borderCurve: "continuous",
        height: 54,
        paddingHorizontal: 16,
        boxShadow: isFocused ? `0 0 0 4px ${withAlpha(colors.primary, 0.14)}` : undefined,
      }}
    >
      <Icon set="ion"
        name={icon}
        size={18}
        color={isFocused ? colors.primary : colors.mutedText}
        style={{ marginRight: 12 }}
      />
      <TextInput
        // Screen readers announce only the typed value once a field is filled,
        // so the placeholder doubles as the field's name unless one is passed.
        accessibilityLabel={typeof inputProps.placeholder === "string" ? inputProps.placeholder : undefined}
        {...inputProps}
        ref={ref}
        placeholderTextColor={colors.mutedText}
        secureTextEntry={isPassword ? isSecure : undefined}
        className="flex-1 outline-none font-semibold"
        style={[
          { height: "100%", paddingVertical: 0, fontSize: 15, color: colors.foreground, fontFamily: fonts.body },
          style,
        ]}
        onFocus={(e) => {
          setIsFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          inputProps.onBlur?.(e);
        }}
      />
      {isPassword ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isSecure ? "Show password" : "Hide password"}
          hitSlop={15}
          onPress={() => setIsSecure((value) => !value)}
        >
          <Icon set="ion"
            name={isSecure ? "eye-outline" : "eye-off-outline"}
            size={17}
            color={colors.mutedText}
          />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

type AuthPrimaryButtonProps = {
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  loadingLabel?: string;
  onPress: () => void;
};

/** Primary call-to-action button used for the main auth action. */
export function AuthPrimaryButton({
  disabled,
  isLoading,
  label,
  loadingLabel,
  onPress,
}: AuthPrimaryButtonProps) {
  return (
    <Button
      label={loadingLabel && isLoading ? loadingLabel : label}
      onPress={onPress}
      disabled={disabled && !isLoading}
      loading={isLoading}
      fullWidth
    />
  );
}

/** "OR CONTINUE WITH" divider between password auth and Google sign-in. */
export function AuthDivider({ label = "OR CONTINUE WITH" }: { label?: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View className="flex-row items-center" style={{ marginVertical: 18 }}>
      <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
      <Text
        className="mx-3 font-semibold"
        style={{ fontSize: 13.5, color: colors.mutedText, letterSpacing: 0.4, fontFamily: fonts.body }}
      >
        {label}
      </Text>
      <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
    </View>
  );
}
