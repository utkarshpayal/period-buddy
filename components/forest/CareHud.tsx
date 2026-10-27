import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOut } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import type { ForestGardenState, GardenActionType } from "../../lib/api";
import { Icon } from "../Icon";

/**
 * The forest's controls, kept to one dock at the bottom of the scene so the
 * tree stays the hero:
 *  - `NextNeed`: the single most useful thing to do now ("3 weeds · tap them"),
 *    tappable (does it), so the game also works without touching the 3D
 *    scene (2D fallback, screen readers). Nothing shows when all is well.
 *  - `CareDock`: Water (hold to pour; the ring is the soil's water), Compost
 *    (ring = food), Mulch, and More (the details sheet).
 *  - `CareLevel`: level and XP, inside the details sheet.
 *  - `CareFeedback`: "+5 XP · Watered." in the scene's one message spot.
 */

const MAX_POUR_MS = 3000;
const GLASS = "rgba(255,255,255,0.92)";
const INK = "#1F3B24";
const SOFT_INK = "#4B5E4E";

/** The one thing to do next, in the order a gardener would. */
function topNeed(g: ForestGardenState) {
  const has = (k: string) => g.needs.find((n) => n.key === k);
  const pick = has("water") ?? has("shoo") ?? has("weed") ?? has("fertilize") ?? has("prune") ?? has("soggy");
  if (!pick) return null;
  const how: Record<string, { text: string; icon: string }> = {
    water: { text: "Thirsty · hold Water", icon: "water" },
    shoo: { text: `${pick.label} on the leaves · tap to shoo`, icon: "bug" },
    weed: { text: `${pick.label} · tap to pull`, icon: "leaf" },
    fertilize: { text: "Hungry · add compost", icon: "nutrition" },
    prune: { text: `${pick.label} · tap the brown ones`, icon: "cut" },
    soggy: { text: "Roots are soggy · let it dry", icon: "rainy" },
  };
  return { ...pick, ...how[pick.key] };
}

export function NextNeed({ garden: g, onAct }: { garden: ForestGardenState; onAct: (type: GardenActionType, opts?: { id?: number; seconds?: number }) => void }) {
  const need = topNeed(g);
  if (!need) return null;
  const run = () => {
    if (need.key === "weed" && g.weeds[0]) onAct("weed", { id: g.weeds[0].id });
    else if (need.key === "shoo" && g.pests[0]) onAct("shoo", { id: g.pests[0].id });
    else if (need.key === "prune" && g.deadLeaves[0]) onAct("prune", { id: g.deadLeaves[0].id });
    else if (need.key === "water") onAct("water", { seconds: 2 });
    else if (need.key === "fertilize") onAct("fertilize");
  };
  return (
    <Pressable
      onPress={run}
      disabled={need.key === "soggy"}
      accessibilityRole="button"
      accessibilityLabel={need.text}
      hitSlop={{ top: 6, bottom: 6 }}
      style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: GLASS }}
    >
      <Icon set="ion" name={need.icon as any} size={15} color={need.urgent ? "#C62828" : "#B26A00"} />
      <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{need.text}</Text>
    </Pressable>
  );
}

