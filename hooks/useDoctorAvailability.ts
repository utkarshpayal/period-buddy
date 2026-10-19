import { useCallback, useEffect, useMemo, useState } from "react";
import { consultationApi, getFriendlyErrorMessage, type DoctorAvailability } from "../lib/api";
import { groupSlotsByLocalDay } from "../lib/consultationFormat";

/**
 * A doctor's bookable slots (UTC instants from the server, already without
 * past/taken times), grouped by the day they fall on in the device's time
 * zone, and the user's day + time pick. A different doctor starts the pick
 * over; `reload()` refetches (e.g. after a 409 "slot taken").
 */
export function useDoctorAvailability(doctorId: string | null) {
  const [availability, setAvailability] = useState<DoctorAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // The picked slot's `start` (sent as-is as `scheduledFor`); null until picked.
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    setAvailability(null);
    setSelectedDayKey(null);
    setSelectedSlotStart(null);
  }, [doctorId]);

  useEffect(() => {
    if (!doctorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    consultationApi
      .getDoctorAvailability(doctorId)
      .then((data) => {
        if (!cancelled) setAvailability(data);
      })
      .catch((err) => {
        if (cancelled) return;
        setAvailability(null);
        setError(getFriendlyErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, reloadKey]);

  const slotDays = useMemo(() => groupSlotsByLocalDay(availability?.slots ?? []), [availability]);
  const daySlots = useMemo(
    () => slotDays.find((d) => d.key === selectedDayKey)?.slots ?? [],
    [slotDays, selectedDayKey],
  );

  // Default to the first day that has slots; drop a picked slot that is gone.
  useEffect(() => {
    if (slotDays.length && !slotDays.some((d) => d.key === selectedDayKey)) {
      setSelectedDayKey(slotDays[0].key);
    }
  }, [slotDays, selectedDayKey]);
  useEffect(() => {
    if (selectedSlotStart && !availability?.slots?.some((s) => s.start === selectedSlotStart)) {
      setSelectedSlotStart(null);
    }
  }, [availability, selectedSlotStart]);

  const selectDay = useCallback((key: string) => {
    setSelectedDayKey(key);
    setSelectedSlotStart(null);
  }, []);

  return {
    availability,
    loading,
    error,
    reload,
    slotDays,
    daySlots,
    selectedDayKey,
    selectDay,
    selectedSlotStart,
    setSelectedSlotStart,
  };
}
