import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { alert } from "../lib/alert";
import {
  ApiError,
  getFriendlyErrorMessage,
  isFeatureLockedError,
  questionAnswerApi,
  voiceAgentApi,
  type ChatTopicId,
  type LanguageCode,
  type QaChatMessage,
  type VoiceAgentPendingAction,
} from "../lib/api";
import {
  DEFAULT_COMPANION_DISCLAIMER,
  DEFAULT_SUGGESTED_QUESTIONS,
  FALLBACK_HINT,
  isAiConsentRequired,
  isFairUseLimit,
  isSpokenConfirmation,
  matchLocalAnswer,
  URGENT_SAFETY_SOURCE,
} from "../lib/qaFallback";

export interface ChatMessage {
  disclaimer?: string;
  id: string;
  personalized?: boolean;
  sender: "user" | "companion";
  source?: string;
  suggestedQuestions?: string[];
  text: string;
  time: string;
  /**
   * `privacy`: AI is switched off in Privacy, link there. `retry`: the
   * backend couldn't answer, so this is an offline answer that wasn't saved;
   * `retryText` is the question to ask again.
   */
  action?: "privacy" | "retry";
  retryText?: string;
}

/** The bits of useVoiceChat the conversation needs (passed as a ref: that hook is created after this one). */
export type QaVoiceBridge = {
  isVoiceModeOn: () => boolean;
  getLanguage: () => LanguageCode;
  setVoiceMode: (on: boolean) => void;
  captionHeard: (heard: string) => void;
  replyAloud: (id: string, heard: string, text: string, speakIt?: boolean) => void;
};

const GREETING: ChatMessage = {
  disclaimer: DEFAULT_COMPANION_DISCLAIMER,
  id: "init_1",
  sender: "companion",
  suggestedQuestions: DEFAULT_SUGGESTED_QUESTIONS,
  text: "Hi, I am Nura AI. Ask anything about periods, discharge, cramps, hygiene, intimacy, partner questions, or body changes. I can share general education, and I will point you toward care when symptoms sound urgent.",
  time: "9:41 AM",
};

const CONSENT_TEXT =
  "Nura AI is switched off in your privacy settings, so I can't answer right now. Turn on AI features in Data privacy & security to keep chatting.";

let messageSeq = 0;
function messageId(prefix: "u" | "c") {
  messageSeq += 1;
  return `msg_${prefix}_${Date.now()}_${messageSeq}`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function companion(text: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: messageId("c"), sender: "companion", text, time: formatTime(new Date()), ...extra };
}

function toChatMessage(message: QaChatMessage): ChatMessage {
  return {
    disclaimer: message.disclaimer,
    id: message.id,
    personalized: message.personalized,
    sender: message.role === "assistant" ? "companion" : "user",
    source: message.source,
    suggestedQuestions: message.suggestedQuestions,
    text: message.text,
    time: formatTime(new Date(message.createdAt)),
  };
}

/**
 * Nura AI's conversation (app/(app)/qa.tsx): the message list, the chat
 * session it's saved to, and both send paths — typed questions through the
 * session API, spoken turns through the voice agent.
 *
 * Guards: one turn at a time (a ref, so a double tap can't start two), no
 * sending while a resumed chat is still loading (it would split the
 * conversation), and nothing touches state after the screen has gone.
 */
