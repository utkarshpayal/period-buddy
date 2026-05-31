import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../../components/theme";

export default function DashboardLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false, // Hiding regular labels for a cleaner, modern look
        tabBarStyle: {
          position: "absolute",
          bottom: Platform.OS === "ios" ? 28 : 20,
          left: 20,
          right: 20,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 24,
          height: 68,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          paddingBottom: 0, // Reset baseline alignment paddings
        },
      }}
    >
      {[
        { name: "home", iconFocused: "home", iconUnfocused: "home-outline" },
        {
          name: "tracker",
          iconFocused: "calendar",
          iconUnfocused: "calendar-outline",
        },
        {
          name: "community",
          iconFocused: "people",
          iconUnfocused: "people-outline",
        },
        {
          name: "profile",
          iconFocused: "person",
          iconUnfocused: "person-outline",
        },
      ].map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            tabBarButton: (props) => {
              const cleanProps = Object.fromEntries(
                Object.entries(props).filter(([_, value]) => value !== null)
              );
              return (
                <TouchableOpacity
                  {...cleanProps}
                  activeOpacity={0.9}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              );
            },
            tabBarIcon: ({ focused }) => (
              <View className="items-center justify-center relative w-full h-full">
                {focused ? (
                  /* Custom Round Indicator popping out of the top nav margin line */
                  <View
                    className="absolute h-14 w-14 rounded-full items-center justify-center border shadow-sm"
                    style={{
                      backgroundColor: colors.primary,
                      borderColor: colors.background,
                      top: -18, 
                    }}
                  >
                    <Ionicons
                      name={tab.iconFocused as any}
                      size={22}
                      color={colors.buttonText}
                    />
                  </View>
                ) : (
                  /* Clean unselected icon representation */
                  <Ionicons
                    name={tab.iconUnfocused as any}
                    size={22}
                    color={colors.mutedText}
                  />
                )}
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
