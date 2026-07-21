import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Platform, ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { hashPatternSequence, type LockMethod, useAppLock } from "../../components/AppLock";
import { PatternLock, type PatternLockStatus } from "../../components/PatternLock";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";

type PatternStep = "draw" | "confirm" | null;

export default function AppLockSettings() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);
  const {
    settings,
    biometricAvailable,
    biometricLabel,
    verifyBiometric,
    saveLock,
    disableLock,
  } = useAppLock();

  const [patternStep, setPatternStep] = useState<PatternStep>(null);
  const [patternStatus, setPatternStatus] = useState<PatternLockStatus>("idle");
  const [patternHint, setPatternHint] = useState("Draw a pattern connecting at least 4 dots");
  const firstSequenceRef = useRef<number[]>([]);
  // Which method the pattern currently being drawn will be saved against —
  // "pattern" when it's the primary unlock method, "biometric" when it's
  // just the required fallback for Face/Fingerprint unlock.
  const pendingMethodRef = useRef<LockMethod>("pattern");
  const [isVerifyingBiometric, setIsVerifyingBiometric] = useState(false);

  const startPatternSetup = (forMethod: LockMethod) => {
    pendingMethodRef.current = forMethod;
    firstSequenceRef.current = [];
    setPatternStatus("idle");
    setPatternHint(
      forMethod === "biometric"
        ? "Set a backup pattern in case Face/Fingerprint unlock ever fails"
        : "Draw a pattern connecting at least 4 dots",
    );
    setPatternStep("draw");
  };

  const cancelPatternSetup = () => {
    setPatternStep(null);
    firstSequenceRef.current = [];
  };

  const handlePatternDrawn = async (sequence: number[]) => {
    if (sequence.length < 4) {
      setPatternStatus("error");
      setPatternHint("Too short — connect at least 4 dots");
      setTimeout(() => setPatternStatus("idle"), 450);
      return;
    }

    if (patternStep === "draw") {
      firstSequenceRef.current = sequence;
      setPatternStatus("success");
      setPatternHint("Draw it again to confirm");
      setTimeout(() => setPatternStatus("idle"), 350);
      setPatternStep("confirm");
      return;
    }

    if (patternStep === "confirm") {
      const [firstHash, secondHash] = await Promise.all([
        hashPatternSequence(firstSequenceRef.current),
        hashPatternSequence(sequence),
      ]);
      if (firstHash !== secondHash) {
        setPatternStatus("error");
        setPatternHint("Patterns didn't match — start over");
        setTimeout(() => {
          setPatternStatus("idle");
          setPatternStep("draw");
          firstSequenceRef.current = [];
        }, 500);
        return;
      }
      const method = pendingMethodRef.current;
      await saveLock(method, secondHash);
      setPatternStep(null);
      firstSequenceRef.current = [];
      alert(
        "App Lock is on",
        method === "biometric"
          ? `You'll need ${biometricLabel} to open The Nura, with this pattern as backup.`
          : "You'll need to draw this pattern to open The Nura.",
      );
    }
  };

  const handleEnableBiometric = async () => {
    setIsVerifyingBiometric(true);
    const result = await verifyBiometric();
    setIsVerifyingBiometric(false);
    if (!result.success) {
      alert("Couldn't turn on App Lock", result.error ?? "Please try again.");
      return;
    }
    if (settings.patternHash) {
      // Already have a pattern on file (current or past) — reuse it as the
      // backup instead of making the user redraw one.
      await saveLock("biometric", settings.patternHash);
      alert("App Lock is on", `You'll need ${biometricLabel} to open The Nura, with your pattern as backup.`);
      return;
    }
    startPatternSetup("biometric");
  };

  const handleUsePatternAsPrimary = async () => {
    if (!settings.patternHash) return;
    await saveLock("pattern", settings.patternHash);
    alert("Switched to Pattern", "You'll need to draw your pattern to open The Nura.");
  };

  const handleDisable = () => {
    alert(
      "Turn off App Lock?",
      "Anyone with your phone unlocked will be able to open The Nura directly. Your saved pattern/biometric setup will be cleared — you'll set it up fresh if you turn it back on.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Turn Off",
          style: "destructive",
          onPress: () => disableLock(),
        },
      ],
    );
  };

  const isEnabled = settings.enabled;

  return (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={colors.background} />
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-6 pt-6">
          <TouchableOpacity
            onPress={() => router.back()}
            activeOpacity={0.7}
            className="p-2.5 -ml-2 rounded-full border"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <Text
            className="flex-1 text-2xl font-black tracking-tight ml-2"
            style={{ color: colors.foreground, fontFamily: fonts.heading }}
          >
            App Lock
          </Text>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
          className="flex-1"
        >
          <View className="mx-6 mt-6 gap-5">
            <View
              className="flex-row items-center p-4 rounded-2xl border gap-3"
              style={{
                backgroundColor: isEnabled ? softTints.emerald : colors.surface,
                borderColor: isEnabled ? colors.successLight : colors.border,
              }}
            >
              <Ionicons
                name={isEnabled ? "lock-closed" : "lock-open-outline"}
                size={18}
                color={isEnabled ? colors.success : colors.mutedText}
              />
              <Text
                className="text-xs font-black flex-1"
                style={{ color: isEnabled ? colors.success : colors.foreground, fontFamily: fonts.body }}
              >
                {isEnabled
                  ? `App Lock is on · ${settings.method === "biometric" ? biometricLabel : "Pattern"}`
                  : "App Lock is off"}
              </Text>
            </View>

            <Text
              className="text-xs leading-4"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Protect your cycle data and private chats with a fingerprint, face unlock, or a
              drawn pattern. When on, The Nura locks itself every time it comes back to the
              foreground. Face/Fingerprint unlock always keeps a backup pattern, so a scanner
              hiccup never locks you out.
            </Text>

            {patternStep ? (
              <View
                className="rounded-3xl border p-6 items-center shadow-sm"
                style={{ backgroundColor: colors.surface, borderColor: colors.border }}
              >
                <Text
                  className="text-sm font-black mb-1"
                  style={{ color: colors.foreground, fontFamily: fonts.heading }}
                >
                  {patternStep === "draw" ? "Set your pattern" : "Confirm your pattern"}
                </Text>
                <Text
                  className="text-xs text-center mb-6"
                  style={{ color: colors.mutedText, fontFamily: fonts.body }}
                >
                  {patternHint}
                </Text>
                <PatternLock status={patternStatus} onComplete={handlePatternDrawn} />
                <TouchableOpacity onPress={cancelPatternSetup} className="mt-6 py-1">
                  <Text
                    className="text-center text-[11px] font-bold underline"
                    style={{ color: colors.mutedText, fontFamily: fonts.body }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View className="gap-3">
                <Text
                  className="text-xs font-black tracking-widest uppercase px-1"
                  style={{ color: colors.primary, fontFamily: fonts.heading }}
                >
                  {isEnabled ? "Switch method" : "Choose a method"}
                </Text>

                {(!isEnabled || settings.method !== "biometric") && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isVerifyingBiometric || !biometricAvailable}
                    onPress={handleEnableBiometric}
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: isVerifyingBiometric ? 0.7 : biometricAvailable ? 1 : 0.5,
                    }}
                  >
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.pink }}>
                      <Ionicons name="finger-print" size={18} color={colors.primary} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-xs font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Fingerprint or Face Unlock
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {biometricAvailable
                          ? "Backed by a pattern in case the scanner fails"
                          : Platform.OS === "web"
                            ? "Not supported in the browser — use the Pattern option instead"
                            : "Set up a fingerprint or face unlock on this device first"}
                      </Text>
                    </View>
                    {biometricAvailable && <Feather name="chevron-right" size={16} color={colors.mutedText} />}
                  </TouchableOpacity>
                )}

                {(!isEnabled || settings.method !== "pattern") && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => startPatternSetup("pattern")}
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.lavender }}>
                      <Ionicons name="grid-outline" size={18} color={colors.lavender} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-xs font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Pattern Lock
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        {settings.method === "biometric" && settings.patternHash
                          ? "Use your existing backup pattern as the primary unlock"
                          : "Draw a pattern connecting at least 4 dots"}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                )}

                {isEnabled && settings.method === "biometric" && settings.patternHash && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleUsePatternAsPrimary}
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.lavender }}>
                      <Ionicons name="swap-horizontal-outline" size={18} color={colors.lavender} />
                    </View>
                    <View className="flex-1">
                      <Text
                        className="text-xs font-black"
                        style={{ color: colors.foreground, fontFamily: fonts.body }}
                      >
                        Use Pattern Instead
                      </Text>
                      <Text
                        className="text-[10px] mt-0.5"
                        style={{ color: colors.mutedText, fontFamily: fonts.body }}
                      >
                        Switch your existing backup pattern to the primary unlock
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                )}

                {isEnabled && settings.method === "biometric" && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => startPatternSetup("biometric")}
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.lavender }}>
                      <Ionicons name="refresh-outline" size={18} color={colors.lavender} />
                    </View>
                    <Text
                      className="text-xs font-black flex-1"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Change Backup Pattern
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                )}

                {isEnabled && settings.method === "pattern" && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => startPatternSetup("pattern")}
                    className="flex-row items-center p-4 rounded-2xl border gap-3"
                    style={{ backgroundColor: colors.surface, borderColor: colors.border }}
                  >
                    <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.lavender }}>
                      <Ionicons name="refresh-outline" size={18} color={colors.lavender} />
                    </View>
                    <Text
                      className="text-xs font-black flex-1"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Change Pattern
                    </Text>
                    <Feather name="chevron-right" size={16} color={colors.mutedText} />
                  </TouchableOpacity>
                )}

                {isEnabled && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={handleDisable}
                    className="mt-2 rounded-2xl py-3.5 items-center justify-center border"
                    style={{ backgroundColor: colors.dangerLight, borderColor: colors.danger }}
                  >
                    <Text className="text-xs font-bold" style={{ color: colors.danger, fontFamily: fonts.body }}>
                      Turn Off App Lock
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
