import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Avatar from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { LoadingErrorState } from "../../components/LoadingErrorState";
import { ScreenHeader } from "../../components/ScreenHeader";
import { SkeletonCard } from "../../components/Skeleton";
import { useTheme } from "../../components/theme";
import { getShadow } from "../../components/ui-tokens";
import { useAsyncLoad } from "../../hooks/useAsyncLoad";
import { circlesApi, getFriendlyErrorMessage, type CircleDetail, type CircleMember, type CircleVibe } from "../../lib/api";
import { timeAgo } from "../../lib/genz";
import { showAlert } from "../../lib/modal-host";
import { shareWithAppLink } from "../../lib/share";

/**
 * Bestie Circles — small private friend groups (period-buddy-be /api/circles).
 * Members post a "vibe" (emoji + a short line, optionally their phase emoji),
 * react, and send each other hype. Nothing else about anyone's cycle is ever
 * shared. `?id=` opens one circle; `?code=` (invite deep link) opens the
 * join sheet prefilled.
 */

const CIRCLE_EMOJIS = ["🫶", "💅", "🌸", "🔥", "👯", "🦋", "🍓", "🌙", "✨", "🧸"];
const VIBE_EMOJIS = ["😴", "🍫", "💅", "🔥", "🥺", "😤", "🫶", "✨", "🩸", "🌙", "🤯", "🥳"];

