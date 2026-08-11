import { requestRecordingPermissionsAsync } from "expo-audio";
import { Tabs, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../../components/auth-context";
import { useTheme } from "../../../components/theme";
import { TabBarItem } from "../../../components/TabBarItem";
import { showPermissionModal } from "../../../lib/modal-host";
import { PartnerViewStateProvider } from "../../../components/partner-view-state";

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
  const { colors, isDark } = useTheme();
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
          // Soft & airy rounded-top sheet — matches the owner dashboard tab bar
          // exactly (full width, generous top radius, soft upward shadow).
          tabBarStyle: {
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 62 + Math.max(insets.bottom, 12),
            paddingBottom: Math.max(insets.bottom, 12),
            paddingTop: 12,
            backgroundColor: colors.surface,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            borderTopWidth: 0,
            overflow: "visible",
            elevation: 22,
            shadowColor: isDark ? "#000000" : colors.shadow,
            shadowOffset: { width: 0, height: -6 },
            shadowOpacity: isDark ? 0.45 : 0.12,
            shadowRadius: 20,
          },
          tabBarItemStyle: { height: 48 },
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
                  <TabBarItem
                    focused={focused}
                    iconFocused={tab.iconFocused as string}
                    iconUnfocused={tab.iconUnfocused as string}
                    label={tab.label}
                  />
                ),
            }}
          />
        ))}
      </Tabs>
    </PartnerViewStateProvider>
  );
}
