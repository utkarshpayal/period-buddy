import { apiRequest } from "./client";

/** One automatic notification category (backend utils/autoNotifications.js). */
export type AutoNotificationKey =
  | "health_alerts"
  | "period_late"
  | "period_upcoming"
  | "period_start"
  | "fertile_window"
  | "symptom_heads_up"
  | "phase_tips"
  | "daily_log";

export type AutoNotificationCategory = {
  key: AutoNotificationKey;
  label: string;
  description: string;
  enabled: boolean;
  /** false when an admin has turned it off for everyone. */
  available: boolean;
  pausedInPregnancy: boolean;
};

export type NotificationPreferences = {
  /** Profile push switch (User.notificationsEnabled). */
  push: boolean;
  /** false until cycle tracking is set up; the reminders need it. */
  cycleSetUp: boolean;
  pregnancyMode: boolean;
  /** Local "HH:mm" they go out at. */
  time: string;
  reminderDaysBefore: number;
  categories: AutoNotificationCategory[];
};

export const notificationsApi = {
  getPreferences: () => apiRequest<NotificationPreferences>("/api/notifications/preferences"),

  /** Any subset; returns the whole updated set. */
  savePreferences: (changes: {
    push?: boolean;
    time?: string;
    reminderDaysBefore?: number;
    categories?: Partial<Record<AutoNotificationKey, boolean>>;
  }) =>
    apiRequest<NotificationPreferences>("/api/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify({ ...changes, timezoneOffsetMinutes: new Date().getTimezoneOffset() }),
    }),
};
