import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import type { ChatTopicId } from "./api";

// Topic starter grid shown before the first real exchange in the Nura AI
// chat, plus the same metadata used to render each row in the chat history
// list. `id` must match the backend's CHAT_TOPICS ids (period-buddy-be's
// utils/companionChat.js) — a session created with this id gets a
// topic-scoped AI system prompt there. `tint` keys into
// getLogCategoryTints() so each topic reuses an existing category color
// instead of introducing new ones.

/** One field of a topic's short intake form — shown after picking a topic
 * chip, before the chat opens, so the AI's first answer already has real
 * context instead of a bare topic label. `type: "choice"` renders as tap
 * chips (single-select, required unless `optional`); `type: "input"` renders
 * as a free-text box (always optional in practice — there's nothing to
 * validate). Answers are folded into one opening chat message client-side;
 * the backend never sees the form shape, just the resulting text. */
export type ChatTopicIntakeQuestion = {
  id: string;
  label: string;
  type: "choice" | "input";
  options?: string[];
  optional?: boolean;
  placeholder?: string;
};

export type ChatTopic = {
  icon: ComponentProps<typeof Feather>["name"];
  id: ChatTopicId;
  label: string;
  /** Starter question chips — only used for topics with no `intake` form
   * (currently just "Other"), where a short form doesn't make sense. */
  questions: string[];
  tint: "flow" | "symptoms" | "discharge" | "mood" | "sex" | "digestion" | "skin";
  /** Minimum age (years, from the user's profile dateOfBirth) required to
   * open this topic. Enforced both here (tile shown locked, can't be
   * opened) and again server-side in createChatSession — the client check
   * is just so the tile visibly explains itself instead of failing silently
   * after a tap. */
  minAge?: number;
  intake?: ChatTopicIntakeQuestion[];
};

export const CHAT_TOPICS: ChatTopic[] = [
  {
    icon: "droplet",
    id: "cycle",
    label: "Periods & Cycle",
    questions: [
      "What's a normal cycle length?",
      "Why is my period late this month?",
      "Is spotting between periods normal?",
    ],
    tint: "flow",
    intake: [
      {
        id: "concern",
        label: "What's your main concern?",
        type: "choice",
        options: ["Period is late", "Cycle is irregular", "Spotting between periods", "Just want to track better"],
      },
      { id: "details", label: "Anything else you'd like to add?", type: "input", optional: true, placeholder: "Optional — add any detail" },
    ],
  },
  {
    icon: "activity",
    id: "symptoms",
    label: "Symptoms & Pain",
    questions: [
      "Why are my cramps worse this month?",
      "Is period poop a real thing?",
      "What helps with period headaches?",
    ],
    tint: "symptoms",
    intake: [
      {
        id: "symptom",
        label: "What type of symptom?",
        type: "choice",
        options: ["Cramps", "Headache", "Bloating", "Nausea", "Other"],
      },
      { id: "duration", label: "How long has this been going on?", type: "input", optional: true, placeholder: "Optional — e.g. 2 days" },
    ],
  },
  {
    icon: "shield",
    id: "hygiene",
    label: "Hygiene & Care",
    questions: [
      "How should I clean during my period?",
      "How often should I change my pad or tampon?",
      "Is it safe to use a menstrual cup?",
    ],
    tint: "discharge",
    intake: [
      {
        id: "need",
        label: "What do you need help with?",
        type: "choice",
        options: ["Pads & tampons", "Menstrual cup", "Washing & cleaning", "Odor or discomfort"],
      },
      { id: "details", label: "Anything specific you're worried about?", type: "input", optional: true, placeholder: "Optional — add any detail" },
    ],
  },
  {
    icon: "heart",
    id: "mood",
    label: "Mood & PMS",
    questions: [
      "Why do I feel so emotional before my period?",
      "How can I manage PMS mood swings?",
      "Is it normal to feel low energy on my period?",
    ],
    tint: "mood",
    intake: [
      {
        id: "feeling",
        label: "How are you feeling?",
        type: "choice",
        options: ["Irritable", "Sad or low", "Anxious", "Mood swings", "Low energy"],
      },
      { id: "timing", label: "When does this usually happen in your cycle?", type: "input", optional: true, placeholder: "Optional — e.g. week before my period" },
    ],
  },
  {
    icon: "users",
    id: "partner",
    label: "Sex & Intimacy",
    questions: [
      "Is sex during periods safe?",
      "How do I talk to my partner about PMS?",
      "Can a menstrual cup affect my hymen?",
    ],
    tint: "sex",
    minAge: 18,
    intake: [
      {
        id: "topic",
        label: "What would you like to know about?",
        type: "choice",
        options: ["Safety during periods", "Talking to my partner", "Pain or discomfort", "General questions"],
      },
      { id: "details", label: "Anything you'd like to add?", type: "input", optional: true, placeholder: "Optional — add any detail" },
    ],
  },
  {
    icon: "coffee",
    id: "nutrition",
    label: "Nutrition & Wellness",
    questions: [
      "What foods help with period cramps?",
      "Should I exercise during my period?",
      "Does diet affect cycle regularity?",
    ],
    tint: "digestion",
    intake: [
      {
        id: "need",
        label: "What are you looking for?",
        type: "choice",
        options: ["Foods to help with cramps", "Exercise during periods", "General diet tips", "Something else"],
      },
      { id: "details", label: "Anything specific?", type: "input", optional: true, placeholder: "Optional — add any detail" },
    ],
  },
  {
    // Explicit escape hatch for anything that doesn't fit the buckets above —
    // maps to topicId "general", which the backend leaves unscoped (no
    // topic-restriction system prompt), same as typing a question with no
    // topic chip tapped at all. No intake form — it's the "skip the form"
    // option by design.
    icon: "more-horizontal",
    id: "general",
    label: "Other",
    questions: [
      "Is brown period blood normal?",
      "Why are cramps worse this month?",
      "How should I clean during my period?",
    ],
    tint: "skin",
  },
];

export function getChatTopic(topicId?: string | null): ChatTopic | undefined {
  return CHAT_TOPICS.find((topic) => topic.id === topicId);
}

/** Whole-number age from a profile `dateOfBirth`, or null if unset/invalid —
 * mirrors the backend's own age calc in utils/companionChat.js so the
 * client-side minAge check agrees with what the server will decide. */
export function computeAge(dateOfBirth?: string | null): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  return age > 0 && age < 130 ? age : null;
}

export function isTopicLocked(topic: ChatTopic, dateOfBirth?: string | null): boolean {
  if (!topic.minAge) return false;
  const age = computeAge(dateOfBirth);
  return age === null || age < topic.minAge;
}

/** Turns a filled-in intake form into one natural opening chat message, so
 * the rest of the app (session creation, sending, chat history) never needs
 * to know the form existed — it just sees a normal first user message. */
export function composeIntakeMessage(topic: ChatTopic, answers: Record<string, string>): string {
  const parts = (topic.intake ?? [])
    .map((question) => answers[question.id]?.trim())
    .filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(". ") : topic.label;
}
