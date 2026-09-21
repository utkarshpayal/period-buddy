import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Language, LanguageCode } from "../lib/api";
import { useTheme } from "./theme";

export type LanguagePickerSheetProps = {
  languages: Language[];
  onClose: () => void;
  onSelect: (code: LanguageCode) => void;
  selectedCode: LanguageCode;
  title: string;
  visible: boolean;
};

/**
 * Shared bottom-sheet language picker — was hand-rolled near-identically in
 * qa.tsx, blogs.tsx, and document-chat.tsx (drifting copy, same underlying
 * logic). Callers own any side effect beyond selecting the code itself (e.g.
 * blogs.tsx clearing a cached translation) via `onSelect`.
 */
export function LanguagePickerSheet({
  languages,
  onClose,
  onSelect,
  selectedCode,
  title,
  visible,
}: LanguagePickerSheetProps) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          onPress={onClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.overlay }}
        />
        <View
          className="rounded-t-3xl border p-4"
          style={{ backgroundColor: colors.surface, borderColor: colors.border, paddingBottom: Math.max(16, insets.bottom + 10) }}
        >
          <View className="items-center mb-3">
            <View className="rounded-full" style={{ backgroundColor: colors.border, height: 4, width: 42 }} />
          </View>
          <Text className="text-sm font-black mb-3" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            {title}
          </Text>
          <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
            {languages.map((item) => (
              <TouchableOpacity
                key={item.code}
                onPress={() => {
                  onSelect(item.code);
                  onClose();
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Set language to ${item.label}`}
                className="flex-row items-center justify-between py-3 px-1"
              >
                <Text className="text-xs font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                  {item.label}
                </Text>
                {item.code === selectedCode ? <Feather name="check" size={16} color={colors.primary} /> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
