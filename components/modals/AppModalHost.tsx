import React, { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import Animated, { FadeIn, withSpring, withTiming } from "react-native-reanimated";
import { Button } from "../Button";
import { motion } from "../motion";
import { getShadow } from "../ui-tokens";
import { openAppSettings, registerModalListener } from "../../lib/modal-host";
import { AppLockCover } from "../AppLockScreen";
import { LaunchSheet } from "../LaunchSheet";
import { useTheme } from "../theme";
import type { ModalButtonSpec, ModalIconName, ModalRequest, ModalVariant } from "./types";
import { Icon } from "../Icon";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Dialogs settle in from slightly smaller, with no overshoot.
function dialogEntering() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: motion.duration.fast }),
      transform: [{ scale: withSpring(1, motion.spring) }],
    },
  };
}

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
 * Mounted once in app/_layout.tsx; screens call showAlert/showPermissionModal
 * (or the alert() shim) instead of rendering it. The one exception: a
 * component that renders its own <Modal> mounts `<AppModalHost inline />`
 * as that modal's last child, so alerts raised while it's open draw inside
 * it. The root host is a separate Modal and would end up behind it (web) or
 * fail to present at all (iOS). An inline host also covers its Modal with the
 * App Lock screen while the app is locked (AppLockCover), since that Modal
 * draws above the root lock.
 */
export function AppModalHost({ inline = false }: { inline?: boolean }) {
  const { colors, fonts, isDark } = useTheme();
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

  // Launch sheets are a bottom sheet with their own layout and state.
  if (request?.kind === "launch") {
    const sheet = <LaunchSheet key={request.id} request={request} onClose={close} />;
    return inline ? (
      <>
        <AppLockCover />
        {sheet}
      </>
    ) : (
      sheet
    );
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

  const dialog = (
    <View
      style={
        inline
          ? {
              alignItems: "center",
              bottom: 0,
              justifyContent: "center",
              left: 0,
              padding: 24,
              position: "absolute",
              right: 0,
              top: 0,
              zIndex: 1000,
              elevation: 1000,
            }
          : {
              alignItems: "center",
              flex: 1,
              justifyContent: "center",
              padding: 24,
            }
      }
    >
      <AnimatedPressable
        entering={FadeIn.duration(motion.duration.base)}
        accessibilityLabel="Dismiss dialog"
        onPress={handleRequestClose}
        style={{
          backgroundColor: colors.overlay,
          bottom: 0,
          left: 0,
          position: "absolute",
          right: 0,
          top: 0,
        }}
      />

      <Animated.View
        key={request?.id}
        entering={dialogEntering}
        accessibilityViewIsModal
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderRadius: 28,
          borderCurve: "continuous",
          maxWidth: 360,
          paddingHorizontal: 22,
          paddingTop: 26,
          paddingBottom: 22,
          width: "100%",
          ...getShadow(colors, isDark),
        }}
      >
        {/* Icon in a tinted halo with a faint outer ring, like the empty states. */}
        <View
          style={{
            alignItems: "center",
            backgroundColor: accent.bg,
            borderRadius: 32,
            height: 64,
            justifyContent: "center",
            marginBottom: 16,
            width: 64,
            borderWidth: 6,
            borderColor: colors.surfaceSoft,
          }}
        >
          <Icon set="ion" name={icon} size={26} color={accent.fg} />
        </View>

        <Text
          accessibilityRole="header"
          style={{
            color: colors.foreground,
            fontFamily: fonts.heading,
            fontSize: 18,
            fontWeight: "800",
            letterSpacing: -0.3,
            lineHeight: 24,
            textAlign: "center",
          }}
        >
          {title}
        </Text>

        {message ? (
          <Text
            style={{
              color: colors.mutedText,
              fontFamily: fonts.body,
              fontSize: 14,
              lineHeight: 20,
              marginTop: 8,
              textAlign: "center",
            }}
          >
            {message}
          </Text>
        ) : null}

        <View
          style={{
            alignSelf: "stretch",
            // Side by side for two actions; stacked (first one on top) for one or three+.
            flexDirection: buttons.length === 2 ? "row" : "column",
            gap: 10,
            marginTop: 22,
          }}
        >
          {buttons.map((spec, index) => {
            const isPermissionSettingsButton = request?.kind === "permission" && spec.style !== "cancel";
            return (
              <Button
                key={`${spec.text}-${index}`}
                label={spec.text}
                size="md"
                variant={spec.style === "cancel" ? "neutral" : spec.style === "destructive" ? "danger" : "primary"}
                onPress={() =>
                  isPermissionSettingsButton && request?.kind === "permission"
                    ? runOpenSettings(request)
                    : request?.kind === "permission" && spec.style === "cancel"
                      ? runPermissionCancel(request)
                      : runButton(spec)
                }
                style={buttons.length === 2 ? { flex: 1, paddingHorizontal: 12 } : undefined}
              />
            );
          })}
        </View>
      </Animated.View>
    </View>
  );

  if (inline) {
    // The cover goes first so the lock screen's own "Can't unlock?" dialog
    // (raised to the newest host, i.e. this one) still draws above it.
    return (
      <>
        <AppLockCover />
        {request ? dialog : null}
      </>
    );
  }

  return (
    <Modal transparent animationType="none" statusBarTranslucent visible={Boolean(request)} onRequestClose={handleRequestClose}>
      {dialog}
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
