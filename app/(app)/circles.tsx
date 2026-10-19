import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Avatar from "../../components/Avatar";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { AppModalHost } from "../../components/modals/AppModalHost";
import { useTheme } from "../../components/theme";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { circlesApi, getFriendlyErrorMessage, type CircleDetail, type CircleMember, type CircleVibe } from "../../lib/api";
import { timeAgo } from "../../lib/format";
import { showAlert } from "../../lib/modal-host";
import { shareWithAppLink } from "../../lib/share";
import { useSecureScreen } from "../../lib/screenPrivacy";
import { Icon } from "../../components/Icon";

/**
 * Bestie Circles — small private friend groups (period-buddy-be /api/circles).
 * Members post a "vibe" (emoji + a short line, optionally their phase emoji),
 * react, and send each other hype. Nothing else about anyone's cycle is ever
 * shared. `?id=` opens one circle; `?code=` (invite deep link) opens the
 * join sheet prefilled.
 *
 * Layout follows the app's calm list style: open rows on the page (no card
 * per item), sheets for anything that needs a form.
 */

const CIRCLE_EMOJIS = ["🫶", "💅", "🌸", "🔥", "👯", "🦋", "🍓", "🌙", "🌷", "🧸"];
const VIBE_EMOJIS = ["😴", "🍫", "💅", "🔥", "🥺", "😤", "🫶", "💖", "🩸", "🌙", "🤯", "🥳"];

const SIDE = 20;

/* ─────────────────────────────── Shared bits ─────────────────────────────── */

