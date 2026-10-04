/**
 * Camera + mic for a video call in the browser, with a readable reason when
 * it can't be had. When only the camera is unavailable (none, or in use by
 * another app/browser — common when testing both sides on one laptop), the
 * call goes ahead with the mic only.
 */
export class CallMediaError extends Error {}

const errorName = (err: unknown) => (err as { name?: string } | null)?.name ?? "";

const blockedReason = "Camera/mic access is blocked. Allow it from the icon in the address bar, then try again.";

export async function getCallMedia(video: MediaTrackConstraints): Promise<{ stream: MediaStream; videoMissing: boolean }> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CallMediaError(
      window.isSecureContext
        ? "This browser can't use a camera or mic."
        : "Calls need a secure page: open this on https or http://localhost, not a network address.",
    );
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true, video }), videoMissing: false };
  } catch (err) {
    if (["NotAllowedError", "SecurityError"].includes(errorName(err))) throw new CallMediaError(blockedReason);
    console.warn("Camera unavailable, trying mic only:", err);
  }
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ audio: true }), videoMissing: true };
  } catch (err) {
    const name = errorName(err);
    if (["NotAllowedError", "SecurityError"].includes(name)) throw new CallMediaError(blockedReason);
    if (name === "NotFoundError") throw new CallMediaError("No microphone found.");
    if (name === "NotReadableError" || name === "AbortError") {
      throw new CallMediaError("Mic is in use by another app or browser. Close it and try again.");
    }
    throw new CallMediaError("Couldn't access camera/mic");
  }
}
