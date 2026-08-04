import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { requestRecordingPermissionsAsync } from "expo-audio";
import React, { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { registerForPushNotificationsAsync } from "../lib/notifications";
import { useTheme } from "./theme";
import { getShadow } from "./ui-tokens";

const PERMISSIONS_REQUESTED_KEY = "period-buddy.permissions-requested";

type PermissionRowConfig = {
  id: "notifications" | "microphone" | "media";
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  request: () => Promise<boolean>;
};

const permissionRows: PermissionRowConfig[] = [
  {
    id: "notifications",
    icon: "notifications-outline",
    title: "Notifications",
    description: "Get period, ovulation, and reminder alerts right on time.",
    request: async () => {
      if (Platform.OS === "web") return true;
      const token = await registerForPushNotificationsAsync();
      return Boolean(token);
    },
  },
  {
    id: "microphone",
    icon: "mic-outline",
    title: "Microphone",
    description: "Talk to Buddy hands-free to log entries and ask questions.",
    request: async () => {
      const { granted } = await requestRecordingPermissionsAsync();
      return granted;
    },
  },
  {
    id: "media",
    icon: "image-outline",
    title: "Photos",
    description: "Pick a profile picture and attach photos to documents.",
    request: async () => {
      const result = await ImagePicker.requestMediaLibraryPermissionsAsync();
      return result.granted;
    },
  },
];

/**
 * Shown once, on the very first app launch (tracked via AsyncStorage, not
 * auth state, since it should appear before login/signup too) — primes all
 * the OS permission prompts the app will eventually need instead of
 * surprising the user with them mid-flow.
 */
export function PermissionsGate({ onDone }: { onDone: () => void }) {
  const { colors, isDark } = useTheme();
  const [grantedIds, setGrantedIds] = useState<Set<string>>(new Set());
  const [requestingId, setRequestingId] = useState<string | null>(null);

  async function handleRequest(row: PermissionRowConfig) {
    if (requestingId) return;
    setRequestingId(row.id);
    try {
      const granted = await row.request();
      if (granted) {
        setGrantedIds((prev) => new Set(prev).add(row.id));
      }
    } catch {
      // Permission prompts can reject on some platforms/emulators; treat as
      // not granted rather than blocking the user from continuing.
    } finally {
      setRequestingId(null);
    }
  }

  async function handleContinue() {
    await AsyncStorage.setItem(PERMISSIONS_REQUESTED_KEY, "true");
    onDone();
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
      <View className="flex-1 px-6 py-8 justify-between">
        <View>
          <Text
            className="text-2xl font-black tracking-tight"
            style={{ color: colors.foreground }}
          >
            Before we start
          </Text>
          <Text
            className="mt-2 text-sm font-semibold leading-relaxed"
            style={{ color: colors.mutedText }}
          >
            Period Buddy works best with a few permissions. You can change any
            of these later in your device settings.
          </Text>

          <View className="mt-8 gap-4">
            {permissionRows.map((row) => {
              const isGranted = grantedIds.has(row.id);
              const isRequesting = requestingId === row.id;

              return (
                <View
                  key={row.id}
                  className="flex-row items-center rounded-3xl border p-4"
                  style={{
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...getShadow(colors, isDark),
                  }}
                >
                  <View
                    className="h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ backgroundColor: colors.primaryLight }}
                  >
                    <Ionicons name={row.icon} size={22} color={colors.primary} />
                  </View>

                  <View className="ml-4 flex-1">
                    <Text
                      className="text-sm font-bold"
                      style={{ color: colors.foreground }}
                    >
                      {row.title}
                    </Text>
                    <Text
                      className="mt-1 text-xs font-semibold leading-relaxed"
                      style={{ color: colors.mutedText }}
                    >
                      {row.description}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={isGranted || isRequesting}
                    onPress={() => handleRequest(row)}
                    className="ml-3 rounded-full px-4 py-2.5"
                    style={{
                      backgroundColor: isGranted ? colors.successLight : colors.primary,
                    }}
                  >
                    <Text
                      className="text-xs font-bold"
                      style={{ color: isGranted ? colors.success : colors.buttonText }}
                    >
                      {isGranted ? "Allowed" : isRequesting ? "..." : "Allow"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.9}
          onPress={handleContinue}
          className="w-full rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text
            className="text-center text-base font-bold"
            style={{ color: colors.buttonText }}
          >
            Continue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export async function hasRequestedPermissions(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PERMISSIONS_REQUESTED_KEY);
  return value === "true";
}
