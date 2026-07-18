import { Stack, useRouter } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "../../../components/auth-context";

export default function PartnerViewLayout() {
  const { token, user } = useAuth();
  const router = useRouter();

  // Auth guard: only signed-in partners belong here. A regular account
  // owner (or a logged-out visitor) gets bounced to the right place.
  useEffect(() => {
    if (!token) {
      router.replace("/(tabs)/login");
    } else if (user?.partnerRole !== "viewer") {
      router.replace("/(app)/(dashboard)/home");
    }
  }, [token, user?.partnerRole, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
