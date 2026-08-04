// Thin re-export so the dashboard tab bar still resolves a "community" route
// here — the actual screen lives in components/screens/CommunityScreen.tsx,
// shared with the partner view (see app/(app)/(partner-view)/forum.tsx)
// so both roles get the identical UI.
export { default } from "../../../components/screens/CommunityScreen";
