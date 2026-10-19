import React, { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { filterIndianStates } from "../../lib/schemeHelpers";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

/** A field that expands into a searchable list of Indian states and UTs. */
export function StatePicker({
  value,
  onChange,
  open,
  onOpenChange,
}: {
  value: string;
  onChange: (state: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { colors, fonts } = useTheme();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filterIndianStates(query), [query]);

  const toggle = () => {
    if (open) setQuery("");
    onOpenChange(!open);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={value ? `Your state: ${value}. Change` : "Choose your state"}
        accessibilityState={{ expanded: open }}
        className="flex-row items-center"
        style={{
          height: 48,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: open ? colors.primary : colors.border,
          paddingHorizontal: 14,
          gap: 8,
          backgroundColor: colors.surface,
        }}
      >
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={{ flex: 1, fontSize: 15, fontWeight: "400", color: value ? colors.foreground : colors.mutedText, fontFamily: fonts.body }}
        >
          {value || "Choose your state"}
        </Text>
        <Icon set="ion" name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.mutedText} />
      </TouchableOpacity>
      {open ? (
        <View
          style={{
            marginTop: 8,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            overflow: "hidden",
          }}
        >
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search states"
            placeholderTextColor={colors.mutedText}
            accessibilityLabel="Search states"
            autoCorrect={false}
            maxFontSizeMultiplier={1.4}
            style={{
              height: 44,
              paddingHorizontal: 14,
              fontSize: 15,
              borderBottomWidth: 1,
              borderColor: colors.border,
              color: colors.foreground,
              fontFamily: fonts.body,
            }}
          />
          <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {matches.length === 0 ? (
              <Text style={{ padding: 14, fontSize: 14, fontWeight: "400", color: colors.mutedText, fontFamily: fonts.body }}>
                No state matches “{query.trim()}”.
              </Text>
            ) : (
              matches.map((name) => {
                const selected = name === value;
                return (
                  <TouchableOpacity
                    key={name}
                    activeOpacity={0.7}
                    onPress={() => {
                      onChange(name);
                      onOpenChange(false);
                      setQuery("");
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    accessibilityState={{ selected }}
                    className="flex-row items-center"
                    style={{
                      minHeight: 44,
                      paddingHorizontal: 14,
                      gap: 8,
                      backgroundColor: selected ? colors.primaryLight : "transparent",
                    }}
                  >
                    <Text
                      numberOfLines={2}
                      style={{ flex: 1, fontSize: 15, fontWeight: selected ? "700" : "400", color: selected ? colors.primaryDark : colors.foreground, fontFamily: fonts.body }}
                    >
                      {name}
                    </Text>
                    {selected ? <Icon set="ion" name="checkmark" size={18} color={colors.primaryDark} /> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      ) : null}
    </>
  );
}
