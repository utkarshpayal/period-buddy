import { Ionicons } from "@expo/vector-icons";
import { requestRecordingPermissionsAsync } from "expo-audio";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";
import { showPermissionModal } from "../../../lib/modal-host";
import { PartnerViewStateProvider } from "./_state";

// Mirrors app/(app)/(dashboard)/_layout.tsx's floating tab bar 1:1 (same
// sizes, colors, center-avatar treatment) so the partner view reads as the
// same app, not a stripped-down mode — just with tabs relevant to a
// read-only viewer instead of the account owner's own tracking tools.
const CENTER_AVATAR_SOURCE = require("../../../assets/images/icon.png");
const AVATAR_SIZE = 76;
const AVATAR_WRAP_SIZE = 100;
const AVATAR_WRAP_TOP = -54;

type PartnerTab = {
  name: string;
  label: string;
  iconFocused?: string;
  iconUnfocused?: string;
  image?: any;
};

// Route names here are deliberately distinct from the owner dashboard's tab
// names (app/(app)/(dashboard)/_layout.tsx uses "home"/"ai-chat"/"community"/
// "profile"). (dashboard) and (partner-view) are both always-mounted, always
// navigable Stack routes — each only guards itself by redirecting the wrong
// role away — so a same-named leaf route in both groups is ambiguous and can
// resolve to the *other* group's screen, which then immediately redirects
// back to this group's home tab. Renaming removes the ambiguity outright
// instead of relying on every push using a fully-qualified group path.
const PARTNER_TABS: PartnerTab[] = [
  { name: "overview", label: "Home", iconFocused: "home", iconUnfocused: "home-outline" },
  { name: "chat", label: "Chat", iconFocused: "chatbubble", iconUnfocused: "chatbubble-outline" },
  { name: "voice", label: "AI Chat", image: CENTER_AVATAR_SOURCE },
  { name: "forum", label: "Community", iconFocused: "people", iconUnfocused: "people-outline" },
  { name: "account", label: "Profile", iconFocused: "person", iconUnfocused: "person-outline" },
];

function CenterAvatarTabIcon({ image }: { image: any }) {
  return (
    <View style={styles.avatarWrap} pointerEvents="none">
      <Image source={image} style={styles.avatarImage} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    position: "absolute",
    top: AVATAR_WRAP_TOP,
    width: AVATAR_WRAP_SIZE,
    height: AVATAR_WRAP_SIZE,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    elevation: 10,
  },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function PartnerViewLayout() {
  const { token, user } = useAuth();
  const { colors, fonts } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Auth guard: only signed-in partners belong here. A regular account
  // owner (or a logged-out visitor) gets bounced to the right place.
  useEffect(() => {
    if (!token) {
      router.replace("/(tabs)/login");
    } else if (user?.partnerRole !== "viewer") {
      router.replace("/(app)/(dashboard)/home");
    }
  }, [token, user?.partnerRole, router]);

  return (
    <PartnerViewStateProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderTopWidth: 1,
            borderLeftWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            height: (Platform.OS === "ios" ? 60 : 58) + Math.max(insets.bottom, Platform.OS === "ios" ? 26 : 14),
            elevation: 0,
            shadowColor: "transparent",
            paddingBottom: Math.max(insets.bottom, Platform.OS === "ios" ? 26 : 14),
            paddingTop: 10,
            overflow: "visible",
          },
        }}
      >
        {PARTNER_TABS.map((tab) => (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            listeners={{
              tabPress: (e) => {
                if (tab.name === "voice") {
                  // Same mic-permission gate as the owner dashboard — voice
                  // chat is useless (and can crash natively on Android)
                  // without it, so check before navigating instead of
                  // letting the screen open and fail silently.
                  e.preventDefault();
                  requestRecordingPermissionsAsync()
                    .then(({ granted }) => {
                      if (granted) {
                        router.push({ pathname: "/(app)/qa", params: { voiceMode: "1" } });
                      } else {
                        showPermissionModal({
                          title: "Microphone access needed",
                          message: "Enable microphone access in Settings to use voice chat with Buddy.",
                          icon: "mic-outline",
                        });
                      }
                    })
                    .catch(() => {
                      showPermissionModal({
                        title: "Microphone access needed",
                        message: "Enable microphone access in Settings to use voice chat with Buddy.",
                        icon: "mic-outline",
                      });
                    });
                }
              },
            }}
            options={{
              tabBarButton: (props) => {
                const cleanProps = Object.fromEntries(
                  Object.entries(props).filter(([, value]) => value !== null)
                );
                return <TouchableOpacity {...cleanProps} activeOpacity={0.9} style={styles.tabButton} />;
              },
              tabBarIcon: ({ focused }) =>
                tab.image ? (
                  <CenterAvatarTabIcon image={tab.image} />
                ) : (
                  <View
                    className="items-center justify-center relative"
                    style={{
                      backgroundColor: focused ? colors.primaryLight : "transparent",
                      borderRadius: 14,
                      paddingVertical: 5,
                      paddingHorizontal: 12,
                      minWidth: 64,
                      height: 48,
                      gap: 3,
                    }}
                  >
                    <Ionicons
                      name={(focused ? tab.iconFocused : tab.iconUnfocused) as any}
                      size={17}
                      color={focused ? colors.primary : colors.mutedText}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: fonts.body,
                        fontSize: 9.5,
                        fontWeight: focused ? "700" : "600",
                        color: focused ? colors.primary : colors.mutedText,
                      }}
                    >
                      {tab.label}
                    </Text>
                  </View>
                ),
            }}
          />
        ))}
      </Tabs>
    </PartnerViewStateProvider>
  );
}
