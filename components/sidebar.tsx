import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "./theme";

type SidebarProps = {
  user?: {
    name?: string;
    email?: string;
    profilePicture?: string;
  };
  navigation?: any;
  activeRoute?: string;
  onNavigate?: (route: string) => void;
  onLogout?: () => void;
};

const sidebarItems = [
  {
    icon: "home-outline",
    label: "Home",
    route: "index",
  },
  {
    icon: "person-outline",
    label: "Profile",
    route: "profile",
  },
  {
    icon: "notifications-outline",
    label: "Notifications",
    route: "notifications",
  },
  {
    icon: "settings-outline",
    label: "Settings",
    route: "settings",
  },
];

export function Sidebar({
  user,
  activeRoute,
  onNavigate,
  navigation,
  onLogout,
}: SidebarProps) {
  const { colors } = useTheme();

  return (
    <View
      className="flex-1 px-5 pt-16"
      style={{ backgroundColor: colors.background }}
    >
      {/* Profile Section */}
      <View
        className="mb-8 rounded-3xl border p-5"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
        }}
      >
        <View className="items-center">
          {user?.profilePicture ? (
            <Image
              source={{ uri: user.profilePicture }}
              className="h-24 w-24 rounded-full"
            />
          ) : (
            <View
              className="h-24 w-24 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.button }}
            >
              <Ionicons name="person" size={42} color={colors.buttonText} />
            </View>
          )}

          <Text
            className="mt-4 text-xl font-bold"
            style={{ color: colors.foreground }}
          >
            {user?.name || "Guest User"}
          </Text>

          <Text className="mt-1 text-sm" style={{ color: colors.foreground }}>
            {user?.email || "guest@example.com"}
          </Text>
        </View>
      </View>

      {/* Menu Items */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View className="gap-3">
          {sidebarItems.map((item) => {
            const isActive = activeRoute === item.route;

            return (
              <TouchableOpacity
                key={item.route}
                activeOpacity={0.85}
                className="flex-row items-center rounded-2xl px-4 py-4"
                onPress={() => {
                  if (onNavigate) {
                    onNavigate(item.route);
                    return;
                  }

                  navigation?.navigate?.(item.route);
                }}
                style={{
                  backgroundColor: isActive ? colors.button : colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <Ionicons
                  name={item.icon as any}
                  size={22}
                  color={isActive ? colors.buttonText : colors.foreground}
                />

                <Text
                  className="ml-4 text-base font-semibold"
                  style={{
                    color: isActive ? colors.buttonText : colors.foreground,
                  }}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Logout */}
      <TouchableOpacity
        activeOpacity={0.85}
        className="mb-8 mt-auto flex-row items-center justify-center rounded-2xl py-4"
        onPress={onLogout}
        style={{
          backgroundColor: colors.button,
        }}
      >
        <Ionicons name="log-out-outline" size={22} color={colors.buttonText} />

        <Text
          className="ml-3 text-base font-bold"
          style={{ color: colors.buttonText }}
        >
          Logout
        </Text>
      </TouchableOpacity>
    </View>
  );
}
