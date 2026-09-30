import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

/**
 * Ask for photo-library access before opening the image/video picker.
 *
 * Android never asks: `launchImageLibraryAsync` opens the system photo picker
 * there, which needs no permission, and Play policy forbids requesting
 * READ_MEDIA_IMAGES / READ_MEDIA_VIDEO for it (both are blocked in app.json).
 */
export async function requestPhotoLibraryAccess(): Promise<{ granted: boolean; canAskAgain: boolean }> {
  if (Platform.OS === "android") return { granted: true, canAskAgain: true };
  return ImagePicker.requestMediaLibraryPermissionsAsync();
}
