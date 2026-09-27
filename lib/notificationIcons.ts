import type { Ionicons } from "@expo/vector-icons";
import type { AppNotification } from "./api";

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Accent per icon for the notifications list. Mid-tone hexes so the glyph
 * reads on its 12% wash in both light and dark themes.
 */
const TONES = {
  rose: "#E8618F",
  violet: "#7C5CC4",
  blue: "#2D7FB8",
  teal: "#2E9C7E",
  amber: "#D98A1E",
  orange: "#E0703A",
  red: "#D64545",
  green: "#3F9B5A",
} as const;

/**
 * Icons an admin can pick for a push (Admin Workspace → Push notifications).
 * Must match NOTIFICATION_ICONS in The-Nura-Backend/src/utils/notificationRoute.js.
 */
export const ADMIN_NOTIFICATION_ICONS: Record<string, string> = {
  megaphone: TONES.rose,
  sparkles: TONES.violet,
  gift: TONES.orange,
  pricetag: TONES.amber,
  heart: TONES.rose,
  flower: TONES.violet,
  water: TONES.red,
  moon: TONES.violet,
  calendar: TONES.blue,
  alarm: TONES.orange,
  medkit: TONES.blue,
  fitness: TONES.teal,
  leaf: TONES.green,
  cafe: TONES.amber,
  book: TONES.blue,
  "play-circle": TONES.red,
  "chatbubble-ellipses": TONES.violet,
  people: TONES.teal,
  trophy: TONES.amber,
  star: TONES.amber,
  flame: TONES.orange,
  "shield-checkmark": TONES.green,
};

const TYPE_ICONS: Record<AppNotification["type"], { icon: IconName; color: string }> = {
  buddy_message: { icon: "chatbubble-ellipses", color: TONES.violet },
  community_reply: { icon: "people", color: TONES.teal },
  consultation_update: { icon: "medkit", color: TONES.blue },
  habit_reminder: { icon: "checkmark-circle", color: TONES.green },
  ovulation_reminder: { icon: "flower", color: TONES.violet },
  partner_message: { icon: "heart", color: TONES.rose },
  period_reminder: { icon: "water", color: TONES.red },
  reward_earned: { icon: "gift", color: TONES.orange },
  streak_bonus: { icon: "flame", color: TONES.orange },
  system: { icon: "megaphone", color: TONES.rose },
};

/** The admin-chosen icon when it's one we know, else the type's default. */
export function notificationIcon(notif: Pick<AppNotification, "type" | "data">): { icon: IconName; color: string } {
  const picked = notif.data?.icon;
  if (typeof picked === "string" && picked in ADMIN_NOTIFICATION_ICONS) {
    return { icon: picked as IconName, color: ADMIN_NOTIFICATION_ICONS[picked] };
  }
  return TYPE_ICONS[notif.type] ?? TYPE_ICONS.system;
}

/** An admin push's big picture, if it has a usable https one. */
export function notificationImage(notif: Pick<AppNotification, "data">): string | null {
  const image = notif.data?.image;
  return typeof image === "string" && image.startsWith("https://") ? image : null;
}
