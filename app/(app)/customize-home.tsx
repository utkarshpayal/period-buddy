import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppConfig } from "../../components/app-config";
import { EmptyState } from "../../components/EmptyState";
import { genZLabel, useGenZMode } from "../../components/genz-mode";
import { useHomeLayout } from "../../components/home-layout";
import { HomeShortcuts } from "../../components/HomeShortcuts";
import { HeaderIconButton, ScreenHeader, SectionHeader } from "../../components/ScreenHeader";
import { ThemeColors, useTheme } from "../../components/theme";
import { useViewer } from "../../hooks/useViewer";
import { alert } from "../../lib/alert";
import { useContentWidth } from "../../lib/layout";
import { FEATURE_REGISTRY, HomeSectionKey, HubTile, TILE_COLOR_KEYS, shownSections } from "../../lib/appConfig";
import {
  BLOCK_SETTINGS,
  CUSTOMIZABLE_BLOCKS,
  DEFAULT_HOME_LAYOUT,
  HOME_PRESETS,
  ICON_CHOICES,
  LABEL_MAX,
  MAX_SHORTCUTS,
  SHORTCUT_LOOKS,
  TITLE_MAX,
  activePreset,
  applyPreset,
  presetBlockLabels,
  blockItems,
  isCustomizable,
  isDefaultLayout,
  moveKey,
  orderedBlocks,
  pickableTiles,
  shortcutStyle,
  shortcutTiles,
  styledShortcuts,
  toggleBlockItem,
  withBlockOptions,
  withShortcutStyle,
  withShortcuts,
} from "../../lib/homeLayout";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Icon } from "../../components/Icon";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const tint = (colors: ThemeColors, key: HubTile["colorKey"]) => ({
  color: colors[key],
  bg: colors[`${key}Light` as keyof ThemeColors],
});

/**
 * Profile → Customize Home: the person's own Home. They can
 * - start from a preset, then hide, show and reorder every block,
 * - rename block headings and pick each list block's items (stats,
 *   quick-log buttons, hub areas),
 * - pick their Shortcuts from any feature, and give each its own look
 *   (icon / tile / card), colour, name and icon.
 * Saved to their account as they go (components/home-layout.tsx); only what
 * the App CMS shows them is offered (lib/homeLayout.ts).
 */
