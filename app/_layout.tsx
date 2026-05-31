import { Stack } from "expo-router";
import React from "react";
import { AuthProvider } from "../components/auth-context";
import { ThemeProvider } from "../components/theme";
import "../global.css";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AuthProvider>
    </ThemeProvider>
  );
}
