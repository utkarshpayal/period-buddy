import { Feather } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useViewer } from "../../hooks/useViewer";
import { isFeatureVisible } from "../../lib/appConfig";
import { searchTrackerItems, type TrackerSearchAction } from "../../lib/trackerSearch";
import { useAppConfig } from "../app-config";
import { AppModalHost } from "../modals/AppModalHost";
import { useTheme } from "../theme";
import { Icon } from "../Icon";

/**
 * The Tracker's search overlay. Picking a result closes it and hands the
 * action to the screen (`onAction`), which knows how to open today's log,
 * the cycle settings or a feature.
 */
export function TrackerSearchModal({
  visible,
  onClose,
  onAction,
}: {
  visible: boolean;
  onClose: () => void;
  onAction: (action: TrackerSearchAction) => void;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const [query, setQuery] = useState("");

  // Each open starts empty.
  useEffect(() => {
    if (visible) setQuery("");
  }, [visible]);

  const results = useMemo(
    () => searchTrackerItems(query, (key) => isFeatureVisible(config, key, viewer)),
    [query, config, viewer],
  );
  const hasQuery = query.trim().length > 0;

  const emptyText = (text: string) => (
    <View style={{ alignItems: "center", paddingTop: 60, paddingHorizontal: 24 }}>
      <Icon set="feather" name="search" size={36} color={colors.border} />
      <Text style={{ color: colors.mutedText, fontFamily: fonts.body, marginTop: 12, fontSize: 14, textAlign: "center" }}>{text}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.overlay }}>
        <View
          style={{
            backgroundColor: colors.surface,
            paddingTop: insets.top + 12,
            paddingBottom: 10,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon set="feather" name="search" size={18} color={colors.mutedText} />
          <TextInput
            autoFocus
            placeholder="Search features, symptoms, phases…"
            placeholderTextColor={colors.mutedText}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search"
            style={{ flex: 1, fontSize: 15, fontFamily: fonts.body, color: colors.foreground, padding: 0 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} accessibilityLabel="Clear search" hitSlop={8}>
              <Icon set="feather" name="x-circle" size={18} color={colors.mutedText} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={{ paddingLeft: 4 }} accessibilityRole="button">
            <Text style={{ color: colors.primary, fontFamily: fonts.body, fontWeight: "700", fontSize: 14 }}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: colors.background }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {!hasQuery ? (
            emptyText("Start typing to search features, symptoms, phases…")
          ) : results.length === 0 ? (
            emptyText(`No results for "${query.trim()}"`)
          ) : (
            <>
              <Text
                style={{
                  fontSize: 12.5,
                  fontWeight: "700",
                  color: colors.mutedText,
                  fontFamily: fonts.body,
                  paddingHorizontal: 20,
                  paddingTop: 18,
                  paddingBottom: 8,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                }}
              >
                {results.length} result{results.length === 1 ? "" : "s"}
              </Text>
              <View style={{ marginHorizontal: 12, borderRadius: 14, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.surface }}>
                {results.map((item, idx) => (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.7}
                    onPress={() => onAction(item.action)}
                    accessibilityRole="button"
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      borderBottomWidth: idx === results.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: colors.primaryLight,
                        alignItems: "center",
                        justifyContent: "center",
                        marginRight: 12,
                      }}
                    >
                      <Icon set="feather" name={item.icon as React.ComponentProps<typeof Feather>["name"]} size={16} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, fontFamily: fonts.body }}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={1} style={{ fontSize: 13, color: colors.mutedText, fontFamily: fonts.body, marginTop: 1 }}>
                        {item.desc}
                      </Text>
                    </View>
                    <Icon set="feather" name="chevron-right" size={14} color={colors.mutedText} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}
