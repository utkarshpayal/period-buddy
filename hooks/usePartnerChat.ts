import { useCallback, useRef, useState } from "react";
import { isFeatureLockedError, partnerApi, type PartnerMessage } from "../lib/api";
import {
  confirmLocal,
  makeLocalId,
  mergeFetched,
  mergeIncomingMessage,
  partnerMessageId,
  setLocalStatus,
  type LocalPartnerMessage,
} from "../lib/partnerChat";

type SetMessages = (update: (prev: LocalPartnerMessage[]) => LocalPartnerMessage[]) => void;

/**
 * Send / retry / fetch / realtime-merge for a partner chat thread. The thread
 * itself is the caller's state (the owner's Partner screen keeps it locally,
 * the partner view keeps it in PartnerViewStateProvider so tabs share it).
 */
export function usePartnerChat({
  setMessages,
  onLocked,
}: {
  setMessages: SetMessages;
  /** A send was refused because the feature needs a plan: show the paywall. */
  onLocked?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const loadSeqRef = useRef(0);
  const onLockedRef = useRef(onLocked);
  onLockedRef.current = onLocked;

  const loadMessages = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const fetched = await partnerApi.getMessages();
      if (seq !== loadSeqRef.current) return;
      setMessages((prev) => mergeFetched(prev, fetched));
      setLoadError(null);
    } catch (err) {
      if (seq === loadSeqRef.current) setLoadError(err);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [setMessages]);

  const deliver = useCallback(
    async (localId: string, text: string) => {
      try {
        const result: unknown = await partnerApi.sendMessage(text);
        // The server answers with the saved message (typed as a list in
        // lib/api); anything else just marks the local copy as sent.
        const confirmed =
          result && typeof result === "object" && !Array.isArray(result) && "text" in result
            ? (result as PartnerMessage)
            : null;
        setMessages((prev) => confirmLocal(prev, localId, confirmed, partnerMessageId));
      } catch (err) {
        setMessages((prev) => setLocalStatus(prev, localId, "failed"));
        if (isFeatureLockedError(err)) onLockedRef.current?.();
      }
    },
    [setMessages],
  );

  const sendMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      const localId = makeLocalId();
      setMessages((prev) => [
        ...prev,
        { sender: "user", text, sentAt: new Date().toISOString(), localId, status: "sending" },
      ]);
      deliver(localId, text);
    },
    [deliver, setMessages],
  );

  const retryMessage = useCallback(
    (message: LocalPartnerMessage) => {
      if (!message.localId || message.status !== "failed") return;
      setMessages((prev) => setLocalStatus(prev, message.localId!, "sending"));
      deliver(message.localId, message.text);
    },
    [deliver, setMessages],
  );

  const receiveMessage = useCallback(
    (message: PartnerMessage) => setMessages((prev) => mergeIncomingMessage(prev, message)),
    [setMessages],
  );

  return { loading, loadError, loadMessages, sendMessage, retryMessage, receiveMessage };
}
