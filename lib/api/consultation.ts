import { apiRequest, toQuery } from "./client";

export type Doctor = {
  _id: string;
  /** @deprecated replaced by avatarUrl */
  avatarEmoji?: string;
  /** Profile photo set in the clinician portal. */
  avatarUrl?: string | null;
  /** @deprecated use DoctorAvailability */
  availability?: string;
  bio?: string;
  /** Always "INR". */
  currency: "INR";
  education?: string[];
  experience?: string;
  firstName?: string;
  hospital?: string;
  isAvailable: boolean;
  languages?: string[];
  lastName?: string;
  licenses?: string[];
  name?: string;
  /** Fee in rupees; missing/0 means the doctor can't be booked yet. */
  pricePerSession?: number;
  /** Average of patients' session ratings; only meaningful when ratingCount > 0. */
  rating: number;
  ratingCount?: number;
  specialty: string;
  totalConsultations?: number;
};

export type ConsultationMessage = {
  _id?: string;
  /** A file the doctor shared (https). */
  attachmentUrl?: string;
  sender: "doctor" | "user";
  sentAt?: string;
  text: string;
};

// All instants are UTC ISO 8601 strings; show them in the device's zone
// (lib/consultationFormat.ts). Chat messages come from getMessages().
export type Consultation = {
  _id: string;
  amountPaid: number;
  cancelledBy?: "doctor" | "patient" | "system";
  cancelReason?: string;
  completedAt?: string;
  createdAt?: string;
  currency: "INR";
  doctorId: Doctor | string;
  /** The patient's optional comment with their rating. */
  feedback?: string;
  meetingLink?: string;
  paymentStatus?: "failed" | "paid" | "refunded" | "unpaid";
  /** The prescription as text (every prescription has it). */
  prescription?: string;
  /** The structured prescription, when the doctor wrote one in the portal's form. */
  rx?: ConsultationRx | null;
  /** When the doctor last saved the prescription. */
  prescribedAt?: string;
  /** 1-5, set once by the patient after a completed session. */
  rating?: number;
  ratedAt?: string;
  /** Set on a cancelled paid booking: "required" until the team refunds it. */
  refundStatus?: "processed" | "required";
  scheduledFor?: string | null;
  slotEndsAt?: string | null;
  /** The doctor's IANA zone the slot was published in. */
  slotTimezone?: string;
  startedAt?: string;
  status: "active" | "cancelled" | "completed" | "paid" | "pending";
  /** When the video room (self-hosted Jitsi) can be joined, by the server's rules. Null once
   * the session is closed. */
  videoCall?: VideoCallInfo | null;
};

/** Every video call runs on the self-hosted Jitsi server (meet.thenura.care). */
export type VideoCallInfo = {
  /** false while the API has no Jitsi server configured. */
  available: boolean;
  joinOpensAt: string | null;
  joinClosesAt: string | null;
  canJoinNow: boolean;
};

/** A short-lived pass into one Jitsi room (`consultationApi.joinVideo`, `buddyApi.joinVideo`). */
export type VideoJoin = {
  domain: string;
  roomName: string;
  meetingUrl: string;
  token: string;
  role: "moderator" | "participant";
  expiresAt: string;
  joinWindow: { opensAt: string | null; closesAt: string | null };
  displayName: string;
  peerName: string;
};

export type DoctorAvailabilityRange = {
  startTime: string;
  endTime: string;
  maxSlots?: number;
  timezone?: string;
};

export type DoctorAvailabilityDay = {
  dayOfWeek: number;
  day: string;
  slots: DoctorAvailabilityRange[];
};

export type DoctorAvailability = {
  doctorId: string;
  isAvailable: boolean;
  /** The doctor's IANA zone; `days` are wall-clock times in it. */
  timezone?: string;
  /** How many days ahead `slots` cover. */
  windowDays?: number;
  /** Weekly hours, for display only. */
  days: DoctorAvailabilityDay[];
  /** Bookable slots (UTC ISO), already without past/taken ones. Book one by its `start`. */
  slots: { start: string; end: string }[];
};

export type ConsultationOrder = {
  // Present when a paid/active session already exists for this doctor — the
  // backend short-circuits order creation rather than double-charging, and
  // the caller should open this consultation directly instead of paying.
  consultation?: Consultation;
  consultationId?: string;
  orderId?: string;
  amount?: number;
  currency?: "INR";
  scheduledFor?: string;
  // Cashfree checkout session token for CashfreeCheckoutModal — absent
  // whenever `consultation` is present (no order was created).
  paymentSessionId?: string;
  /** "sandbox" | "production", passed straight through to Cashfree's JS SDK. */
  cashfreeMode?: "sandbox" | "production";
};