function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
        <View className="px-6 pt-5 pb-10" style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text style={{ color: colors.foreground, fontSize: 19, fontFamily: fonts.heading, fontWeight: "900" }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Feather name="x" size={22} color={colors.mutedText} />
            </TouchableOpacity>
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmojiRow({ options, value, onChange }: { options: string[]; value: string; onChange: (e: string) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {options.map((e) => {
        const active = e === value;
        return (
          <TouchableOpacity
            key={e}
            onPress={() => onChange(e)}
            activeOpacity={0.8}
            className="items-center justify-center rounded-2xl"
            style={{ width: 46, height: 46, backgroundColor: active ? colors.primaryLight : colors.surface, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 2 : 1 }}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function PrimaryButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  const { colors, fonts } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      className="items-center rounded-2xl py-4 mt-5"
      style={{ backgroundColor: colors.primary, opacity: disabled || busy ? 0.55 : 1 }}
    >
      <Text style={{ color: colors.buttonText, fontSize: 15, fontFamily: fonts.heading, fontWeight: "900" }}>{busy ? "One sec…" : label}</Text>
    </TouchableOpacity>
  );
}

const shareInvite = (name: string, code: string) =>
  shareWithAppLink(`Join my Bestie Circle "${name}" on The Nura 🫶 Code: ${code}`, `circles?code=${code}`);

/* ─────────────────────────────── List ─────────────────────────────── */

function CircleList({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const { colors, isDark, fonts } = useTheme();
  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(() => circlesApi.list(), [], { refreshOn: ["circles"] });

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

  return (
    <>
      <ScreenHeader
        title="Bestie Circles"
        right={
          data?.circles.length ? (
            <TouchableOpacity onPress={() => setJoinOpen(true)} className="rounded-full px-3.5 py-2" style={{ backgroundColor: colors.surface }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: fonts.body, fontWeight: "800" }}>Join</Text>
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
            <View className="mx-6 mt-5">
              <LinearGradient colors={["#34C99A", "#3A86FF", "#B24BF3"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 26, padding: 20 }}>
                <Text style={{ fontSize: 34 }}>🫶👯‍♀️✨</Text>
                <Text style={{ color: "#FFF", fontSize: 21, fontFamily: fonts.heading, fontWeight: "900", marginTop: 8 }}>Your people, your vibes</Text>
                <Text style={{ color: "#FFF", fontSize: 13, lineHeight: 19, fontFamily: fonts.body, fontWeight: "600", marginTop: 4, opacity: 0.95 }}>
                  {`Private circles of up to ${data.limits.maxMembers}. Drop a vibe, share your phase emoji if you want, and hype each other up. Your cycle details stay yours.`}
                </Text>
              </LinearGradient>
            </View>

            {data.circles.length === 0 ? (
              <EmptyState
                compact
                icon="account-group-outline"
                title="No circles yet"
                message="Start one for your besties, or join with a code a friend sent you."
              />
            ) : (
              <View className="mx-6 mt-4" style={{ gap: 12 }}>
                {data.circles.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => openCircle(c.id)}
                    activeOpacity={0.85}
                    className="flex-row items-center rounded-3xl p-4"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: 14, ...getShadow(colors, isDark) }}
                  >
                    <View className="items-center justify-center rounded-2xl" style={{ width: 54, height: 54, backgroundColor: colors.primaryLight }}>
                      <Text style={{ fontSize: 28 }}>{c.emoji}</Text>
                    </View>
                    <View className="flex-1">
                      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: fonts.heading, fontWeight: "900" }} numberOfLines={1}>
                        {c.name}
                      </Text>
                      <Text style={{ color: colors.mutedText, fontSize: 12.5, fontFamily: fonts.body, marginTop: 3 }} numberOfLines={1}>
                        {c.latestVibe
                          ? `${c.latestVibe.name}: ${c.latestVibe.emoji} ${c.latestVibe.text || ""} · ${timeAgo(c.latestVibe.createdAt)}`
                          : `${c.memberCount} ${c.memberCount === 1 ? "member" : "members"} · no vibes yet`}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color={colors.mutedText} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View className="mx-6 mt-5 flex-row" style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={() => (atLimit ? showAlert("Circle limit", `You can be in up to ${data.limits.maxCirclesPerUser} circles.`) : setCreateOpen(true))}
                activeOpacity={0.85}
                className="flex-1 flex-row items-center justify-center rounded-2xl py-4"
                style={{ backgroundColor: colors.primary, gap: 8 }}
              >
                <Feather name="plus" size={18} color={colors.buttonText} />
                <Text style={{ color: colors.buttonText, fontSize: 15, fontFamily: fonts.heading, fontWeight: "900" }}>New circle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setJoinOpen(true)}
                activeOpacity={0.85}
                className="flex-1 flex-row items-center justify-center rounded-2xl py-4"
                style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, gap: 8 }}
              >
                <Feather name="key" size={16} color={colors.foreground} />
                <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.heading, fontWeight: "900" }}>Join with code</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : null}
      </LoadingErrorState>

      <Sheet
        visible={createOpen}
        title={created ? "Your circle is live 🎉" : "Start a circle"}
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
            <Text style={{ color: colors.mutedText, fontSize: 14, fontFamily: fonts.body }}>Send this code to your besties:</Text>
            <Text selectable style={{ color: colors.foreground, fontSize: 40, letterSpacing: 8, fontFamily: fonts.monoSemiBold, textAlign: "center", marginVertical: 18 }}>
              {created.code}
            </Text>
            <PrimaryButton label="Share invite" onPress={() => shareInvite(created.name, created.code)} />
          </>
        ) : (
          <>
            <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, fontWeight: "700", marginBottom: 8 }}>Pick an icon</Text>
            <EmojiRow options={CIRCLE_EMOJIS} value={emoji} onChange={setEmoji} />
            <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body, fontWeight: "700", marginTop: 16, marginBottom: 8 }}>Name it</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={data?.limits.nameMaxLength ?? 30}
              placeholder="Hot Girl Club, The Coven, Hostel Girlies…"
              placeholderTextColor={colors.mutedText}
              className="rounded-2xl px-4 py-3.5"
              style={{ backgroundColor: colors.surface, color: colors.foreground, fontSize: 15, fontFamily: fonts.body, borderColor: colors.border, borderWidth: 1 }}
            />
            <PrimaryButton label="Create circle" onPress={create} disabled={!name.trim()} busy={busy} />
          </>
        )}
      </Sheet>

      <Sheet visible={joinOpen} title="Join a circle" onClose={() => setJoinOpen(false)}>
        <Text style={{ color: colors.mutedText, fontSize: 14, fontFamily: fonts.body, marginBottom: 12 }}>Enter the 6-character code your friend sent you.</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABC234"
          placeholderTextColor={colors.mutedText}
          className="rounded-2xl px-4 py-4"
          style={{ backgroundColor: colors.surface, color: colors.foreground, fontSize: 26, letterSpacing: 8, textAlign: "center", fontFamily: fonts.monoSemiBold, borderColor: colors.border, borderWidth: 1 }}
        />
        <PrimaryButton label="Join" onPress={join} disabled={code.length !== 6} busy={busy} />
      </Sheet>
    </>
  );
}

/* ────────────────────────────── Detail ────────────────────────────── */

