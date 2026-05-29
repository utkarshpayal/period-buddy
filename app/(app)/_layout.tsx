import { Stack } from "expo-router";
import React from "react";
import { AppStateProvider } from "../../components/AppState";

export default function AppLayout() {
  return (
    <AppStateProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AppStateProvider>
  );
}
