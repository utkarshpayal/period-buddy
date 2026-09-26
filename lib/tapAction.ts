import type { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";
import type { TapAction } from "./appConfig";

/**
 * Run an App CMS tap action (tiles, banners, the popup):
 *   route → push the in-app screen
 *   url   → the website in the in-app browser
 *   app   → another app by its link (whatsapp://…, youtube://…); if it isn't
 *           installed (or the OS refuses the scheme), `fallbackUrl`, usually
 *           its store or web page, opens in the in-app browser instead.
 * Never throws: a link that can't open does nothing.
 */
type Router = ReturnType<typeof useRouter>;

export async function runTapAction(action: TapAction, router: Router): Promise<void> {
  const { type, value, fallbackUrl } = action;
  if (!value || type === "none") return;
  try {
    if (type === "route") {
      router.push(value as any);
    } else if (type === "url") {
      await WebBrowser.openBrowserAsync(value);
    } else if (type === "app") {
      try {
        await Linking.openURL(value);
      } catch {
        if (fallbackUrl) await WebBrowser.openBrowserAsync(fallbackUrl);
      }
    }
  } catch {
    /* nothing sensible to do: the tap just doesn't navigate */
  }
}
