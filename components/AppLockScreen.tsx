import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../lib/alert";
import { useAppLock } from "./AppLock";
import { useAuth } from "./auth-context";
import { useTheme } from "./theme";

export function AppLockScreen() {
  const { colors, isDark, fonts } = useTheme();
  const { deviceLockLabel, unlock, disableLock } = useAppLock();
  const { signOut } = useAuth();
  const router = useRouter();
  const [hint, setHint] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const triggerUnlock = React.useCallback(async () => {
    setIsAuthenticating(true);
    setHint("");
    const result = await unlock();
    setIsAuthenticating(false);
    if (!result.success) setHint(result.error ?? "Try again");
  }, [unlock]);

  useEffect(() => {
    triggerUnlock();
    // Only fire once when the lock screen mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      style={{ backgroundColor: colors.background }}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1 w-full items-center justify-center px-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center mb-6"
          style={{ backgroundColor: colors.primaryLight }}
        >
          <Ionicons name="lock-closed" size={30} color={colors.primary} />
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
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={isAuthenticating}
            onPress={triggerUnlock}
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{ backgroundColor: colors.primary, opacity: isAuthenticating ? 0.7 : 1 }}
          >
            <Ionicons name="lock-open" size={28} color={colors.buttonText} />
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
