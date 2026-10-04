// Which consultation chat is open on screen right now (null when none). The
// consultation screen sets it; the app-wide ringing UI
// (components/IncomingCallOverlay.tsx) reads it so it stays quiet when that
// chat's own in-screen call UI is already showing the call.
let openChatId: string | null = null;

export function setOpenConsultationChat(id: string | null) {
  openChatId = id;
}

export function getOpenConsultationChat(): string | null {
  return openChatId;
}
