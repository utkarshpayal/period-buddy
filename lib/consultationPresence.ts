// The video call that's open (components/JitsiCall): a consultation id, or
// "buddy". The app-wide ringer (IncomingCallOverlay) stays quiet for it.
let openVideoCallId: string | null = null;

export function setOpenVideoCall(id: string | null) {
  openVideoCallId = id;
}

export function getOpenVideoCall(): string | null {
  return openVideoCallId;
}