export default function CustomizeHome() {
  const { colors, fonts, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { enabled: genZ } = useGenZMode();
  const { config } = useAppConfig();
  const viewer = useViewer();
  const { layout, setLayout } = useHomeLayout();
  // Text boxes may commit as they unmount, after a newer layout was rendered.
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  // The one block or shortcut whose options are open.
  const [openBlock, setOpenBlock] = useState<HomeSectionKey | null>(null);
  const [styling, setStyling] = useState<string | null>(null);

  const cmsKeys = shownSections(config, "home", viewer)
    .map((s) => s.key)
    .filter(isCustomizable);
  const blocks = orderedBlocks(cmsKeys, layout)
    .map((key) => CUSTOMIZABLE_BLOCKS.find((b) => b.key === key))
    .filter((b): b is (typeof CUSTOMIZABLE_BLOCKS)[number] => Boolean(b));
  const shortcutsShown = cmsKeys.includes("shortcuts") && !layout.hidden.includes("shortcuts");
  const preset = activePreset(layout);

  // `own` is each tile as the CMS draws it, which "picking it again" goes back to.
  const own = new Map(shortcutTiles(config, viewer, layout).map((t) => [t.key, t]));
  const picked = styledShortcuts(config, viewer, layout);
  const pickedKeys = picked.map((t) => t.key);
  const full = pickedKeys.length >= MAX_SHORTCUTS;
  const groups = pickableTiles(config, viewer)
    .map((g) => ({ ...g, tiles: g.tiles.filter((t) => !pickedKeys.includes(t.key)) }))
    .filter((g) => g.tiles.length > 0);

  const label = (tile: HubTile) => (tile.builtIn ? genZLabel(tile.title, genZ) : tile.title);

  const toggleBlock = (key: HomeSectionKey, on: boolean) =>
    setLayout({ ...layout, hidden: on ? layout.hidden.filter((k) => k !== key) : [...layout.hidden, key] });
  const moveBlock = (key: HomeSectionKey, dir: -1 | 1) => setLayout({ ...layout, order: moveKey(blocks.map((b) => b.key), key, dir) });
  const setShortcuts = (keys: string[]) => setLayout(withShortcuts(layout, keys));
  const addShortcut = (key: string) => {
    setShortcuts([...pickedKeys, key]);
    setStyling(key);
  };

  // A template replaces blocks, headings, picks and (if it has them) shortcuts
  // and their styles, so ask first unless there's nothing of their own to lose.
  const applyTemplate = (p: (typeof HOME_PRESETS)[number]) => {
    const apply = () => setLayout(applyPreset(layout, p));
    if (preset === p.key || isDefaultLayout(layout)) return apply();
    alert(
      `Use “${p.label}”?`,
      p.shortcuts
        ? "It replaces your blocks, headings, picks and shortcuts. You can change them again afterwards."
        : "It replaces your blocks, headings and picks. You can change them again afterwards.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Use template", onPress: apply },
      ],
    );
  };

  const reset = () =>
    alert("Reset Home?", "Everything on Home goes back to the standard layout, shortcuts and names.", [
      { text: "Cancel", style: "cancel" },
      { text: "Reset", style: "destructive", onPress: () => setLayout(DEFAULT_HOME_LAYOUT) },
    ]);

  const card = { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: "hidden" as const };
  // On narrow phones the name needs the room more than the icon does.
  const compact = useContentWidth() < 360;
  const divider = <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: compact ? 16 : 16 + 36 + 12 }} />;
  const panel = { paddingLeft: compact ? 16 : 16 + 36 + 12, paddingRight: 16, paddingBottom: 14, gap: 12 };
  const row = { flexDirection: "row" as const, alignItems: "center" as const, paddingLeft: 16, paddingRight: 10, paddingVertical: 11 };
  const caption = { color: colors.mutedText, fontSize: 12, fontWeight: "700" as const, fontFamily: fonts.body, letterSpacing: 0.3 };

  const sectionTitle = (title: string, hint?: string) => (
    <View style={{ marginTop: 22, marginBottom: 10 }}>
      <SectionHeader title={title} style={{ marginHorizontal: 24 }} />
      {hint ? <Text style={{ marginHorizontal: 24, marginTop: 4, color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>{hint}</Text> : null}
    </View>
  );
  const iconBox = (icon: IconName, color: string, bg: string, dim = false, always = false) =>
    compact && !always ? null : (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: bg, alignItems: "center", justifyContent: "center", marginRight: 12, opacity: dim ? 0.5 : 1 }}>
      <Icon set="ion" name={icon} size={18} color={color} />
    </View>
  );
  const smallButton = (icon: IconName, a11y: string, onPress: () => void, disabled = false, color = colors.mutedText) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.3 : 1 }}
    >
      <Icon set="ion" name={icon} size={18} color={color} />
    </TouchableOpacity>
  );
  /** Up/down stacked in one column, so a row keeps its width for the name. */
  const reorder = (name: string, onMove: (dir: -1 | 1) => void, first: boolean, last: boolean) => (
    <View style={{ width: 34, alignItems: "center" }}>
      {(
        [
          [-1, "chevron-up", `Move ${name} up`, first],
          [1, "chevron-down", `Move ${name} down`, last],
        ] as const
      ).map(([dir, icon, a11y, disabled]) => (
        <TouchableOpacity
          key={dir}
          onPress={() => onMove(dir)}
          disabled={disabled}
          hitSlop={{ left: 8, right: 8, top: dir === -1 ? 8 : 0, bottom: dir === 1 ? 8 : 0 }}
          accessibilityRole="button"
          accessibilityLabel={a11y}
          accessibilityState={{ disabled }}
          style={{ height: 26, width: 34, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.25 : 1 }}
        >
          <Icon set="ion" name={icon} size={17} color={colors.mutedText} />
        </TouchableOpacity>
      ))}
    </View>
  );
  const rowText = (title: string, sub: string, dim = false) => (
    <View style={{ flex: 1, marginRight: 8, opacity: dim ? 0.55 : 1 }}>
      <Text numberOfLines={1} style={{ color: colors.foreground, fontSize: 14.5, fontWeight: "700", fontFamily: fonts.body }}>
        {title}
      </Text>
      {sub ? (
        <Text numberOfLines={1} style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
  /** A pill that's on or off; `badge` numbers picks so their order is visible. */
  const chip = (key: string, text: string, icon: IconName | null, on: boolean, onPress: () => void, badge?: number, disabled = false) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={badge ? `${text}, number ${badge}` : text}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 11,
        paddingVertical: 7,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? colors.primary : colors.border,
        backgroundColor: on ? colors.primaryLight : colors.surface,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {badge ? (
        <View style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.buttonText, fontSize: 10.5, fontWeight: "800", fontFamily: fonts.mono }}>{badge}</Text>
        </View>
      ) : icon ? (
        <Icon set="ion" name={icon} size={14} color={on ? colors.primary : colors.mutedText} />
      ) : null}
      <Text style={{ fontSize: 13, fontWeight: "700", color: on ? colors.primary : colors.foreground, fontFamily: fonts.body }}>{text}</Text>
    </TouchableOpacity>
  );

  const blockPanel = (key: HomeSectionKey) => {
    const settings = BLOCK_SETTINGS[key];
    if (!settings) return null;
    const items = blockItems(layout, key);
    return (
      <View style={panel}>
        {settings.title ? (
          <View style={{ gap: 6 }}>
            <Text style={caption}>HEADING</Text>
            <TextField
              value={layout.blocks[key]?.title ?? ""}
              placeholder={settings.title.fallback ?? "No heading"}
              maxLength={TITLE_MAX}
              accessibilityLabel="Heading"
              onCommit={(title) => setLayout(withBlockOptions(layoutRef.current, key, { title }))}
            />
          </View>
        ) : null}
        {settings.items ? (
          <View style={{ gap: 8 }}>
            <Text style={caption}>
              {settings.items.label.toUpperCase()} · PICK {settings.items.min}–{settings.items.max}, IN ORDER
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {settings.items.options.map((o) => {
                const at = items.indexOf(o.key);
                const on = at >= 0;
                const blocked = on ? items.length <= settings.items!.min : items.length >= settings.items!.max;
                return chip(o.key, o.label, o.icon as IconName, on, () => setLayout(toggleBlockItem(layout, key, o.key)), on ? at + 1 : undefined, blocked);
              })}
            </View>
          </View>
        ) : null}
        {layout.blocks[key] ? (
          <TouchableOpacity onPress={() => setLayout(withBlockOptions(layout, key, { title: null, items: null }))} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>Use defaults</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const shortcutPanel = (tile: (typeof picked)[number]) => {
    const style = shortcutStyle(layout, tile.key);
    const original = own.get(tile.key);
    const set = (patch: Parameters<typeof withShortcutStyle>[2]) => setLayout(withShortcutStyle(layout, tile.key, patch));
    return (
      <View style={panel}>
        <View style={{ gap: 6 }}>
          <Text style={caption}>NAME</Text>
          <TextField
            value={style.label ?? ""}
            placeholder={original ? label(original) : tile.title}
            maxLength={LABEL_MAX}
            accessibilityLabel="Shortcut name"
            onCommit={(text) => {
              const current = layoutRef.current;
              // Removed while its name was being typed.
              if (current.shortcuts && !current.shortcuts.includes(tile.key)) return;
              setLayout(withShortcutStyle(current, tile.key, { label: text }));
            }}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={caption}>LOOK</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {SHORTCUT_LOOKS.map((l) => chip(l.key, l.label, l.icon as IconName, style.look === l.key, () => set({ look: l.key })))}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={caption}>COLOUR</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {TILE_COLOR_KEYS.map((key) => {
              const ownKey = original?.colorKey;
              const on = (style.color ?? ownKey) === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => set({ color: key === ownKey ? null : key })}
                  hitSlop={6}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${key} colour${key === ownKey ? " (original)" : ""}`}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: colors[key],
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: on ? 2 : 0,
                    borderColor: colors.foreground,
                  }}
                >
                  {on ? <Icon set="ion" name="checkmark" size={15} color="#FFFFFF" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={caption}>ICON</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[original?.icon ?? tile.icon, ...ICON_CHOICES.filter((i) => i !== original?.icon)].map((icon, i) => {
              const on = (style.icon ?? original?.icon ?? tile.icon) === icon;
              return (
                <TouchableOpacity
                  key={icon}
                  onPress={() => set({ icon: i === 0 ? null : icon })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={i === 0 ? "Original icon" : icon.replace(/-outline$/, "").replace(/-/g, " ")}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: on ? colors.primary : colors.border,
                    backgroundColor: on ? colors.primaryLight : colors.surface,
                  }}
                >
                  <Icon set="ion" name={icon as IconName} size={17} color={on ? colors.primary : colors.foreground} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        {layout.shortcutStyles[tile.key] ? (
          <TouchableOpacity onPress={() => set({ look: "icon", color: null, label: null, icon: null })} accessibilityRole="button" style={{ alignSelf: "flex-start" }}>
            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700", fontFamily: fonts.body }}>Reset this shortcut</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <ScreenHeader
        title="Customize Home"
        subtitle="Only your Home changes"
        right={<HeaderIconButton icon="refresh-outline" accessibilityLabel="Reset to default" onPress={reset} disabled={isDefaultLayout(layout)} />}
      />
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sectionTitle("Templates", "Pick the Home that fits you, then change anything below.")}
        <View style={{ marginHorizontal: 24, gap: 10 }} accessibilityRole="radiogroup">
          {HOME_PRESETS.map((p) => {
            const on = preset === p.key;
            const shows = presetBlockLabels(p);
            // Every template has this week, the cycle card and quick log; show what's different.
            const extras = shows.filter((l) => !["This week", "Cycle phase card", "Quick log", "Shortcuts"].includes(l));
            const previews = (p.shortcuts ?? [])
              .map((k) => FEATURE_REGISTRY.find((f) => f.key === k))
              .filter((f): f is (typeof FEATURE_REGISTRY)[number] => Boolean(f));
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => applyTemplate(p)}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${p.label}. ${p.forWho} Shows ${shows.join(", ")}`}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: 14,
                  borderRadius: 18,
                  borderWidth: on ? 1.5 : 1,
                  borderColor: on ? colors.primary : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                {iconBox(p.icon as IconName, colors.primary, colors.primaryLight, false, true)}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "800", fontFamily: fonts.body }}>{p.label}</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>{p.forWho}</Text>
                  {previews.length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }} accessible={false}>
                      {previews.map((f) => {
                        const { color, bg } = tint(colors, p.shortcutStyles?.[f.key]?.color ?? f.colorKey);
                        return (
                          <View key={f.key} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
                            <Icon set="ion" name={f.icon as IconName} size={14} color={color} />
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                  <Text numberOfLines={3} style={{ color: on ? colors.primary : colors.mutedText, fontSize: 12, fontWeight: "700", fontFamily: fonts.body, marginTop: 8 }}>
                    {[...extras, previews.length ? `${previews.length} shortcuts` : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    borderWidth: 2,
                    borderColor: on ? colors.primary : colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }} /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        {!isDefaultLayout(layout) ? (
          <TouchableOpacity
            onPress={reset}
            accessibilityRole="button"
            style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, marginTop: 2 }}
          >
            <Icon set="ion" name="refresh-outline" size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: "700", fontFamily: fonts.body }}>Back to the full standard Home</Text>
          </TouchableOpacity>
        ) : null}

        {sectionTitle("Home blocks", "Turn on, reorder, or tap the slider icon for more.")}
        <View style={card}>
          {blocks.map((b, i) => {
            const on = !layout.hidden.includes(b.key);
            const hasOptions = Boolean(BLOCK_SETTINGS[b.key]);
            const open = openBlock === b.key;
            const sub = layout.blocks[b.key]?.title ? `“${layout.blocks[b.key]!.title}”` : b.description;
            return (
              <View key={b.key}>
                <View style={row}>
                  {iconBox(b.icon as IconName, colors.primary, colors.primaryLight, !on)}
                  {rowText(b.key === "shortcuts" ? genZLabel(b.label, genZ) : b.label, sub, !on)}
                  {hasOptions
                    ? smallButton(open ? "options" : "options-outline", `${b.label} options`, () => setOpenBlock(open ? null : b.key), !on, open ? colors.primary : colors.mutedText)
                    : <View style={{ width: 30 }} />}
                  {reorder(b.label, (dir) => moveBlock(b.key, dir), i === 0, i === blocks.length - 1)}
                  <Switch
                    value={on}
                    onValueChange={(next) => toggleBlock(b.key, next)}
                    trackColor={{ true: colors.primary, false: colors.border }}
                    thumbColor="#FFFFFF"
                    // react-native-web colours the "on" knob separately (teal by default).
                    {...({ activeThumbColor: "#FFFFFF" } as object)}
                    accessibilityLabel={`Show ${b.label}`}
                    style={{ marginLeft: 4 }}
                  />
                </View>
                {open && on ? blockPanel(b.key) : null}
                {i < blocks.length - 1 ? divider : null}
              </View>
            );
          })}
        </View>

        {shortcutsShown ? (
          <>
            {picked.length > 0 ? (
              <>
                {sectionTitle("Preview", "How your shortcuts look on Home.")}
                <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <HomeShortcuts tiles={picked} />
                </View>
              </>
            ) : null}
            {sectionTitle(`Your shortcuts · ${pickedKeys.length}/${MAX_SHORTCUTS}`, "Tap the brush to rename, restyle or recolour.")}
            {picked.length === 0 ? (
              <View style={card}>
                <EmptyState compact icon="star-outline" title="No shortcuts yet" message="Add features from the list below." />
              </View>
            ) : (
              <View style={card}>
                {picked.map((tile, i) => {
                  const { color, bg } = tint(colors, tile.colorKey);
                  const open = styling === tile.key;
                  return (
                    <View key={tile.key}>
                      <View style={row}>
                        {iconBox(tile.icon as IconName, color, bg)}
                        {rowText(label(tile), SHORTCUT_LOOKS.find((l) => l.key === tile.look)?.label ?? "")}
                        {smallButton(open ? "brush" : "brush-outline", `Style ${tile.title}`, () => setStyling(open ? null : tile.key), false, open ? colors.primary : colors.mutedText)}
                        {reorder(tile.title, (dir) => setShortcuts(moveKey(pickedKeys, tile.key, dir)), i === 0, i === picked.length - 1)}
                        {smallButton("remove-circle", `Remove ${tile.title}`, () => setShortcuts(pickedKeys.filter((k) => k !== tile.key)), false, colors.danger)}
                      </View>
                      {open ? shortcutPanel(tile) : null}
                      {i < picked.length - 1 ? divider : null}
                    </View>
                  );
                })}
              </View>
            )}

            {groups.map((g) => (
              <View key={g.placement}>
                {sectionTitle(g.placement === "home" ? "Add · Extras" : `Add · ${config.screenTitles[g.placement as keyof typeof config.screenTitles] ?? genZLabel(g.label, genZ)}`)}
                <View style={card}>
                  {g.tiles.map((tile, i) => {
                    const { color, bg } = tint(colors, tile.colorKey);
                    return (
                      <View key={tile.key}>
                        <View style={row}>
                          {iconBox(tile.icon as IconName, color, bg)}
                          {rowText(label(tile), tile.description)}
                          {smallButton("add-circle", `Add ${tile.title}`, () => addShortcut(tile.key), full, colors.primary)}
                        </View>
                        {i < g.tiles.length - 1 ? divider : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
            {full ? (
              <Text style={{ marginHorizontal: 24, marginTop: 10, color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>
                You can have up to {MAX_SHORTCUTS} shortcuts. Remove one to add another.
              </Text>
            ) : null}
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

/**
 * One-line text box that saves when the person is done typing (blur or
 * the return key), not on every keystroke. Empty = back to the default.
 */
function TextField({
  value,
  placeholder,
  maxLength,
  accessibilityLabel,
  onCommit,
}: {
  value: string;
  placeholder: string;
  maxLength: number;
  accessibilityLabel: string;
  onCommit: (text: string | null) => void;
}) {
  const { colors, fonts } = useTheme();
  const [text, setText] = useState(value);
  // What's saved, the latest text and handler, for the commit on unmount.
  const saved = useRef(value || null);
  const latest = useRef({ text, onCommit });
  latest.current = { text, onCommit };
  useEffect(() => {
    setText(value);
    saved.current = value || null;
  }, [value]);
  const commit = () => {
    const next = latest.current.text.trim() || null;
    if (next === saved.current) return;
    saved.current = next;
    latest.current.onCommit(next);
  };
  // Closing the panel (or leaving the screen) while typing removes the box
  // without a reliable blur, so save what was typed then.
  useEffect(() => () => commit(), []);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder={placeholder}
      placeholderTextColor={colors.mutedText}
      maxLength={maxLength}
      returnKeyType="done"
      accessibilityLabel={accessibilityLabel}
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 14.5,
        color: colors.foreground,
        backgroundColor: colors.background,
        fontFamily: fonts.body,
      }}
    />
  );
}
