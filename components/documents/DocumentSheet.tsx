import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppModalHost } from "../modals/AppModalHost";
import { documentsLayout } from "./documentMeta";
import { useContentWidth } from "../../lib/layout";
import { useTheme } from "../theme";

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Bottom sheet used by the Documents feature (upload, summarize, doctor
 * report): dimmed backdrop that fades, sheet that slides up, grab handle,
 * icon + title header with a close button, scrollable body and an optional
 * pinned footer. `locked` blocks closing while something is in flight.
 * `overlay` is rendered inside the Modal (e.g. a CalendarModal), so it can
 * present on top of the sheet.
 */
export function DocumentSheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  iconColor,
  iconBg,
  locked = false,
  children,
  footer,
  overlay,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon: IconName;
  iconColor: string;
  iconBg: string;
  locked?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const { gutter } = documentsLayout(useContentWidth());
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!locked) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.overlay }}
        />
        <Animated.View
          entering={SlideInDown.duration(300)}
          accessibilityViewIsModal
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            paddingTop: 10,
            maxHeight: "90%",
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: gutter }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: iconBg }}>
              <Ionicons name={icon} size={20} color={iconColor} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity
              onPress={close}
              disabled={locked}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.surfaceSoft,
                opacity: locked ? 0.4 : 1,
              }}
            >
              <Ionicons name="close" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: 20, paddingBottom: footer ? 8 : Math.max(20, insets.bottom + 12) }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>

          {footer ? (
            <View style={{ paddingHorizontal: gutter, paddingTop: 8, paddingBottom: Math.max(20, insets.bottom + 12) }}>{footer}</View>
          ) : null}
        </Animated.View>
      </KeyboardAvoidingView>
      {overlay}
      {/* Alerts raised while the sheet is open draw over it. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}

/** Small uppercase-free field label used inside the sheets. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body, marginBottom: 8 }}>{children}</Text>
  );
}

/** Tappable field showing a date (or a placeholder), opens a calendar. */
export function DateField({ value, placeholder, onPress, label }: { value: string; placeholder: string; onPress: () => void; label?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label}: ${value || placeholder}` : value || placeholder}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 14,
        minHeight: label ? 58 : 50,
        borderRadius: 16,
        backgroundColor: colors.input,
        borderWidth: 1,
        borderColor: value ? colors.primary : colors.border,
      }}
    >
      <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: value ? colors.primaryLight : colors.surfaceSoft }}>
        <Ionicons name="calendar-outline" size={15} color={value ? colors.primaryDark : colors.mutedText} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {label ? (
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: colors.mutedText, fontFamily: fonts.body }}>
            {label}
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 15, fontWeight: value ? "700" : "400", color: value ? colors.foreground : colors.mutedText, fontFamily: fonts.body, marginTop: label ? 1 : 0 }}
        >
          {value || placeholder}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

/** Wide primary button with a spinner state. */
export function SheetButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  loadingLabel,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  const { colors, fonts } = useTheme();
  const off = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      style={{
        height: 54,
        borderRadius: 18,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: disabled && !loading ? colors.border : colors.primary,
        opacity: loading ? 0.85 : 1,
      }}
    >
      {loading ? null : icon ? <Ionicons name={icon} size={18} color={disabled ? colors.mutedText : colors.buttonText} /> : null}
      <Text style={{ fontSize: 15, fontWeight: "800", color: disabled && !loading ? colors.mutedText : colors.buttonText, fontFamily: fonts.body }}>
        {loading ? loadingLabel ?? label : label}
      </Text>
    </TouchableOpacity>
  );
}

/** Wrapping row of selectable pills. */
export function ChoiceChips<T extends string>({
  value,
  options,
  onChange,
  scroll = false,
}: {
  value: T | null;
  options: { value: T; label: string; icon?: IconName; color?: string; bg?: string }[];
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const { colors, fonts } = useTheme();
  const chips = options.map((option) => {
    const on = value === option.value;
    const tint = option.color ?? colors.primary;
    return (
      <TouchableOpacity
        key={option.value}
        onPress={() => onChange(option.value)}
        activeOpacity={0.8}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={option.label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 14,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: on ? tint : colors.border,
          backgroundColor: on ? option.bg ?? colors.primaryLight : colors.surface,
        }}
      >
        {option.icon ? <Ionicons name={option.icon} size={15} color={on ? tint : colors.mutedText} /> : null}
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={{ fontSize: 13, fontWeight: "700", color: on ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    );
  });
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{chips}</View>;
}
