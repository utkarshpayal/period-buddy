import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { BackHandler, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../lib/alert";
import { useAppLock } from "./AppLock";
import { useAuth } from "./auth-context";
import { useTheme } from "./theme";
import { Icon } from "./Icon";

/**
 * Full-screen lock. The root instance (app/_layout.tsx) covers the Stack and
 * opens the OS prompt on mount. `autoPrompt={false}` is the copy drawn inside
 * other native Modals (see AppLockCover), which sit above the root one.
 */
export function AppLockScreen({ autoPrompt = true }: { autoPrompt?: boolean }) {
  const { colors, isDark, fonts } = useTheme();
  const { deviceLockLabel, unlock, disableLock } = useAppLock();
  const { signOut } = useAuth();
  const router = useRouter();
  const [hint, setHint] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const triggerUnlock = React.useCallback(async () => {
    setIsAuthenticating(true);
    setHint("");
    try {
      const result = await unlock();
      if (!result.success) setHint(result.error ?? "Try again");
    } finally {
      setIsAuthenticating(false);
    }
  }, [unlock]);

  useEffect(() => {
    if (autoPrompt) void triggerUnlock();
    // Only fire once when the lock screen mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android Back would otherwise pop the screen underneath (or a Modal
  // above it) while the app is locked.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  const handleForgot = () => {
    alert(
      "Can't get back in?",
      "You can sign out and log back in with your account password. This turns App Lock off — you can set it up again from Profile afterwards.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await disableLock();
            await signOut();
            router.replace("/login");
          },
        },
      ],
    );
  };

  return (
    <View
      className="absolute inset-0 z-[999] items-center justify-center"
      style={{ backgroundColor: colors.background, elevation: 999 }}
      accessibilityViewIsModal
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1 w-full items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.primaryLight }}
        >
          <Icon set="ion" name="lock-closed" size={30} color={colors.primary} />
        </View>
        <Text
          className="text-lg font-black tracking-tight mb-1.5"
          style={{ color: colors.foreground, fontFamily: fonts.heading }}
        >
          The Nura is locked
        </Text>
        <Text
          className="text-xs text-center mb-8"
          style={{ color: colors.mutedText, fontFamily: fonts.body }}
        >
          Use your {deviceLockLabel} to continue
        </Text>

        <View className="items-center">
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Unlock"
            activeOpacity={0.85}
            disabled={isAuthenticating}
            onPress={triggerUnlock}
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.primary, opacity: isAuthenticating ? 0.7 : 1 }}
          >
            <Icon set="ion" name="lock-open" size={28} color={colors.buttonText} />
          </TouchableOpacity>
          {hint ? (
            <Text
              className="text-xs font-bold mt-5 text-center px-6"
              style={{ color: colors.danger, fontFamily: fonts.body }}
            >
              {hint}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity onPress={handleForgot} className="mt-8 py-2 px-4">
          <Text
            className="text-center text-xs font-bold underline"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Can&apos;t unlock? Sign out instead
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

/**
 * Put this as the last child of any component that renders its own native
 * <Modal> showing account or health data. Native Modals draw in a window
 * above the root lock screen, so without it a sheet left open when the app
 * was backgrounded stays readable over the lock. It covers the sheet without
 * unmounting it, so unsaved edits survive the lock. `<AppModalHost inline />`
 * already includes it.
 */
export function AppLockCover() {
  const { isLocked } = useAppLock();
  return isLocked ? <AppLockScreen autoPrompt={false} /> : null;
}
