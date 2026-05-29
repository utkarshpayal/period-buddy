import React from "react";
import "../global.css";
import { Stack } from "expo-router";
import { AuthProvider } from "../components/auth-context";
import { ThemeProvider } from "../components/theme";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