export function CareDock({
  garden: g,
  busy,
  onAct,
  onPouring,
  onWaterTap,
  onMore,
}: {
  /** null when the backend has no care game: Water is a plain tap then. */
  garden: ForestGardenState | null;
  busy: GardenActionType | null;
  onAct: (type: GardenActionType, opts?: { id?: number; seconds?: number }) => void;
  onPouring: (pouring: boolean) => void;
  onWaterTap: () => void;
  onMore: () => void;
}) {
  // Hold to pour: the longer the hold, the more water (up to 3 s).
  const pourStart = useRef<number | null>(null);
  const [pourMs, setPourMs] = useState(0);
  const endPour = () => {
    if (pourStart.current == null) return;
    const seconds = Math.max(0.3, Math.min(3, (Date.now() - pourStart.current) / 1000));
    pourStart.current = null;
    setPourMs(0);
    onPouring(false);
    onAct("water", { seconds: Math.round(seconds * 10) / 10 });
  };
  useEffect(() => {
    if (pourStart.current == null) return;
    const id = setInterval(() => {
      const ms = Date.now() - (pourStart.current ?? Date.now());
      setPourMs(Math.min(MAX_POUR_MS, ms));
      if (ms >= MAX_POUR_MS) endPour();
    }, 50);
    return () => clearInterval(id);
  });
  const pouring = pourMs > 0;
  const water = g ? (pouring ? Math.min(100, g.moisture + (pourMs / 1000) * 15) : g.moisture) : null;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, padding: 6, borderRadius: 28, backgroundColor: GLASS }}>
      <Pressable
        onPressIn={
          g
            ? () => {
                pourStart.current = Date.now();
                setPourMs(1);
                onPouring(true);
              }
            : undefined
        }
        onPressOut={g ? endPour : undefined}
        onPress={g ? undefined : onWaterTap}
        disabled={busy === "water"}
        accessibilityRole="button"
        accessibilityLabel={g ? `Water, ${g.moisture} percent. Press and hold to pour.` : "Water your tree"}
        accessibilityActions={g ? [{ name: "activate", label: "Water" }] : undefined}
        onAccessibilityAction={g ? () => onAct("water", { seconds: 2 }) : undefined}
        style={{ flex: 1.5, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 22, backgroundColor: pouring ? "#DDF0FB" : "transparent" }}
      >
        {water != null ? <MeterRing value={water} color="#2F8FCB" icon="watering-can" iconSet="mci" /> : <Icon set="mci" name="watering-can" size={24} color="#2F8FCB" />}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "800", color: INK }}>{pouring ? "Pouring…" : "Water"}</Text>
          {g ? (
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: SOFT_INK }}>
              {pouring ? "Let go to stop" : "Hold to pour"}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {g ? (
        <>
          <DockButton
            ring={<MeterRing value={g.nutrients} color="#6FA33F" icon="nutrition" />}
            label={`${g.compost}`}
            disabled={busy === "fertilize" || g.compost < 1}
            onPress={() => onAct("fertilize")}
            a11y={`Compost, ${g.compost} left. Food ${g.nutrients} percent. Earned by logging your day.`}
          />
          <DockButton
            ring={<MeterRing value={g.mulched ? 100 : 0} color="#9A6A45" icon="layers" />}
            label={g.mulched ? `${Math.ceil(g.mulchHoursLeft / 24)}d` : `${g.mulch}`}
            disabled={busy === "mulch" || g.mulch < 1 || g.mulched}
            onPress={() => onAct("mulch")}
            a11y={`Mulch, ${g.mulch} left${g.mulched ? ", already mulched" : ""}. Earned by doing habits.`}
          />
        </>
      ) : null}
      <DockButton
        ring={
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(31,59,36,0.08)" }}>
            <Icon set="ion" name="chevron-up" size={20} color={INK} />
          </View>
        }
        label="More"
        disabled={false}
        onPress={onMore}
        a11y="Details: growth, today's tasks, this week and your forest"
      />
    </View>
  );
}

function DockButton({ ring, label, disabled, onPress, a11y }: { ring: React.ReactNode; label: string; disabled: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={{ flex: 1, alignItems: "center", gap: 1, paddingVertical: 2, opacity: disabled ? 0.5 : 1 }}
    >
      {ring}
      <Text style={{ fontSize: 11.5, fontWeight: "700", color: SOFT_INK }}>{label}</Text>
    </Pressable>
  );
}

function MeterRing({ value, color, icon, iconSet = "ion" }: { value: number; color: string; icon: string; iconSet?: "ion" | "mci" }) {
  const size = 40, r = 16, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value)) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(0,0,0,0.08)" strokeWidth={4} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Icon set={iconSet} name={icon as any} size={17} color={color} />
    </View>
  );
}

/** Level and XP, with the next decoration (in the details sheet). */
export function CareLevel({ garden: g }: { garden: ForestGardenState }) {
  return (
    <View
      accessible
      accessibilityLabel={`Care level ${g.level}, ${g.xpToNextLevel} XP to the next level.`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 20, backgroundColor: "rgba(242,178,51,0.14)" }}
    >
      <View style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
        <Svg width={40} height={40} style={{ position: "absolute" }}>
          <Circle cx={20} cy={20} r={17} stroke="rgba(0,0,0,0.08)" strokeWidth={3} fill="none" />
          <Circle cx={20} cy={20} r={17} stroke="#F2B233" strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 17 * g.levelProgress} ${2 * Math.PI * 17}`} transform="rotate(-90 20 20)" />
        </Svg>
        <Text style={{ fontSize: 14, fontWeight: "800", color: INK }}>{g.level}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "800", color: INK }}>{`Care level ${g.level}`}</Text>
        <Text style={{ fontSize: 13, color: SOFT_INK, marginTop: 2 }}>
          {g.nextDecoration ? `${g.xpToNextLevel} XP to a ${g.nextDecoration.label.toLowerCase()}` : `${g.xpToNextLevel} XP to level ${g.level + 1}`}
        </Text>
      </View>
    </View>
  );
}

export function CareFeedback({ feedback }: { feedback: { id: number; text: string; xp: number; error?: boolean } | null }) {
  const [shown, setShown] = useState(feedback);
  useEffect(() => {
    setShown(feedback);
    if (!feedback) return;
    const t = setTimeout(() => setShown(null), 2600);
    return () => clearTimeout(t);
  }, [feedback]);
  if (!shown) return null;
  return (
    <Animated.View
      key={shown.id}
      entering={FadeInDown.springify().damping(14)}
      exiting={FadeOut}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: shown.error ? "rgba(198,40,40,0.92)" : "rgba(31,59,36,0.92)",
      }}
    >
      {shown.xp ? <Text style={{ fontSize: 14, fontWeight: "800", color: "#FFE08A" }}>+{shown.xp} XP</Text> : null}
      <Text style={{ fontSize: 14, fontWeight: "600", color: "#fff" }} numberOfLines={2}>
        {shown.text}
      </Text>
    </Animated.View>
  );
}
