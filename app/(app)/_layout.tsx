import { Stack } from "expo-router";
import React from "react";
import { AppStateProvider } from "../../components/AppState";
import { HomeLayoutProvider } from "../../components/home-layout";

export default function AppLayout() {
  return (
    <AppStateProvider>
      <HomeLayoutProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </HomeLayoutProvider>
    </AppStateProvider>
  );
}
