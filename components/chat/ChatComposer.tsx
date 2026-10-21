import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ActivityIndicator, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme";
import { Icon } from "../Icon";
import { SendButton } from "../SendButton";
import { getShadow, getGlow, withAlpha } from "../ui-tokens";

/**
 * The chat input shared by Nura AI and the Document Assistant: an input pill
 * with the dictation mic inside it, then a round button on the right. That
 * button sends, unless `idleAction` is given and there's nothing typed yet
 * (Nura AI shows its "Talk with Nura" button there).
 */
export function ChatComposer({
  value,
  onChangeText,
  onSend,
  canSend,
  sending = false,
  placeholder,
  maxLength,
  micLabel,
  isRecording,
  isTranscribing,
  onMicPress,
  idleAction,
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  canSend: boolean;
  /** Shows a spinner in the send button while the reply is on its way. */
  sending?: boolean;
  placeholder: string;
  maxLength: number;
  micLabel: string;
  isRecording: boolean;
  isTranscribing: boolean;
  onMicPress: () => void;
  idleAction?: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, fonts, isDark } = useTheme();
  const showIdleAction = idleAction && !value.trim();

  return (
    <View className="flex-row items-end px-4 pt-2" style={[{ gap: 8, paddingBottom: 8 }, style]}>
      <View
        className="flex-1 flex-row items-center"
        style={{
          minHeight: 48,
          borderRadius: 24, borderCurve: "continuous",
          paddingLeft: 18,
          paddingRight: 6,
          backgroundColor: colors.surface,
          ...getShadow(colors, isDark),
          // Recording: a red ring outside the field (no border, so nothing shifts).
          ...(isRecording ? { boxShadow: `0 0 0 1.5px ${colors.danger}, 0 0 0 5px ${withAlpha(colors.danger, 0.14)}` } : null),
        }}
      >
        <TextInput
          placeholder={isRecording ? "Listening…" : isTranscribing ? "Transcribing…" : placeholder}
          placeholderTextColor={colors.mutedText}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSend}
          maxLength={maxLength}
          multiline
          returnKeyType="send"
          submitBehavior="submit"
          editable={!isRecording && !isTranscribing}
          accessibilityLabel="Message"
          className="flex-1 outline-none"
          style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, paddingVertical: 12, maxHeight: 120 }}
        />
        <TouchableOpacity
          disabled={isTranscribing}
          onPress={onMicPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={isTranscribing ? "Transcribing" : isRecording ? "Stop recording" : micLabel}
          hitSlop={6}
          className="items-center justify-center rounded-full"
          style={{ width: 36, height: 36, backgroundColor: isRecording ? colors.danger : "transparent" }}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon set="ion" name={isRecording ? "stop" : "mic-outline"} size={20} color={isRecording ? "#FFFFFF" : colors.mutedText} />
          )}
        </TouchableOpacity>
      </View>
      {showIdleAction ? (
        <TouchableOpacity
          onPress={idleAction.onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={idleAction.label}
          className="items-center justify-center rounded-full"
          style={{ width: 48, height: 48, backgroundColor: colors.primary, ...getGlow(colors.primary, isDark) }}
        >
          <Icon set="ion" name={idleAction.icon} size={21} color={colors.buttonText} />
        </TouchableOpacity>
      ) : (
        <SendButton onPress={onSend} disabled={!canSend} loading={sending} size={48} />
      )}
    </View>
  );
}
