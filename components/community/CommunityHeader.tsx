import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SearchBar } from "../SearchBar";
import { useTheme } from "../theme";
import { getShadow } from "../ui-tokens";
import { COMMUNITY_CATEGORIES } from "./types";
import { Icon } from "../Icon";

/** Title row, the optional search field and the tag/category filter chips. */
export function CommunityHeader({
  search,
  onSearch,
  activeCategory,
  onCategoryChange,
  activeTag,
  onClearTag,
}: {
  /** The submitted search ("" = none). */
  search: string;
  onSearch: (query: string) => void;
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  activeTag: string | null;
  onClearTag: () => void;
}) {
  const { colors, isDark, fonts } = useTheme();
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchInput, setSearchInput] = useState(search);

  function toggleSearch() {
    // Closing the search also clears it, so the feed goes back to everything.
    if (searchVisible && (searchInput || search)) {
      setSearchInput("");
      onSearch("");
    }
    setSearchVisible(!searchVisible);
  }

  return (
    <View>
      <View className="px-6 pt-3 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text
            accessibilityRole="header"
            style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", letterSpacing: -0.3, fontFamily: fonts.heading }}
          >
            Community
          </Text>
          <Text
            style={{ color: colors.mutedText, fontSize: 13, marginTop: 1, fontFamily: fonts.body }}
          >
            Share and ask, anonymously.
          </Text>
        </View>
        <TouchableOpacity
          hitSlop={6}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={searchVisible ? "Close search" : "Search posts"}
          onPress={toggleSearch}
          className="w-9 h-9 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.surface, ...getShadow(colors, isDark) }}
        >
          <Icon set="ion"
            name={searchVisible ? "close" : "search"}
            size={17}
            color={colors.foreground}
          />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View className="px-6 mt-4">
          <SearchBar
            value={searchInput}
            onChangeText={(text) => {
              setSearchInput(text);
              // The clear button empties the field: show everything again.
              if (!text && search) onSearch("");
            }}
            onSubmit={() => onSearch(searchInput)}
            placeholder="Search community posts..."
          />
        </View>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8 }}
        className="mt-4"
      >
        {activeTag && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClearTag}
            accessibilityRole="button"
            accessibilityLabel={`Clear tag filter ${activeTag}`}
            className="rounded-full pl-4 pr-3 py-2 flex-row items-center gap-1"
            style={{ backgroundColor: colors.primary }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: colors.buttonText, fontFamily: fonts.body }}
            >
              #{activeTag}
            </Text>
            <Icon set="ion" name="close" size={14} color={colors.buttonText} />
          </TouchableOpacity>
        )}
        {["All", ...COMMUNITY_CATEGORIES].map((chip) => {
          const isActive = chip === "All" ? activeCategory === null : activeCategory === chip;
          return (
            <TouchableOpacity
              key={chip}
              activeOpacity={0.85}
              onPress={() => onCategoryChange(chip === "All" ? null : chip)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              className="rounded-full px-4 py-2"
              style={{
                backgroundColor: isActive ? colors.primary : colors.surface,
                borderWidth: isActive ? 0 : 1,
                borderColor: colors.border,
              }}
            >
              <Text
                className="text-xs font-bold"
                style={{
                  color: isActive ? colors.buttonText : colors.foreground,
                  fontFamily: fonts.body,
                }}
              >
                {chip}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
