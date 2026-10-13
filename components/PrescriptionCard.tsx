import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { alert } from "../lib/alert";
import { getFriendlyErrorMessage, type Consultation } from "../lib/api";
import { prescriptionAction } from "../lib/prescriptionPdf";
import { PrescriptionViewer } from "./PrescriptionViewer";
import { useTheme } from "./theme";

const MAX_LISTED = 3;

const formatDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";

/**
 * The prescription at the top of a consultation chat: who prescribed it and
 * when, the medicines at a glance, and View / Download PDF / Print. Older
 * prescriptions (free text, no `rx`) show their text instead of the list.
 */
export function PrescriptionCard({ consultation, doctorName }: { consultation: Consultation; doctorName?: string }) {
  const { colors, fonts } = useTheme();
  const [viewing, setViewing] = useState(false);
  const [busy, setBusy] = useState<"download" | "print" | null>(null);
  const rx = consultation.rx;
  const medicines = rx?.medicines ?? [];
  const issued = formatDay(consultation.prescribedAt ?? consultation.completedAt ?? consultation.startedAt);

  const run = async (action: "download" | "print") => {
    if (busy) return;
    setBusy(action);
    try {
      await prescriptionAction(action, { consultationId: consultation._id });
    } catch (err) {
      alert(action === "print" ? "Couldn't print" : "Couldn't download", getFriendlyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="rounded-2xl mb-4 border overflow-hidden" style={{ backgroundColor: colors.surface, borderColor: colors.primary }}>
      <View className="flex-row items-center gap-3 px-4 pt-4 pb-3" style={{ backgroundColor: colors.primaryLight }}>
        <View className="w-9 h-9 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primary }}>
          <Text style={{ color: colors.buttonText, fontFamily: "Georgia", fontSize: 18, fontWeight: "700" }}>℞</Text>
        </View>
        <View className="flex-1">
          <Text className="text-sm font-extrabold" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
            Your prescription
          </Text>
          <Text numberOfLines={1} className="text-xs" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            {[doctorName, issued].filter(Boolean).join(" · ")}
          </Text>
        </View>
      </View>

      <View className="px-4 pt-3">
        {rx?.diagnosis ? (
          <Text className="text-xs mb-2" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
            Diagnosis: <Text style={{ color: colors.foreground, fontWeight: "700" }}>{rx.diagnosis}</Text>
          </Text>
        ) : null}

        {medicines.length ? (
          <View className="gap-2">
            {medicines.slice(0, MAX_LISTED).map((m, i) => (
              <View key={i} className="flex-row gap-2">
                <Feather name="check-circle" size={14} color={colors.primary} style={{ marginTop: 2 }} />
                <View className="flex-1">
                  <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                    {m.name}
                  </Text>
                  <Text className="text-xs" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                    {[m.dose, m.frequency, m.timing, m.duration].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
            ))}
            {medicines.length > MAX_LISTED ? (
              <Text className="text-xs font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
                +{medicines.length - MAX_LISTED} more in the full prescription
              </Text>
            ) : null}
          </View>
        ) : (
          <Text numberOfLines={5} className="text-sm leading-5" style={{ color: colors.foreground, fontFamily: fonts.body }}>
            {consultation.prescription}
          </Text>
        )}

        {rx?.followUp ? (
          <View className="flex-row items-center gap-1.5 mt-3">
            <Feather name="calendar" size={13} color={colors.mutedText} />
            <Text className="text-xs" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              Follow-up: <Text style={{ color: colors.foreground, fontWeight: "700" }}>{rx.followUp}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      <View className="px-4 pt-4 pb-4 gap-2.5">
        <TouchableOpacity
          onPress={() => setViewing(true)}
          accessibilityRole="button"
          accessibilityLabel="View full prescription"
          className="flex-row items-center justify-center gap-2 rounded-full py-3"
          style={{ backgroundColor: colors.primary }}
        >
          <Feather name="eye" size={16} color={colors.buttonText} />
          <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
            View prescription
          </Text>
        </TouchableOpacity>
        <View className="flex-row gap-2.5">
          {(["download", "print"] as const).map((action) => (
            <TouchableOpacity
              key={action}
              onPress={() => run(action)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={action === "download" ? "Download prescription as PDF" : "Print prescription"}
              accessibilityState={{ busy: busy === action, disabled: busy !== null }}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-full py-2.5 border"
              style={{ borderColor: colors.border, opacity: busy && busy !== action ? 0.6 : 1 }}
            >
              {busy === action ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name={action === "download" ? "download" : "printer"} size={15} color={colors.primary} />
              )}
              <Text className="text-sm font-bold" style={{ color: colors.foreground, fontFamily: fonts.body }}>
                {action === "download" ? (busy === "download" ? "Preparing…" : "Download PDF") : "Print"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <PrescriptionViewer consultationId={consultation._id} doctorName={doctorName} visible={viewing} onClose={() => setViewing(false)} />
    </View>
  );
}