export type ConsultationRxMedicine = { name: string; dose?: string; frequency?: string; timing?: string; duration?: string; notes?: string };
export type ConsultationRx = {
  complaints?: string;
  diagnosis?: string;
  medicines: ConsultationRxMedicine[];
  investigations?: string;
  advice?: string;
  followUp?: string;
};

export type PrescriptionDocument = { html: string; fileName: string; number: string };

export const consultationApi = {
  getDoctors: (search?: string) =>
    apiRequest<Doctor[]>(
      `/api/consultation/doctors${toQuery({ search })}`,
    ),

  getDoctorAvailability: (doctorId: string) =>
    apiRequest<DoctorAvailability>(
      `/api/consultation/doctors/${doctorId}/availability`,
    ),

  /** `scheduledFor` is the chosen availability slot's `start`, as given. 409 = that time was just taken. */
  createOrder: (doctorId: string, scheduledFor: string) =>
    apiRequest<ConsultationOrder>("/api/consultation/order", {
      body: JSON.stringify({ doctorId, scheduledFor }),
      method: "POST",
    }),

  // Idempotent (safe to retry). 400 = payment failed; 409 = paid but the
  // booking couldn't be made (it will be refunded).
  // A pending UPI-collect approval (or any other still-open Cashfree
  // order) comes back as { pending: true } rather than a Consultation —
  // callers polling this (PaymentSheet) must check for that
  // shape before treating the response as a booked session.
  verifyPayment: (payload: { consultationId: string; orderId: string }) =>
    apiRequest<Consultation | { pending: true }>("/api/consultation/verify", {
      body: JSON.stringify(payload),
      method: "POST",
    }),

  getMyConsultations: () => apiRequest<Consultation[]>("/api/consultation/my"),

  /** The printable prescription (an A4 HTML page) once the doctor has written one. See lib/prescriptionPdf.ts. */
  getPrescription: (consultationId: string) =>
    apiRequest<PrescriptionDocument>(`/api/consultation/${consultationId}/prescription`),

  /** Works for past sessions too (read-only history). */
  getMessages: (consultationId: string) =>
    apiRequest<ConsultationMessage[]>(
      `/api/consultation/${consultationId}/messages`,
    ),

  /** Rate a completed session (once). */
  rateConsultation: (consultationId: string, rating: number, comment?: string) =>
    apiRequest<Consultation>(`/api/consultation/${consultationId}/rating`, {
      body: JSON.stringify({ rating, comment }),
      method: "POST",
    }),

  /** 403 once the session isn't paid/active any more. */
  sendMessage: (consultationId: string, text: string) =>
    apiRequest<ConsultationMessage[]>(
      `/api/consultation/${consultationId}/message`,
      {
        body: JSON.stringify({ text }),
        method: "POST",
      },
    ),

  /** Patient cancels a booking until its slot starts (paid or active); a paid one is refunded by the team.
   * Only the doctor (or the server, 3 h after the slot) completes a session. */
  cancelConsultation: (consultationId: string, reason?: string) =>
    apiRequest<Consultation>(`/api/consultation/${consultationId}/cancel`, {
      body: JSON.stringify({ reason }),
      method: "PATCH",
    }),

  /** A fresh token for this booking's Jitsi room. Refusals come back as ApiError with `code`:
   * JOIN_WINDOW_NOT_OPEN (`details.opensAt`), JOIN_WINDOW_CLOSED, CONSULTATION_NOT_LIVE,
   * PAYMENT_REQUIRED; 503 = video calls are off. Never cache the token. */
  joinVideo: (consultationId: string) =>
    apiRequest<VideoJoin>(`/api/consultation/${consultationId}/video/join`, { method: "POST" }),

  /** Informational only: never completes or changes the session. */
  reportVideoAttendance: (consultationId: string, event: "joined" | "left") =>
    apiRequest<{ recorded: true }>(`/api/consultation/${consultationId}/video/attendance`, {
      body: JSON.stringify({ event }),
      method: "POST",
    }),

  /** Decline a ringing call from the doctor. */
  declineCall: (consultationId: string) =>
    apiRequest<{ declined: true }>(`/api/consultation/${consultationId}/call/decline`, {
      method: "POST",
    }),
};

/* ------------------------------ Subscriptions ------------------------------ */
// Feature-wise + plan-wise paid access. Same order->CashfreeCheckoutModal->
// verify flow as consultationApi above; see period-buddy-be's
// subscriptionController.js for the server side.
