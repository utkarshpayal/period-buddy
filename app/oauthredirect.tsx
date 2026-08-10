import { Redirect } from "expo-router";
import React from "react";

/**
 * Catches Google's OAuth redirect. The Android OAuth client can only redirect
 * to the default `com.uvin124.thenura:/oauthredirect` (see GoogleSignInButton),
 * and when that reopens the app expo-router would otherwise try to route
 * "oauthredirect" as a screen and show the "route not found" page.
 *
 * expo-web-browser's `maybeCompleteAuthSession()` normally consumes this
 * redirect, but on standalone Android builds it can still leak through to the
 * router — so we send it to the dashboard home once sign-in has hydrated the
 * session.
 */
export default function OAuthRedirect() {
  return <Redirect href="/(app)/(dashboard)/home" />;
}
