import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, TouchableOpacity, View } from "react-native";
import { openAppSettings, registerModalListener } from "../../lib/modal-host";
import { useTheme } from "../theme";
import type { ModalButtonSpec, ModalIconName, ModalRequest, ModalVariant } from "./types";

const VARIANT_ICON: Record<ModalVariant, ModalIconName> = {
  default: "information-circle",
  info: "information-circle",
  success: "checkmark-circle",
  warning: "alert-circle",
  danger: "trash",
  permission: "lock-closed",
};

/**
 * Single global host for every alert/confirm/permission dialog in the app.
 * Mounted once in app/_layout.tsx; screens never render this directly —
 * they call showAlert/showPermissionModal (or the alert() shim) instead.
 */
export function AppModalHost() {
  const { colors, fonts } = useTheme();
  const [request, setRequest] = useState<ModalRequest | null>(null);

  useEffect(() => registerModalListener(setRequest), []);

  function close() {
    setRequest(null);
  }

  // Matches native Alert.alert's back-button/backdrop behavior: dismiss
  // without firing any button's onPress.
  function handleRequestClose() {
    if (request?.kind === "permission") {
      close();
      request.onCancel?.();
      return;
    }
    close();
  }

  function runButton(spec: ModalButtonSpec) {
    close();
    spec.onPress?.();
  }

  function runOpenSettings(req: Extract<ModalRequest, { kind: "permission" }>) {
    close();
    if (req.onOpenSettings) {
      req.onOpenSettings();
    } else {
      openAppSettings();
    }
  }

  function runPermissionCancel(req: Extract<ModalRequest, { kind: "permission" }>) {
    close();
    req.onCancel?.();
  }

  const variant: ModalVariant = request ? (request.kind === "permission" ? "permission" : request.variant) : "default";
  const accent = variantColors(colors, variant);
  const icon: ModalIconName = (request && "icon" in request && request.icon) || VARIANT_ICON[variant];

  const title = request?.title ?? "";
  const message = request?.message;
  const buttons: ModalButtonSpec[] =
    request?.kind === "alert"
      ? request.buttons
      : request?.kind === "permission"
        ? [
            { text: request.cancelLabel, style: "cancel" },
            { text: request.settingsLabel, style: "default" },
          ]
        : [];

  return (
    <Modal transparent animationType="fade" visible={Boolean(request)} onRequestClose={handleRequestClose}>
      <View style={{ alignItems: "center", flex: 1, justifyContent: "center", padding: 24 }}>
        <Pressable
          accessibilityLabel="Dismiss dialog"
          onPress={handleRequestClose}
          style={{ backgroundColor: colors.overlay, bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
        />

        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderRadius: 20,
            borderWidth: 1,
            maxWidth: 360,
            padding: 20,
            width: "100%",
          }}
        >
          <View
            style={{
              alignItems: "center",
              backgroundColor: accent.bg,
              borderRadius: 26,
              height: 52,
              justifyContent: "center",
              marginBottom: 14,
              width: 52,
            }}
          >
            <Ionicons name={icon} size={26} color={accent.fg} />
          </View>

          <Text
            style={{ color: colors.foreground, fontFamily: fonts.heading, fontSize: 17, fontWeight: "800" }}
          >
            {title}
          </Text>

          {message ? (
            <Text
              style={{
                color: colors.mutedText,
                fontFamily: fonts.body,
                fontSize: 13,
                fontWeight: "600",
                lineHeight: 19,
                marginTop: 6,
              }}
            >
              {message}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: buttons.length > 1 ? "row" : "column",
              gap: 10,
              marginTop: 20,
            }}
          >
            {buttons.map((spec, index) => {
              const buttonColors = buttonStyle(colors, spec.style);
              const isPermissionSettingsButton = request?.kind === "permission" && spec.style !== "cancel";

              return (
                <TouchableOpacity
                  key={`${spec.text}-${index}`}
                  accessibilityRole="button"
                  activeOpacity={0.85}
                  onPress={() =>
                    isPermissionSettingsButton && request?.kind === "permission"
                      ? runOpenSettings(request)
                      : request?.kind === "permission" && spec.style === "cancel"
                        ? runPermissionCancel(request)
                        : runButton(spec)
                  }
                  style={{
                    alignItems: "center",
                    backgroundColor: buttonColors.bg,
                    borderColor: buttonColors.border,
                    borderRadius: 14,
                    borderWidth: 1,
                    // Only stretch buttons when they share a row. In the
                    // single-button (column) layout the parent has no fixed
                    // height, and RN's `flex: 1` means flexBasis 0 — the
                    // button would collapse to just its padding, leaving a
                    // pink pill with its label clipped away (on native only;
                    // web resolves the basis differently, so it looked fine).
                    flex: buttons.length > 1 ? 1 : undefined,
                    justifyContent: "center",
                    paddingVertical: 13,
                  }}
                >
                  <Text style={{ color: buttonColors.text, fontFamily: fonts.body, fontSize: 14, fontWeight: "700" }}>
                    {spec.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function variantColors(colors: ReturnType<typeof useTheme>["colors"], variant: ModalVariant) {
  switch (variant) {
    case "danger":
      return { fg: colors.danger, bg: colors.dangerLight };
    case "warning":
      return { fg: colors.warning, bg: colors.warningLight };
    case "success":
      return { fg: colors.success, bg: colors.successLight };
    case "permission":
      return { fg: colors.primary, bg: colors.primaryLight };
    default:
      return { fg: colors.info, bg: colors.infoLight };
  }
}

function buttonStyle(colors: ReturnType<typeof useTheme>["colors"], style: ModalButtonSpec["style"]) {
  if (style === "cancel") {
    return { bg: colors.input, border: colors.border, text: colors.mutedText };
  }
  if (style === "destructive") {
    return { bg: colors.dangerLight, border: colors.danger, text: colors.danger };
  }
  return { bg: colors.primary, border: colors.primary, text: colors.buttonText };
}
