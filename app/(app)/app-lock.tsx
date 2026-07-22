import { Feather, Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StatusBar, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppLock } from "../../components/AppLock";
import { alert } from "../../lib/alert";
import { useTheme } from "../../components/theme";
import { getSoftTints } from "../../components/ui-tokens";

export default function AppLockSettings() {
  const { colors, isDark, fonts } = useTheme();
  const router = useRouter();
  const softTints = getSoftTints(colors);
  const { settings, deviceLockLabel, enableLock, disableLock } = useAppLock();

  const [isVerifying, setIsVerifying] = useState(false);

  const handleEnable = async () => {
    setIsVerifying(true);
    const result = await enableLock();
    setIsVerifying(false);
    if (!result.success) {
      alert("Couldn't turn on App Lock", result.error ?? "Please try again.");
      return;
    }
    alert("App Lock is on", "You'll need to unlock The Nura with your device's own lock screen every time it comes back to the foreground.");
  };

  const handleDisable = () => {
    alert(
      "Turn off App Lock?",
      "Anyone with your phone unlocked will be able to open The Nura directly.",
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
                {isEnabled ? "App Lock is on" : "App Lock is off"}
              </Text>
            </View>

            <Text
              className="text-xs leading-4"
              style={{ color: colors.mutedText, fontFamily: fonts.body }}
            >
              Protect your cycle data and private chats using your phone's own lock screen —
              whatever you already use to unlock your device (fingerprint, face unlock, PIN, or
              pattern). When on, The Nura locks itself every time it comes back to the foreground.
            </Text>

            <View className="gap-3">
              {!isEnabled && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  disabled={isVerifying}
                  onPress={handleEnable}
                  className="flex-row items-center p-4 rounded-2xl border gap-3"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    opacity: isVerifying ? 0.7 : 1,
                  }}
                >
                  <View className="p-2.5 rounded-xl" style={{ backgroundColor: softTints.pink }}>
                    <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-xs font-black"
                      style={{ color: colors.foreground, fontFamily: fonts.body }}
                    >
                      Turn On App Lock
                    </Text>
                    <Text
                      className="text-[10px] mt-0.5"
                      style={{ color: colors.mutedText, fontFamily: fonts.body }}
                    >
                      Uses your device's {deviceLockLabel} — no separate pattern to set up
                    </Text>
                  </View>
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
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
