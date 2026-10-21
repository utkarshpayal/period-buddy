import { alert } from "../../lib/alert";
import type { ChatTopic } from "../../lib/chatTopics";

/** Tapping an age-locked topic (Sex & Intimacy under 18, or no birthday yet). */
export function showTopicLockedAlert(topic: ChatTopic) {
  alert(
    "Age verification needed",
    `${topic.label} unlocks once your profile shows you're ${topic.minAge}+. Add your birthday in Profile → Edit profile.`,
  );
}
