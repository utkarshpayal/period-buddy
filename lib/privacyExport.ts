import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { authApi } from "./api";
import { getDateKey } from "./format";

/**
 * "Download my data": fetch the export and hand it to the share sheet as a
 * JSON file (save to Files / Drive, email it…). On web it downloads. The
 * file goes in the cache and is deleted later (lib/tempFiles.ts).
 */
export async function downloadMyData(): Promise<void> {
  const data = await authApi.exportData();
  const text = JSON.stringify(data, null, 2);
  const name = `the-nura-my-data-${getDateKey(new Date())}.json`;

  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    // Revoking in the same tick can cancel the download (Safari, Firefox).
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return;
  }

  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your data", UTI: "public.json" });
  }
  // It holds health data, but the app it went to (Drive, Files…) may still
  // be reading it: lib/tempFiles.ts deletes it on the next visit instead.
}