function MemberBubble({ m, onHype }: { m: CircleMember; onHype: (m: CircleMember) => void }) {
  const { colors, fonts } = useTheme();
  return (
    <View className="items-center" style={{ width: 76 }}>
      <View>
        <Avatar uri={m.profilePicture ?? undefined} name={m.name} size={58} backgroundColor={colors.primaryLight} textColor={colors.primary} fontFamily={fonts.heading} />
        {m.vibe ? (
          <View className="absolute items-center justify-center rounded-full" style={{ right: -6, bottom: -4, width: 28, height: 28, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1 }}>
            <Text style={{ fontSize: 15 }}>{m.vibe.emoji}</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ color: colors.foreground, fontSize: 12, fontFamily: fonts.body, fontWeight: "800", marginTop: 6 }} numberOfLines={1}>
        {m.isYou ? "You" : m.name}
        {m.isOwner ? " 👑" : ""}
      </Text>
      {!m.isYou ? (
        <TouchableOpacity onPress={() => onHype(m)} hitSlop={8} className="rounded-full px-2.5 py-1 mt-1" style={{ backgroundColor: colors.surface }} accessibilityLabel={`Send ${m.name} hype`}>
          <Text style={{ color: colors.foreground, fontSize: 10.5, fontFamily: fonts.body, fontWeight: "800" }}>hype 🫶</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function VibeCard({ v, reactions, onReact, onDelete }: { v: CircleVibe; reactions: string[]; onReact: (v: CircleVibe, e: string) => void; onDelete: (v: CircleVibe) => void }) {
  const { colors, fonts } = useTheme();
  const counts = new Map(v.reactions.map((r) => [r.emoji, r]));
  return (
    <View className="rounded-3xl p-4 mt-3" style={{ backgroundColor: colors.surface, borderColor: v.askForSupport ? colors.primary : colors.border, borderWidth: v.askForSupport ? 1.5 : 1 }}>
      <View className="flex-row items-start" style={{ gap: 12 }}>
        <Text style={{ fontSize: 34 }}>{v.emoji}</Text>
        <View className="flex-1">
          <View className="flex-row items-center" style={{ gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 14, fontFamily: fonts.heading, fontWeight: "900" }}>{v.isMine ? "You" : v.name}</Text>
            {v.phaseEmoji ? <Text style={{ fontSize: 13 }}>{v.phaseEmoji}</Text> : null}
            <Text style={{ color: colors.mutedText, fontSize: 11.5, fontFamily: fonts.body }}>{`· ${timeAgo(v.createdAt)}`}</Text>
          </View>
          {v.text ? <Text style={{ color: colors.foreground, fontSize: 14.5, lineHeight: 20, fontFamily: fonts.body, marginTop: 3 }}>{v.text}</Text> : null}
          {v.askForSupport ? (
            <Text style={{ color: colors.primary, fontSize: 12, fontFamily: fonts.body, fontWeight: "800", marginTop: 5 }}>could use some love 🫂</Text>
          ) : null}
        </View>
        {v.isMine ? (
          <TouchableOpacity onPress={() => onDelete(v)} hitSlop={10} accessibilityLabel="Delete vibe">
            <Feather name="trash-2" size={16} color={colors.mutedText} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View className="flex-row flex-wrap mt-3" style={{ gap: 6 }}>
        {reactions.map((e) => {
          const r = counts.get(e);
          return (
            <TouchableOpacity
              key={e}
              onPress={() => onReact(v, e)}
              activeOpacity={0.8}
              className="flex-row items-center rounded-full px-2.5 py-1"
              style={{ backgroundColor: r?.mine ? colors.primaryLight : colors.surfaceSoft, borderColor: r?.mine ? colors.primary : "transparent", borderWidth: 1, gap: 3 }}
            >
              <Text style={{ fontSize: 14 }}>{e}</Text>
              {r?.count ? <Text style={{ color: colors.foreground, fontSize: 11.5, fontFamily: fonts.mono }}>{r.count}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function CircleView({ id }: { id: string }) {
  const router = useRouter();
  const { colors, isDark, fonts } = useTheme();
  const { data, loading, refreshing, error, offline, reload } = useAsyncLoad(() => circlesApi.get(id), [id], { refreshOn: ["circles"] });
  const [circle, setCircle] = useState<CircleDetail | null>(null);
  const [emoji, setEmoji] = useState(VIBE_EMOJIS[0]);
  const [text, setText] = useState("");
  const [sharePhase, setSharePhase] = useState(false);
  const [askForSupport, setAskForSupport] = useState(false);
  const [posting, setPosting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    try {
      await circlesApi.hype(id, m.userId);
      showAlert("Hype sent 🫶", `${m.name} just got a little boost.`);
    } catch (err) {
      showAlert("Hold up", getFriendlyErrorMessage(err));
    }
  };

  const leave = () => {
    setMenuOpen(false);
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
    );
  };

  const resetCode = async () => {
    setMenuOpen(false);
    try {
      const { inviteCode } = await circlesApi.resetCode(id);
      setCircle((c) => (c ? { ...c, inviteCode } : c));
      showAlert("New code", `The old code no longer works. New one: ${inviteCode}`);
    } catch (err) {
      showAlert("Couldn't reset", getFriendlyErrorMessage(err));
    }
  };

  return (
    <>
      <ScreenHeader
        title={circle ? `${circle.emoji} ${circle.name}` : "Circle"}
        right={
          circle ? (
            <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={10} accessibilityLabel="Circle options" className="w-9 h-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
              <Feather name="more-horizontal" size={18} color={colors.foreground} />
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 18, gap: 4 }}>
              {circle.members.map((m) => (
                <MemberBubble key={m.userId} m={m} onHype={hype} />
              ))}
              {circle.members.length < data.limits.maxMembers ? (
                <TouchableOpacity onPress={() => shareInvite(circle.name, circle.inviteCode)} className="items-center" style={{ width: 76 }} accessibilityLabel="Invite a friend">
                  <View className="items-center justify-center rounded-full" style={{ width: 58, height: 58, borderColor: colors.border, borderWidth: 1.5, borderStyle: "dashed" }}>
                    <Feather name="user-plus" size={20} color={colors.mutedText} />
                  </View>
                  <Text style={{ color: colors.mutedText, fontSize: 12, fontFamily: fonts.body, fontWeight: "800", marginTop: 6 }}>Invite</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>

            {/* Composer */}
            <View className="mx-6 mt-5 rounded-3xl p-4" style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, ...getShadow(colors, isDark) }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: fonts.heading, fontWeight: "900", marginBottom: 10 }}>{"What's your vibe rn?"}</Text>
              <EmojiRow options={VIBE_EMOJIS} value={emoji} onChange={setEmoji} />
              <TextInput
                value={text}
                onChangeText={setText}
                maxLength={data.limits.vibeMaxLength}
                placeholder="cramps are winning today, send snacks"
                placeholderTextColor={colors.mutedText}
                className="rounded-2xl px-4 py-3 mt-3"
                style={{ backgroundColor: colors.background, color: colors.foreground, fontSize: 14.5, fontFamily: fonts.body }}
              />
              <View className="flex-row items-center justify-between mt-3">
                <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: fonts.body, fontWeight: "700" }}>Show my phase emoji</Text>
                <Switch value={sharePhase} onValueChange={setSharePhase} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
              </View>
              <View className="flex-row items-center justify-between mt-1">
                <View className="flex-1 pr-3">
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: fonts.body, fontWeight: "700" }}>I could use some love 🫂</Text>
                  <Text style={{ color: colors.mutedText, fontSize: 11, fontFamily: fonts.body }}>Sends your circle a notification</Text>
                </View>
                <Switch value={askForSupport} onValueChange={setAskForSupport} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#FFF" />
              </View>
              <PrimaryButton label={`Post ${emoji}`} onPress={post} busy={posting} />
            </View>

            <View className="mx-6 mt-6">
              <Text style={{ color: colors.foreground, fontSize: 17, fontFamily: fonts.heading, fontWeight: "900" }}>Vibe feed</Text>
              <Text style={{ color: colors.mutedText, fontSize: 11.5, fontFamily: fonts.body, marginTop: 2 }}>Vibes disappear after 7 days.</Text>
              {circle.feed.length ? (
                circle.feed.map((v) => <VibeCard key={v.id} v={v} reactions={data.reactions} onReact={react} onDelete={remove} />)
              ) : (
                <EmptyState compact icon="emoticon-happy-outline" title="Quiet in here" message="Be the first to drop a vibe ✨" />
              )}
            </View>
          </ScrollView>
        ) : null}
      </LoadingErrorState>

      <Sheet visible={menuOpen} title="Circle options" onClose={() => setMenuOpen(false)}>
        {circle ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.mutedText, fontSize: 13, fontFamily: fonts.body }}>Invite code</Text>
            <Text selectable style={{ color: colors.foreground, fontSize: 30, letterSpacing: 6, fontFamily: fonts.monoSemiBold, marginBottom: 8 }}>
              {circle.inviteCode}
            </Text>
            {[
              { label: "Share invite", icon: "share-2" as const, onPress: () => shareInvite(circle.name, circle.inviteCode), show: true },
              { label: "Reset invite code", icon: "refresh-cw" as const, onPress: resetCode, show: circle.isOwner },
              { label: "Leave circle", icon: "log-out" as const, onPress: leave, show: true, danger: true },
            ]
              .filter((o) => o.show)
              .map((o) => (
                <TouchableOpacity key={o.label} onPress={o.onPress} activeOpacity={0.8} className="flex-row items-center py-3.5" style={{ gap: 12 }}>
                  <Feather name={o.icon} size={18} color={o.danger ? colors.danger : colors.foreground} />
                  <Text style={{ color: o.danger ? colors.danger : colors.foreground, fontSize: 15, fontFamily: fonts.body, fontWeight: "700" }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
          </View>
        ) : null}
      </Sheet>
    </>
  );
}

export default function CirclesScreen() {
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
