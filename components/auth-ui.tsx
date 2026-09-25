import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { forwardRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from "react-native";
import { getShadow } from "./ui-tokens";
import { ThemeToggle, useTheme } from "./theme";

/** Back button + theme toggle row shown above the auth card. */
export function AuthTopBar() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <View className="flex-row items-center justify-between px-5 pt-1 pb-3">
      <TouchableOpacity
        accessibilityLabel="Go back"
        accessibilityRole="button"
        activeOpacity={0.85}
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        className="items-center justify-center rounded-full border"
        style={{
          width: 38,
          height: 38,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }}
      >
        <Ionicons name="chevron-back" size={18} color={colors.foreground} />
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
      className="items-center justify-center rounded-[28px] border overflow-hidden"
      style={{
        width: 94,
        height: 94,
        backgroundColor: colors.surface,
        borderColor: colors.border,
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
      className="w-full flex-row items-center border"
      style={{
        backgroundColor: colors.input,
        borderColor: isFocused ? colors.primary : colors.border,
        borderWidth: isFocused ? 1.5 : 1,
        borderRadius: 14,
        height: 52,
        paddingHorizontal: 14,
      }}
    >
      <Ionicons
        name={icon}
        size={17}
        color={isFocused ? colors.primary : colors.mutedText}
        style={{ marginRight: 10 }}
      />
      <TextInput
        ref={ref}
        placeholderTextColor={colors.mutedText}
        secureTextEntry={isPassword ? isSecure : undefined}
        className="flex-1 text-sm outline-none font-semibold"
        style={[
          { height: "100%", paddingVertical: 0, color: colors.foreground, fontFamily: fonts.body },
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
        {...inputProps}
      />
      {isPassword ? (
        <TouchableOpacity
          accessibilityLabel={isSecure ? "Show password" : "Hide password"}
          hitSlop={8}
          onPress={() => setIsSecure((value) => !value)}
        >
          <Ionicons
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
  const { colors, fonts } = useTheme();
  const isBusy = Boolean(disabled || isLoading);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      disabled={isBusy}
      onPress={onPress}
      className="justify-center items-center"
      style={{
        height: 46,
        borderRadius: 12,
        backgroundColor: colors.primary,
        opacity: isBusy ? 0.75 : 1,
      }}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.buttonText} />
      ) : (
        <Text
          style={{
            fontSize: 14,
            fontWeight: "800",
            color: colors.buttonText,
            fontFamily: fonts.body,
          }}
        >
          {loadingLabel && isLoading ? loadingLabel : label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/** "OR CONTINUE WITH" divider between password auth and Google sign-in. */
export function AuthDivider() {
  const { colors, fonts } = useTheme();

  return (
    <View className="flex-row items-center" style={{ marginVertical: 18 }}>
      <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
      <Text
        className="mx-3 font-semibold"
        style={{ fontSize: 10, color: colors.mutedText, letterSpacing: 0.4, fontFamily: fonts.body }}
      >
        OR CONTINUE WITH
      </Text>
      <View className="h-[1px] flex-1" style={{ backgroundColor: colors.border }} />
    </View>
  );
}

/** Inline error banner shown below the form. */
export function AuthErrorBanner({ message }: { message: string }) {
  const { colors, fonts } = useTheme();

  return (
    <View
      className="mb-5 flex-row items-center gap-2 rounded-xl border px-3.5 py-3"
      style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
    >
      <Ionicons name="alert-circle" size={15} color={colors.danger} />
      <Text
        className="flex-1 text-xs font-bold"
        style={{ color: colors.danger, fontFamily: fonts.body }}
      >
        {message}
      </Text>
    </View>
  );
}