function Sheet({
  visible,
  title,
  onClose,
  onDismissed,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** The sheet has finished closing, so another modal (an alert) can open. */
  onDismissed?: () => void;
  children: React.ReactNode;
}) {
  const { colors, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;
  useEffect(() => {
    // iOS reports the end of the slide-out through `onDismiss`; elsewhere the
    // next modal can open straight away.
    if (!visible && Platform.OS !== "ios") onDismissedRef.current?.();
  }, [visible]);
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose} onDismiss={() => onDismissedRef.current?.()}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: SIDE, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 22 }}>
          <View style={{ alignSelf: "center", width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 14 }} />
          <View className="flex-row items-center justify-between mb-4">
            <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: fonts.heading, fontWeight: "800" }}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              className="items-center justify-center rounded-full"
              style={{ width: 30, height: 30, backgroundColor: colors.surfaceSoft }}
            >
              <Icon set="feather" name="x" size={16} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
      {/* Alerts raised while the sheet is open draw on top of it, not behind. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}

function FieldLabel({ children, first }: { children: string; first?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, fontWeight: "700", marginTop: first ? 0 : 18, marginBottom: 8 }}>{children}</Text>
  );
}

function EmojiGrid({ options, value, onChange }: { options: string[]; value: string; onChange: (e: string) => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {options.map((e) => {
        const active = e === value;
        return (
          <TouchableOpacity
            key={e}
            onPress={() => onChange(e)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={e}
            className="items-center justify-center rounded-full"
            style={{ width: 46, height: 46, backgroundColor: active ? colors.primaryLight : colors.surface, borderColor: active ? colors.primary : "transparent", borderWidth: 2 }}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PrimaryButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      className="items-center justify-center rounded-full mt-6"
      style={{ height: 52, backgroundColor: colors.primary, opacity: disabled || busy ? 0.5 : 1 }}
    >
      <Text style={{ color: colors.buttonText, fontSize: 15, fontFamily: fonts.heading, fontWeight: "800" }}>{busy ? "One sec…" : label}</Text>
    </TouchableOpacity>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  const { colors, fonts } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.mutedText}
      {...props}
      style={[
        { backgroundColor: colors.surface, color: colors.foreground, fontSize: 15, fontFamily: fonts.body, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14 },
        props.style,
      ]}
    />
  );
}

/** A dashed box holding an invite code, with a share action. */
function InviteCode({ code, onShare }: { code: string; onShare: () => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="flex-row items-center rounded-2xl" style={{ borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.border, paddingVertical: 12, paddingLeft: 18, paddingRight: 8 }}>
      <Text selectable style={{ flex: 1, color: colors.foreground, fontSize: 26, letterSpacing: 6, fontFamily: fonts.monoSemiBold }}>
        {code}
      </Text>
      <TouchableOpacity
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Share invite"
        className="flex-row items-center rounded-full px-4"
        style={{ height: 38, backgroundColor: colors.primaryLight, gap: 6 }}
      >
        <Icon set="feather" name="share-2" size={14} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 13, fontFamily: fonts.body, fontWeight: "800" }}>Share</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Hairline under a row, starting where the text starts. */
function Divider({ inset }: { inset: number }) {
  const { colors } = useTheme();
  return <View style={{ position: "absolute", bottom: 0, left: inset, right: SIDE, height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const shareInvite = (name: string, code: string) =>
  shareWithAppLink(`Join my Bestie Circle "${name}" on The Nura 🫶 Code: ${code}`, `circles?code=${code}`);

/* ─────────────────────────────── List ─────────────────────────────── */

function ActionRow({ icon, label, hint, onPress, last }: { icon: React.ComponentProps<typeof Feather>["name"]; label: string; hint?: string; onPress: () => void; last?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} accessibilityRole="button" className="flex-row items-center" style={{ paddingHorizontal: SIDE, paddingVertical: 12, gap: 14 }}>
      <View className="items-center justify-center rounded-full" style={{ width: 48, height: 48, backgroundColor: colors.surface }}>
        <Icon set="feather" name={icon} size={19} color={colors.primary} />
      </View>
      <View className="flex-1">
        <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, fontWeight: "700" }}>{label}</Text>
        {hint ? <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>{hint}</Text> : null}
      </View>
      <Icon set="feather" name="chevron-right" size={18} color={colors.mutedText} />
      {!last ? <Divider inset={SIDE + 48 + 14} /> : null}
    </TouchableOpacity>
  );
}

function CircleList({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(() => circlesApi.list(), [], {
    refreshOn: ["circles"],
    cacheKey: "circles:list",
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(Boolean(initialCode));
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(CIRCLE_EMOJIS[0]);
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? "");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; name: string; code: string } | null>(null);

  useEffect(() => {
    if (initialCode) {
      setCode(initialCode.toUpperCase());
      setJoinOpen(true);
    }
  }, [initialCode]);

  const openCircle = (id: string) => router.push({ pathname: "/(app)/circles", params: { id } });

  const create = async () => {
    setBusy(true);
    try {
      const { circle } = await circlesApi.create({ name: name.trim(), emoji });
      setCreated({ id: circle.id, name: circle.name, code: circle.inviteCode });
      setName("");
    } catch (err) {
      showAlert("Couldn't create it", getFriendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    try {
      const { circle } = await circlesApi.join(code);
      setJoinOpen(false);
      setCode("");
      openCircle(circle.id);
    } catch (err) {
      showAlert("Couldn't join", getFriendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const atLimit = data ? data.circles.length >= data.limits.maxCirclesPerUser : false;
  const startNew = () =>
    atLimit && data ? showAlert("Circle limit", `You can be in up to ${data.limits.maxCirclesPerUser} circles.`) : setCreateOpen(true);

  return (
    <>
      <ScreenHeader
        title="Bestie Circles"
        right={
          data?.circles.length ? (
            <TouchableOpacity
              onPress={startNew}
              hitSlop={10}
              accessibilityLabel="Start a new circle"
              className="items-center justify-center rounded-full"
              style={{ width: 36, height: 36, backgroundColor: colors.primaryLight }}
            >
              <Icon set="feather" name="plus" size={18} color={colors.primary} />
            </TouchableOpacity>
          ) : null
        }
      />
      <LoadingErrorState
        loading={loading}
        error={error}
        offline={offline}
        onRetry={() => reload()}
        loadingLabel="Finding your people…"
        errorTitle="Couldn't load your circles"
        skeleton={
          <View className="gap-4 px-6 pt-4">
            <SkeletonCard />
            <SkeletonCard />
          </View>
        }
      >
        {data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 60, flexGrow: 1 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
          >
            {data.circles.length === 0 ? (
              <View className="items-center px-8" style={{ paddingTop: 56 }}>
                <View className="items-center justify-center rounded-full" style={{ width: 88, height: 88, backgroundColor: colors.primaryLight }}>
                  <Text style={{ fontSize: 40 }}>🫶</Text>
                </View>
                <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: fonts.heading, fontWeight: "800", marginTop: 20, textAlign: "center" }}>
                  Your inner circle
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 21, fontFamily: fonts.body, marginTop: 8, textAlign: "center" }}>
                  {`A private space for up to ${data.limits.maxMembers} friends. Share how you're feeling and cheer each other on. Your cycle details always stay with you.`}
                </Text>
                <View style={{ alignSelf: "stretch" }}>
                  <PrimaryButton label="Start a circle" onPress={startNew} />
                </View>
                <TouchableOpacity onPress={() => setJoinOpen(true)} hitSlop={8} className="mt-5" accessibilityRole="button">
                  <Text style={{ color: colors.primary, fontSize: 14, fontFamily: fonts.body, fontWeight: "700" }}>I have an invite code</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={{ color: colors.mutedText, fontSize: 13, lineHeight: 19, fontFamily: fonts.body, paddingHorizontal: SIDE, marginTop: 6, marginBottom: 6 }}>
                  Only the vibe you post is shared, never your cycle data.
                </Text>
                {data.circles.map((c, i) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => openCircle(c.id)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    className="flex-row items-center"
                    style={{ paddingHorizontal: SIDE, paddingVertical: 12, gap: 14 }}
                  >
                    <View className="items-center justify-center rounded-full" style={{ width: 48, height: 48, backgroundColor: colors.primaryLight }}>
                      <Text style={{ fontSize: 24 }}>{c.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <View className="flex-row items-baseline" style={{ gap: 8 }}>
                        <Text style={{ flex: 1, color: colors.foreground, fontSize: 15.5, fontFamily: fonts.body, fontWeight: "700" }} numberOfLines={1}>
                          {c.name}
                        </Text>
                        {c.latestVibe ? (
                          <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>{timeAgo(c.latestVibe.createdAt).replace(" ago", "")}</Text>
                        ) : null}
                      </View>
                      <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 2 }} numberOfLines={1}>
                        {c.latestVibe
                          ? `${c.latestVibe.name}: ${c.latestVibe.emoji} ${c.latestVibe.text || ""}`.trim()
                          : `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"} · no vibes yet`}
                      </Text>
                    </View>
                    <Divider inset={SIDE + 48 + 14} />
                  </TouchableOpacity>
                ))}
                <View style={{ height: 8 }} />
                <ActionRow icon="plus" label="Start a new circle" onPress={startNew} />
                <ActionRow icon="key" label="Join with a code" hint="Got an invite from a friend?" onPress={() => setJoinOpen(true)} last />
              </>
            )}
          </ScrollView>
        ) : null}
      </LoadingErrorState>

      <Sheet
        visible={createOpen}
        title={created ? "Your circle is ready 🎉" : "Start a circle"}
        onClose={() => {
          setCreateOpen(false);
          if (created) {
            const id = created.id;
            setCreated(null);
            openCircle(id);
          }
        }}
      >
        {created ? (
          <>
            <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 20, fontFamily: fonts.body, marginBottom: 14 }}>
              Share this code with your friends so they can join.
            </Text>
            <InviteCode code={created.code} onShare={() => shareInvite(created.name, created.code)} />
            <PrimaryButton
              label="Open circle"
              onPress={() => {
                const id = created.id;
                setCreateOpen(false);
                setCreated(null);
                openCircle(id);
              }}
            />
          </>
        ) : (
          <>
            <FieldLabel first>Icon</FieldLabel>
            <EmojiGrid options={CIRCLE_EMOJIS} value={emoji} onChange={setEmoji} />
            <FieldLabel>Name</FieldLabel>
            <Input value={name} onChangeText={setName} maxLength={data?.limits.nameMaxLength ?? 30} placeholder="e.g. Hostel Girlies" />
            <PrimaryButton label="Create circle" onPress={create} disabled={!name.trim()} busy={busy} />
          </>
        )}
      </Sheet>

      <Sheet visible={joinOpen} title="Join a circle" onClose={() => setJoinOpen(false)}>
        <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 20, fontFamily: fonts.body, marginBottom: 14 }}>
          Enter the 6-character code your friend shared.
        </Text>
        <Input
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABC234"
          style={{ fontSize: 24, letterSpacing: 8, textAlign: "center", fontFamily: fonts.monoSemiBold, paddingVertical: 16 }}
        />
        <PrimaryButton label="Join circle" onPress={join} disabled={code.length !== 6} busy={busy} />
      </Sheet>
    </>
  );
}

