import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, { SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppModalHost } from "../modals/AppModalHost";
import { documentsLayout } from "./documentMeta";
import { useContentWidth } from "../../lib/layout";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { motion } from "../motion";
import { Button } from "../Button";
import { Chip } from "../Chip";

/**
 * Bottom sheet used by the Documents feature (upload, summarize, doctor
 * report): dimmed backdrop that fades, sheet that slides up, grab handle,
 * title header with a close button, scrollable body and an optional
 * pinned footer. `locked` blocks closing while something is in flight.
 * `overlay` is rendered inside the Modal (e.g. a CalendarModal), so it can
 * present on top of the sheet.
 */
export function DocumentSheet({
  visible,
  onClose,
  title,
  subtitle,
  locked = false,
  children,
  footer,
  overlay,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  locked?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
  overlay?: React.ReactNode;
}) {
  const { colors, isDark, fonts } = useTheme();
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
          entering={SlideInDown.duration(motion.duration.slow)}
          accessibilityViewIsModal
          style={{
            // Dark: lift the sheet off the dimmed page (surface + hairline edge).
            backgroundColor: isDark ? colors.surface : colors.background,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: isDark ? 1 : 0,
            borderBottomWidth: 0,
            borderColor: colors.border,
            paddingTop: 10,
            maxHeight: "90%",
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />

          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: gutter }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                accessibilityRole="header"
                numberOfLines={1}
                maxFontSizeMultiplier={1.4}
                style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, fontFamily: fonts.heading }}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text numberOfLines={2} maxFontSizeMultiplier={1.4} style={{ fontSize: 13, lineHeight: 18, color: colors.mutedText, fontFamily: fonts.body, marginTop: 3 }}>
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
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceSoft, opacity: locked ? 0.4 : 1 }}
            >
              <Icon set="ion" name="close" size={18} color={colors.foreground} />
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

/** Quiet field label used inside the sheets. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ fontSize: 13, fontWeight: "600", color: colors.mutedText, fontFamily: fonts.body, marginBottom: 8 }}>{children}</Text>
  );
}

/** Tappable field showing a date (or a placeholder), opens a calendar. */
export function DateField({ value, placeholder, onPress, label }: { value: string; placeholder: string; onPress: () => void; label?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ? `${label}: ${value || placeholder}` : value || placeholder}
      style={{
        justifyContent: "center",
        paddingHorizontal: 14,
        minHeight: label ? 56 : 48,
        borderRadius: 12,
        backgroundColor: colors.input,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {label ? (
        <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 12, color: colors.mutedText, fontFamily: fonts.body }}>
          {label}
        </Text>
      ) : null}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ fontSize: 15, fontWeight: value ? "600" : "400", color: value ? colors.foreground : colors.mutedText, fontFamily: fonts.body, marginTop: label ? 2 : 0 }}
      >
        {value || placeholder}
      </Text>
    </TouchableOpacity>
  );
}

/** Wide primary button with a spinner state. */
export function SheetButton({
  label,
  onPress,
  disabled,
  loading,
  loadingLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <Button label={loading ? loadingLabel ?? label : label} size="md" onPress={onPress} disabled={disabled && !loading} loading={loading} accessibilityLabel={label} fullWidth />
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
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const chips = options.map((option) => {
    const on = value === option.value;
    return (
      <Chip key={option.value} label={option.label} selected={on} onPress={() => onChange(option.value)} accessibilityRole="radio" />
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
