import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { alert } from "../lib/alert";
import { hashPatternSequence, useAppLock } from "./AppLock";
import { useAuth } from "./auth-context";
import { PatternLock, type PatternLockStatus } from "./PatternLock";
import { useTheme } from "./theme";

export function AppLockScreen() {
  const { colors, isDark, fonts } = useTheme();
  const { settings, biometricLabel, unlockWithBiometric, unlockWithPattern, disableLock } = useAppLock();
  const { signOut } = useAuth();
  const router = useRouter();
  const [patternStatus, setPatternStatus] = useState<PatternLockStatus>("idle");
  const [hint, setHint] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // Biometric always has a pattern saved as backup — this lets someone drop
  // out of the biometric prompt into pattern entry without signing out.
  const [usePatternFallback, setUsePatternFallback] = useState(false);

  const triggerBiometric = React.useCallback(async () => {
    setIsAuthenticating(true);
    setHint("");
    const result = await unlockWithBiometric();
    setIsAuthenticating(false);
    if (!result.success) setHint(result.error ?? "Try again");
  }, [unlockWithBiometric]);

  useEffect(() => {
    setUsePatternFallback(false);
    if (settings.method === "biometric") {
      triggerBiometric();
    }
    // Only fire once when the lock screen mounts for a biometric setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.method]);

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

  const handlePatternComplete = async (sequence: number[]) => {
    if (sequence.length < 4) {
      setPatternStatus("error");
      setHint("Draw a longer pattern");
      setTimeout(() => setPatternStatus("idle"), 500);
      return;
    }
    const patternHash = await hashPatternSequence(sequence);
    const success = unlockWithPattern(patternHash);
    if (!success) {
      setPatternStatus("error");
      setHint("Wrong pattern, try again");
      setTimeout(() => setPatternStatus("idle"), 500);
    } else {
      setHint("");
    }
  };

  const showPatternEntry = settings.method === "pattern" || usePatternFallback;

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
          {showPatternEntry ? "Draw your pattern to continue" : `Use ${biometricLabel} to continue`}
        </Text>

        {showPatternEntry ? (
          <View className="items-center">
            <PatternLock status={patternStatus} onComplete={handlePatternComplete} />
            {hint ? (
              <Text
                className="text-xs font-bold mt-5"
                style={{ color: colors.danger, fontFamily: fonts.body }}
              >
                {hint}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="items-center">
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={isAuthenticating}
              onPress={triggerBiometric}
              className="w-16 h-16 rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primary, opacity: isAuthenticating ? 0.7 : 1 }}
            >
              <Ionicons name="finger-print" size={28} color={colors.buttonText} />
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
        )}

        {settings.method === "biometric" && (
          <TouchableOpacity
            onPress={() => {
              setHint("");
              setUsePatternFallback((v) => !v);
            }}
            className="mt-8 py-2 px-4"
          >
            <Text
              className="text-center text-xs font-bold underline"
              style={{ color: colors.primary, fontFamily: fonts.body }}
            >
              {showPatternEntry ? `Use ${biometricLabel} instead` : "Use pattern instead"}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity onPress={handleForgot} className="mt-3 py-2 px-4">
          <Text
            className="text-center text-[11px] font-bold underline"
            style={{ color: colors.mutedText, fontFamily: fonts.body }}
          >
            Forgot your pattern? Sign out instead
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}