export function useQaConversation({
  sessionIdParam,
  initialTopicId,
  voice,
  onPaywall,
  onQuestionSent,
}: {
  sessionIdParam?: string;
  initialTopicId: ChatTopicId | null;
  voice: MutableRefObject<QaVoiceBridge | null>;
  onPaywall: () => void;
  onQuestionSent?: () => void;
}) {
  const [chatLog, setChatLogState] = useState<ChatMessage[]>([GREETING]);
  const chatLogRef = useRef(chatLog);
  const [isCompanionTyping, setIsCompanionTyping] = useState(false);
  const typingRef = useRef(false);
  const [activeTopicId, setActiveTopicIdState] = useState<ChatTopicId | null>(initialTopicId);
  const activeTopicRef = useRef(activeTopicId);
  // The backend chat session this conversation is saved to, once one exists:
  // created lazily on the first message (or set when resuming from history)
  // so idle browsing never creates empty sessions.
  const sessionIdRef = useRef<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(Boolean(sessionIdParam));
  const loadingSessionRef = useRef(Boolean(sessionIdParam));
  const pendingActionRef = useRef<VoiceAgentPendingAction | undefined>(undefined);
  const languageOf = useCallback((): LanguageCode => voice.current?.getLanguage() ?? "en-IN", [voice]);
  const callbacksRef = useRef({ onPaywall, onQuestionSent });
  callbacksRef.current = { onPaywall, onQuestionSent };
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const updateChatLog = useCallback((update: (prev: ChatMessage[]) => ChatMessage[]) => {
    chatLogRef.current = update(chatLogRef.current);
    setChatLogState(chatLogRef.current);
  }, []);
  const append = useCallback((message: ChatMessage) => updateChatLog((prev) => [...prev, message]), [updateChatLog]);

  const setTyping = useCallback((on: boolean) => {
    typingRef.current = on;
    setIsCompanionTyping(on);
  }, []);

  const setActiveTopicId = useCallback((update: ChatTopicId | null | ((prev: ChatTopicId | null) => ChatTopicId | null)) => {
    const next = typeof update === "function" ? update(activeTopicRef.current) : update;
    activeTopicRef.current = next;
    setActiveTopicIdState(next);
  }, []);

  // Resuming a chat from history: swap the greeting for the session's real
  // messages and pick up its topic, so new questions are scoped and saved
  // the same way the chat was started.
  useEffect(() => {
    if (!sessionIdParam) return;
    let isMounted = true;
    loadingSessionRef.current = true;
    setIsLoadingSession(true);
    questionAnswerApi
      .getSession(sessionIdParam)
      .then((session) => {
        if (!isMounted) return;
        sessionIdRef.current = session.id;
        setActiveTopicId(session.topicId === "general" ? null : session.topicId);
        if (session.messages.length) updateChatLog(() => session.messages.map(toChatMessage));
      })
      .catch((error) => {
        if (isMounted) alert("Couldn't open that chat", getFriendlyErrorMessage(error));
      })
      .finally(() => {
        if (!isMounted) return;
        loadingSessionRef.current = false;
        setIsLoadingSession(false);
      });
    return () => {
      isMounted = false;
    };
  }, [sessionIdParam, setActiveTopicId, updateChatLog]);

  /** Asks the backend (saving the turn to the session), else an unsaved offline answer. Null = stopped (paywall). */
  const answer = useCallback(async (question: string): Promise<ChatMessage | null> => {
    let sessionId = sessionIdRef.current;
    if (!sessionId) {
      try {
        const session = await questionAnswerApi.createSession(activeTopicRef.current ?? undefined);
        // A resumed or earlier session wins over one created in a race.
        sessionIdRef.current ??= session.id;
        sessionId = sessionIdRef.current;
      } catch (error) {
        if (isAiConsentRequired(error)) return companion(CONSENT_TEXT, { action: "privacy" });
        // The topic's age restriction (chatSessionController#createChatSession):
        // stop with its message instead of answering unscoped.
        if (error instanceof ApiError && error.status === 403) return companion(error.message);
        if (isFeatureLockedError(error)) {
          callbacksRef.current.onPaywall();
          return null;
        }
        // Offline / server error: fall through to the offline answer below.
      }
    }

    if (sessionId) {
      try {
        const result = await questionAnswerApi.sendSessionMessage(sessionId, question, languageOf());
        return companion(result.answer, {
          disclaimer: result.disclaimer ?? DEFAULT_COMPANION_DISCLAIMER,
          personalized: Boolean(result.personalized),
          source: result.source,
          suggestedQuestions: result.suggestedQuestions?.length ? result.suggestedQuestions : DEFAULT_SUGGESTED_QUESTIONS,
        });
      } catch (error) {
        if (isFeatureLockedError(error)) {
          callbacksRef.current.onPaywall();
          return null;
        }
        if (isAiConsentRequired(error)) return companion(CONSENT_TEXT, { action: "privacy" });
        // Today's messages are used up: say so, unless it's a red flag, which
        // falls through to the offline safety answer below.
        if (isFairUseLimit(error) && matchLocalAnswer(question)?.source !== URGENT_SAFETY_SOURCE) {
          return companion(getFriendlyErrorMessage(error));
        }
      }
    }

    // The backend couldn't answer: say so, and offer to try again, rather
    // than passing an offline keyword answer off as a normal one.
    const offline = { action: "retry" as const, retryText: question, disclaimer: DEFAULT_COMPANION_DISCLAIMER, suggestedQuestions: DEFAULT_SUGGESTED_QUESTIONS };
    try {
      const result = await questionAnswerApi.getQuestions({ search: question.toLowerCase(), limit: 1 });
      const matched = result.data?.[0] ?? result.questions?.[0];
      if (matched?.answer) return companion(matched.answer, { ...offline, source: "knowledge_base" });
    } catch {
      // Offline too: the bundled answers below.
    }
    const local = matchLocalAnswer(question);
    return companion(local?.text ?? FALLBACK_HINT, { ...offline, source: local?.source ?? "local_fallback" });
  }, [languageOf]);

  const runTurn = useCallback(
    async (question: string) => {
      setTyping(true);
      try {
        const reply = await answer(question);
        if (!mountedRef.current || !reply) return;
        append(reply);
        voice.current?.replyAloud(reply.id, question, reply.text);
      } finally {
        if (mountedRef.current) setTyping(false);
      }
    },
    [answer, append, setTyping, voice],
  );

  /** A typed (or tapped) question. False when it couldn't be sent right now. */
  const sendQuestion = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || typingRef.current || loadingSessionRef.current) return false;
      append({ id: messageId("u"), sender: "user", text: question, time: formatTime(new Date()) });
      callbacksRef.current.onQuestionSent?.();
      void runTurn(question);
      return true;
    },
    [append, runTurn],
  );

  /** Re-asks the question behind an unsaved offline answer, replacing that answer. */
  const retry = useCallback(
    (message: ChatMessage) => {
      if (!message.retryText || typingRef.current || loadingSessionRef.current) return;
      updateChatLog((prev) => prev.filter((m) => m.id !== message.id));
      void runTurn(message.retryText);
    },
    [runTurn, updateChatLog],
  );

  /**
   * Voice mode's action-capable path: transcripts go to the backend voice
   * agent instead of the Q&A endpoint, so a spoken "log today's entry" can be
   * gathered and saved through a short back-and-forth.
   */
  const sendVoiceTurn = useCallback(
    async (transcript: string) => {
      const heard = transcript.trim();
      if (!heard || typingRef.current || loadingSessionRef.current) return;
      const history = chatLogRef.current
        .filter((m) => !m.id.startsWith("init_"))
        .slice(-8)
        .map((m) => ({ role: m.sender === "user" ? ("user" as const) : ("assistant" as const), text: m.text }));
      append({ id: messageId("u"), sender: "user", text: heard, time: formatTime(new Date()) });
      voice.current?.captionHeard(heard);
      setTyping(true);

      try {
        const pending = pendingActionRef.current;
        const confirming = Boolean(pending) && isSpokenConfirmation(heard);
        const reply = await voiceAgentApi.converse(heard, languageOf(), pending, confirming, history);
        if (!mountedRef.current) return;

        let text: string;
        if (reply.type === "action_proposal") {
          text = reply.followUpQuestion ?? "Can you tell me a bit more?";
          pendingActionRef.current = { action: reply.action, payload: reply.payload };
        } else if (reply.type === "action_confirm") {
          text = reply.confirmationText;
          pendingActionRef.current = { action: reply.action, payload: reply.payload };
        } else {
          text = reply.text;
          pendingActionRef.current = undefined;
        }
        const message = companion(text);
        append(message);
        voice.current?.replyAloud(message.id, heard, message.text);
      } catch (error) {
        if (!mountedRef.current) return;
        if (isFeatureLockedError(error)) {
          voice.current?.setVoiceMode(false);
          callbacksRef.current.onPaywall();
        } else if (isAiConsentRequired(error)) {
          // The overlay can't link anywhere: leave it so the message (and its link) shows.
          voice.current?.setVoiceMode(false);
          append(companion(CONSENT_TEXT, { action: "privacy" }));
        } else {
          const message = companion(getFriendlyErrorMessage(error) || "Sorry, I couldn't process that just now.");
          append(message);
          voice.current?.replyAloud(message.id, heard, message.text);
        }
      } finally {
        if (mountedRef.current) setTyping(false);
      }
    },
    [append, languageOf, setTyping, voice],
  );

  return {
    chatLog,
    isCompanionTyping,
    isLoadingSession,
    activeTopicId,
    setActiveTopicId,
    sendQuestion,
    sendVoiceTurn,
    retry,
  };
}
