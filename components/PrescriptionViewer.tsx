import { Feather } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../lib/alert";
import { getFriendlyErrorMessage, type PrescriptionDocument } from "../lib/api";
import { fetchPrescription, prescriptionAction } from "../lib/prescriptionPdf";
import { cleanupTempFiles } from "../lib/tempFiles";
import { AppModalHost } from "./modals/AppModalHost";
import { PrescriptionDocumentView } from "./PrescriptionDocumentView";
import { useTheme } from "./theme";

type Busy = "download" | "print" | null;

/**
 * Full-screen view of a prescription exactly as it prints, with Download PDF
 * and Print underneath. Loads the document when opened.
 */
export function PrescriptionViewer({
  consultationId,
  doctorName,
  visible,
  onClose,
}: {
  consultationId: string;
  doctorName?: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { colors, fonts } = useTheme();
  const [doc, setDoc] = useState<PrescriptionDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);

  const load = useCallback(async () => {
    setError(null);
    setDoc(null);
    try {
      setDoc(await fetchPrescription(consultationId));
    } catch (err) {
      setError(getFriendlyErrorMessage(err));
    }
  }, [consultationId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // A PDF saved from here has been read by the other app by now (lib/tempFiles.ts).
  const close = () => {
    cleanupTempFiles();
    onClose();
  };

  const run = async (action: "download" | "print") => {
    if (!doc || busy) return;
    setBusy(action);
    try {
      await prescriptionAction(action, { doc });
    } catch (err) {
      alert(action === "print" ? "Couldn't print" : "Couldn't download", getFriendlyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center px-5 pt-5 pb-3 gap-3">
          <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: colors.primaryLight }}>
            <Feather name="file-text" size={18} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-lg font-black" style={{ color: colors.foreground, fontFamily: fonts.heading }}>
              Prescription
            </Text>
            <Text numberOfLines={1} className="text-xs font-semibold" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
              {[doc?.number, doctorName].filter(Boolean).join(" · ") || "Loading…"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Close prescription"
            className="p-2 rounded-full"
            style={{ backgroundColor: colors.border }}
          >
            <Feather name="x" size={18} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        <View className="flex-1 mx-4 rounded-2xl overflow-hidden border" style={{ borderColor: colors.border, backgroundColor: "#fff" }}>
          {doc ? (
            <PrescriptionDocumentView html={doc.html} />
          ) : error ? (
            <View className="flex-1 items-center justify-center gap-3 px-8" style={{ backgroundColor: colors.surfaceSoft }}>
              <Feather name="alert-circle" size={26} color={colors.mutedText} />
              <Text className="text-center text-sm" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                {error}
              </Text>
              <TouchableOpacity
                onPress={load}
                accessibilityRole="button"
                className="rounded-full px-5 py-2.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="flex-1 items-center justify-center gap-3" style={{ backgroundColor: colors.surfaceSoft }}>
              <ActivityIndicator color={colors.primary} />
              <Text className="text-xs" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
                Loading your prescription…
              </Text>
            </View>
          )}
        </View>

        <View className="flex-row gap-3 px-4 pt-3 pb-4">
          <TouchableOpacity
            onPress={() => run("download")}
            disabled={!doc || busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Download prescription as PDF"
            accessibilityState={{ busy: busy === "download", disabled: !doc || busy !== null }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full py-3.5"
            style={{ backgroundColor: colors.primary, opacity: !doc || (busy && busy !== "download") ? 0.6 : 1 }}
          >
            {busy === "download" ? <ActivityIndicator size="small" color={colors.buttonText} /> : <Feather name="download" size={16} color={colors.buttonText} />}
            <Text className="text-sm font-bold" style={{ color: colors.buttonText, fontFamily: fonts.body }}>
              {busy === "download" ? "Preparing…" : "Download PDF"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => run("print")}
            disabled={!doc || busy !== null}
            accessibilityRole="button"
            accessibilityLabel="Print prescription"
            accessibilityState={{ busy: busy === "print", disabled: !doc || busy !== null }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-full py-3.5 border"
            style={{ borderColor: colors.primary, opacity: !doc || (busy && busy !== "print") ? 0.6 : 1 }}
          >
            {busy === "print" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="printer" size={16} color={colors.primary} />}
            <Text className="text-sm font-bold" style={{ color: colors.primary, fontFamily: fonts.body }}>
              Print
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="text-[11px] text-center px-6 pb-3" style={{ color: colors.mutedText, fontFamily: fonts.body }}>
          Show it at any pharmacy, on your phone or printed.
        </Text>
      </SafeAreaView>
      {/* Its alerts (a failed download or print) draw over this sheet. */}
      {visible ? <AppModalHost inline /> : null}
    </Modal>
  );
}
