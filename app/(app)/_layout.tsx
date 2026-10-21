import { Stack } from "expo-router";
import React from "react";
import { AppStateProvider } from "../../components/AppState";
import { HomeLayoutProvider } from "../../components/home-layout";
import { stackScreenOptions } from "../../components/motion";
import { useTheme } from "../../components/theme";

export default function AppLayout() {
  const { colors } = useTheme();
  return (
    <AppStateProvider>
      <HomeLayoutProvider>
        <Stack screenOptions={stackScreenOptions(colors.background)} />
      </HomeLayoutProvider>
    </AppStateProvider>
  );
}