/* ────────────────────────────── Detail ────────────────────────────── */

function MemberBubble({ m, onPress }: { m: CircleMember; onPress: (m: CircleMember) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => onPress(m)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${m.isYou ? "You" : m.name}${m.isOwner ? ", owner" : ""}${m.vibe ? `, feeling ${m.vibe.emoji}` : ""}`}
      className="items-center"
      style={{ width: 68 }}
    >
      <View>
        <Avatar uri={m.profilePicture ?? undefined} name={m.name} size={52} backgroundColor={colors.primaryLight} textColor={colors.primary} fontFamily={fonts.heading} />
        {m.vibe ? (
          <View
            className="absolute items-center justify-center rounded-full"
            style={{ right: -4, bottom: -2, width: 24, height: 24, backgroundColor: colors.surface, borderColor: colors.background, borderWidth: 2 }}
          >
            <Text style={{ fontSize: 12 }}>{m.vibe.emoji}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: fonts.body, fontWeight: "600", marginTop: 6 }} numberOfLines={1}>
        {m.isYou ? "You" : m.name.split(" ")[0]}
        {m.isOwner ? " 👑" : ""}
      </Text>
    </TouchableOpacity>
  );
}

function VibeRow({
  v,
  reactions,
  onReact,
  onDelete,
  last,
}: {
  v: CircleVibe;
  reactions: string[];
  onReact: (v: CircleVibe, e: string) => void;
  onDelete: (v: CircleVibe) => void;
  last: boolean;
}) {
  const { colors, fonts } = useTheme();
  const [picking, setPicking] = useState(false);
  const used = v.reactions.filter((r) => r.count > 0);

  const chip = (e: string, count: number | undefined, mine: boolean | undefined) => (
    <TouchableOpacity
      key={e}
      onPress={() => {
        setPicking(false);
        onReact(v, e);
      }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(mine) }}
      accessibilityLabel={`React ${e}${count ? `, ${count}` : ""}`}
      className="flex-row items-center rounded-full"
      style={{ paddingHorizontal: 9, height: 28, backgroundColor: mine ? colors.primaryLight : colors.surface, borderColor: mine ? colors.primary : "transparent", borderWidth: 1, gap: 4 }}
    >
      <Text style={{ fontSize: 13 }}>{e}</Text>
      {count ? <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: fonts.body, fontWeight: "700" }}>{count}</Text> : null}
    </TouchableOpacity>
  );

  return (
    <View style={{ paddingHorizontal: SIDE, paddingVertical: 14 }}>
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <View className="items-center justify-center rounded-full" style={{ width: 44, height: 44, backgroundColor: colors.surface }}>
          <Text style={{ fontSize: 22 }}>{v.emoji}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 14.5, fontFamily: fonts.body, fontWeight: "700" }} numberOfLines={1}>
              {v.isMine ? "You" : v.name}
            </Text>
            {v.phaseEmoji ? <Text style={{ fontSize: 13 }}>{v.phaseEmoji}</Text> : null}
            <Text style={{ flex: 1, color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }} numberOfLines={1}>
              {timeAgo(v.createdAt)}
            </Text>
            {v.isMine ? (
              <TouchableOpacity onPress={() => onDelete(v)} hitSlop={10} accessibilityLabel="Delete vibe">
                <Icon set="feather" name="more-horizontal" size={18} color={colors.mutedText} />
              </TouchableOpacity>
            ) : null}
          </View>
          {v.text ? <Text style={{ color: colors.foreground, fontSize: 14.5, lineHeight: 21, fontFamily: fonts.body, marginTop: 3 }}>{v.text}</Text> : null}
          {v.askForSupport ? (
            <View className="flex-row items-center self-start rounded-full mt-2" style={{ backgroundColor: colors.primaryLight, paddingHorizontal: 10, paddingVertical: 4, gap: 5 }}>
              <Text style={{ fontSize: 12 }}>🫂</Text>
              <Text style={{ color: colors.primary, fontSize: 12, fontFamily: fonts.body, fontWeight: "700" }}>Could use some love</Text>
            </View>
          ) : null}

          <View className="flex-row flex-wrap items-center mt-2.5" style={{ gap: 6 }}>
            {picking ? reactions.map((e) => {
              const r = v.reactions.find((x) => x.emoji === e);
              return chip(e, r?.count, r?.mine);
            }) : used.map((r) => chip(r.emoji, r.count, r.mine))}
            <TouchableOpacity
              onPress={() => setPicking((p) => !p)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={picking ? "Close reactions" : "Add a reaction"}
              className="items-center justify-center rounded-full"
              style={{ width: 28, height: 28, backgroundColor: colors.surface }}
            >
              <Icon set="feather" name={picking ? "x" : "smile"} size={14} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {!last ? <Divider inset={SIDE + 44 + 12} /> : null}
    </View>
  );
}

function CircleView({ id }: { id: string }) {
  const router = useRouter();
  const { colors, fonts } = useTheme();
  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(() => circlesApi.get(id), [id], {
    refreshOn: ["circles"],
    cacheKey: `circles:detail:${id}`,
  });
  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [emoji, setEmoji] = useState(VIBE_EMOJIS[0]);
  const [text, setText] = useState("");
  const [sharePhase, setSharePhase] = useState(false);
  const [askForSupport, setAskForSupport] = useState(false);
  const [posting, setPosting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [member, setMember] = useState<CircleMember | null>(null);

  useEffect(() => {
    if (data) setCircle(data.circle);
  }, [data]);

  const patchVibe = (vibe: CircleVibe) =>
    setCircle((c) => (c ? { ...c, feed: c.feed.map((v) => (v.id === vibe.id ? { ...v, reactions: vibe.reactions } : v)) } : c));

  const post = async () => {
    setPosting(true);
    try {
      await circlesApi.postVibe(id, { emoji, text: text.trim(), sharePhase, askForSupport });
      setText("");
      setAskForSupport(false);
      setComposerOpen(false);
      await reload(true);
    } catch (err) {
      showAlert("Couldn't post", getFriendlyErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const react = async (v: CircleVibe, e: string) => {
    try {
      const { vibe } = await circlesApi.react(id, v.id, e);
      patchVibe(vibe);
    } catch (err) {
      showAlert("Couldn't react", getFriendlyErrorMessage(err));
    }
  };

  const remove = (v: CircleVibe) =>
    showAlert("Delete this vibe?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await circlesApi.deleteVibe(id, v.id);
            setCircle((c) => (c ? { ...c, feed: c.feed.filter((x) => x.id !== v.id) } : c));
          } catch (err) {
            showAlert("Couldn't delete", getFriendlyErrorMessage(err));
          }
        },
      },
    ]);

  const hype = async (m: CircleMember) => {
    setMember(null);
    try {
      await circlesApi.hype(id, m.userId);
      showAlert("Hype sent 🫶", `${m.name} just got a little boost.`);
    } catch (err) {
      showAlert("Hold up", getFriendlyErrorMessage(err));
    }
  };

  // Runs once the options sheet has closed: iOS drops an alert presented
  // while another modal is still sliding away.
  const afterMenuClosed = useRef<(() => void) | null>(null);
  const closeMenuThen = (action: () => void) => {
    afterMenuClosed.current = action;
    setMenuOpen(false);
  };
  const onMenuDismissed = () => {
    const action = afterMenuClosed.current;
    afterMenuClosed.current = null;
    action?.();
  };

  const leave = () =>
    closeMenuThen(() =>
      showAlert(
      "Leave this circle?",
      circle?.isOwner && circle.memberCount > 1 ? "The longest-standing member becomes the owner." : circle?.memberCount === 1 ? "You're the last one here, so the circle will be deleted." : undefined,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: async () => {
            try {
              await circlesApi.removeMember(id, "me");
              router.back();
            } catch (err) {
              showAlert("Couldn't leave", getFriendlyErrorMessage(err));
            }
          },
        },
      ],
      ),
    );

  const resetCode = () =>
    closeMenuThen(async () => {
      try {
        const { inviteCode } = await circlesApi.resetCode(id);
        setCircle((c) => (c ? { ...c, inviteCode } : c));
        showAlert("New code", `The old code no longer works. New one: ${inviteCode}`);
      } catch (err) {
        showAlert("Couldn't reset", getFriendlyErrorMessage(err));
      }
    });

  const me = circle?.members.find((m) => m.isYou);

  return (
    <>
      <ScreenHeader
        title={circle ? `${circle.emoji} ${circle.name}` : "Circle"}
        right={
          circle ? (
            <TouchableOpacity
              onPress={() => setMenuOpen(true)}
              hitSlop={10}
              accessibilityLabel="Circle options"
              className="w-9 h-9 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.surface }}
            >
              <Icon set="feather" name="more-horizontal" size={18} color={colors.foreground} />
            </TouchableOpacity>
          ) : null
        }
      />
      <LoadingErrorState
        loading={loading && !circle}
        error={circle ? null : error}
        offline={offline}
        onRetry={() => reload()}
        loadingLabel="Loading the vibes…"
        errorTitle="Couldn't open this circle"
      >
        {circle && data ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 60 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => reload(true)} tintColor={colors.primary} />}
          >
            <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, paddingHorizontal: SIDE, marginTop: 4 }}>
              {`${circle.memberCount} of ${data.limits.maxMembers} members · tap someone to send hype`}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SIDE - 8, paddingTop: 12, gap: 2 }}>
              {circle.members.map((m) => (
                <MemberBubble key={m.userId} m={m} onPress={setMember} />
              ))}
              {circle.members.length < data.limits.maxMembers ? (
                <TouchableOpacity
                  onPress={() => shareInvite(circle.name, circle.inviteCode)}
                  className="items-center"
                  style={{ width: 68 }}
                  accessibilityRole="button"
                  accessibilityLabel="Invite a friend"
                >
                  <View className="items-center justify-center rounded-full" style={{ width: 52, height: 52, borderColor: colors.border, borderWidth: 1.5, borderStyle: "dashed" }}>
                    <Icon set="feather" name="plus" size={20} color={colors.mutedText} />
                  </View>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, fontWeight: "600", marginTop: 6 }}>Invite</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>

            {/* Composer entry: one quiet line that opens the full form in a sheet. */}
            <TouchableOpacity
              onPress={() => setComposerOpen(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Share how you're feeling"
              className="flex-row items-center rounded-full"
              style={{ marginHorizontal: SIDE, marginTop: 20, backgroundColor: colors.surface, paddingLeft: 6, paddingRight: 16, height: 52, gap: 10 }}
            >
              {me ? (
                <Avatar uri={me.profilePicture ?? undefined} name={me.name} size={40} backgroundColor={colors.primaryLight} textColor={colors.primary} fontFamily={fonts.heading} />
              ) : null}
              <Text style={{ flex: 1, color: colors.mutedText, fontSize: 14.5, fontFamily: fonts.body }}>How are you feeling today?</Text>
              <Text style={{ fontSize: 20 }}>{emoji}</Text>
            </TouchableOpacity>

            <View className="flex-row items-baseline justify-between" style={{ paddingHorizontal: SIDE, marginTop: 24, marginBottom: 2 }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: fonts.heading, fontWeight: "800" }}>Vibes</Text>
              <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Cleared after 7 days</Text>
            </View>
            {circle.feed.length ? (
              circle.feed.map((v, i) => (
                <VibeRow key={v.id} v={v} reactions={data.reactions} onReact={react} onDelete={remove} last={i === circle.feed.length - 1} />
              ))
            ) : (
              <View className="items-center px-10" style={{ paddingTop: 36 }}>
                <Text style={{ fontSize: 30 }}>💬</Text>
                <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.body, fontWeight: "700", marginTop: 8 }}>Quiet in here</Text>
                <Text style={{ color: colors.mutedText, fontSize: 13.5, fontFamily: fonts.body, marginTop: 4, textAlign: "center" }}>
                  Share the first vibe and get the conversation going.
                </Text>
              </View>
            )}
          </ScrollView>
        ) : null}
      </LoadingErrorState>

      <Sheet visible={composerOpen} title="Share a vibe" onClose={() => setComposerOpen(false)}>
        {data ? (
          <>
            <FieldLabel first>How are you feeling?</FieldLabel>
            <EmojiGrid options={VIBE_EMOJIS} value={emoji} onChange={setEmoji} />
            <FieldLabel>Add a note (optional)</FieldLabel>
            <Input value={text} onChangeText={setText} maxLength={data.limits.vibeMaxLength} placeholder="Cramps are winning today, send snacks" />
            <View className="rounded-2xl mt-4" style={{ backgroundColor: colors.surface, paddingHorizontal: 16 }}>
              <View className="flex-row items-center" style={{ paddingVertical: 10, gap: 12 }}>
                <Text style={{ flex: 1, color: colors.foreground, fontSize: 14, fontFamily: fonts.body, fontWeight: "600" }}>Show my phase emoji</Text>
                <Switch value={sharePhase} onValueChange={setSharePhase} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
              </View>
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
              <View className="flex-row items-center" style={{ paddingVertical: 10, gap: 12 }}>
                <View className="flex-1">
                  <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.body, fontWeight: "600" }}>I could use some love 🫂</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 1 }}>Your circle gets a gentle notification</Text>
                </View>
                <Switch value={askForSupport} onValueChange={setAskForSupport} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
              </View>
            </View>
            <PrimaryButton label="Share vibe" onPress={post} busy={posting} />
          </>
        ) : null}
      </Sheet>

      <Sheet visible={member !== null} title={member ? (member.isYou ? "You" : member.name) : ""} onClose={() => setMember(null)}>
        {member ? (
          <>
            <View className="flex-row items-center" style={{ gap: 14 }}>
              <Avatar uri={member.profilePicture ?? undefined} name={member.name} size={56} backgroundColor={colors.primaryLight} textColor={colors.primary} fontFamily={fonts.heading} />
              <View className="flex-1">
                <Text style={{ color: colors.foreground, fontSize: 14.5, fontFamily: fonts.body, fontWeight: "600" }}>
                  {member.vibe ? `Feeling ${member.vibe.emoji}${member.vibe.text ? `  “${member.vibe.text}”` : ""}` : "No vibe shared yet"}
                </Text>
                <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, marginTop: 2 }}>
                  {member.vibe ? timeAgo(member.vibe.createdAt) : member.isOwner ? "Started this circle" : "Member"}
                </Text>
              </View>
            </View>
            {!member.isYou ? <PrimaryButton label="Send hype 🫶" onPress={() => hype(member)} /> : null}
          </>
        ) : null}
      </Sheet>

      <Sheet visible={menuOpen} title="Circle options" onClose={() => setMenuOpen(false)} onDismissed={onMenuDismissed}>
        {circle ? (
          <>
            <FieldLabel first>Invite code</FieldLabel>
            <InviteCode code={circle.inviteCode} onShare={() => shareInvite(circle.name, circle.inviteCode)} />
            <View className="mt-3">
              {[
                { label: "Reset invite code", icon: "refresh-cw" as const, onPress: resetCode, show: circle.isOwner },
                { label: "Leave circle", icon: "log-out" as const, onPress: leave, show: true, danger: true },
              ]
                .filter((o) => o.show)
                .map((o) => (
                  <TouchableOpacity key={o.label} onPress={o.onPress} activeOpacity={0.7} accessibilityRole="button" className="flex-row items-center py-3.5" style={{ gap: 12 }}>
                    <Icon set="feather" name={o.icon} size={18} color={o.danger ? colors.danger : colors.foreground} />
                    <Text style={{ color: o.danger ? colors.danger : colors.foreground, fontSize: 15, fontFamily: fonts.body, fontWeight: "600" }}>{o.label}</Text>
                  </TouchableOpacity>
                ))}
            </View>
          </>
        ) : null}
      </Sheet>
    </>
  );
}

export default function CirclesScreen() {
  useSecureScreen("circles");
  const { colors, isDark } = useTheme();
  const { id, code } = useLocalSearchParams<{ id?: string; code?: string }>();
  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        {id ? <CircleView id={String(id)} /> : <CircleList initialCode={code ? String(code) : undefined} />}
      </SafeAreaView>
    </>
  );
}
