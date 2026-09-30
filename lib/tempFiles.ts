import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";

/**
 * Health files the app writes to its cache only so another app can open or
 * save them: a document PDF handed to the phone's PDF app, and the "Download
 * my data" export.
 *
 * They can't be deleted the moment the share sheet returns: on Android that
 * happens as soon as an app is picked, before it has read the file. So they
 * are deleted a little later instead: when the document preview closes, and
 * whenever the Documents or Privacy screen opens.
 */

export const TEMP_PREFIXES = ["document-", "the-nura-my-data-"] as const;

export function cleanupTempFiles() {
  if (Platform.OS === "web") return;
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && TEMP_PREFIXES.some((p) => entry.name.startsWith(p))) {
        try {
          entry.delete();
        } catch {
          /* still in use: the next cleanup gets it */
        }
      }
    }
  } catch {
    /* cache unreadable: nothing to clean */
  }
}
