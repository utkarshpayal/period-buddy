import { appendLocalFile, multipartRequest } from "./client";

export const uploadApi = {
  /**
   * Uploads a local file (e.g. an `expo-image-picker`, video, or audio
   * recording result URI) to the backend, which stores it in S3 and returns
   * its public URL. Pass `mimeType` explicitly for video/audio assets since
   * their extension can't be reliably guessed the way image ones can.
   */
  uploadMedia: async (localUri: string, folder = "profile-pictures", mimeType?: string) => {
    const fileName = localUri.split("/").pop()?.split("?")[0] || "upload";
    const extensionMatch = /\.(\w+)$/.exec(fileName);
    const extension = extensionMatch?.[1]?.toLowerCase();
    const resolvedMimeType =
      mimeType || (extension === "png" ? "image/png" : "image/jpeg");

    const formData = new FormData();
    formData.append("folder", folder);
    await appendLocalFile(formData, localUri, fileName, resolvedMimeType);
    return multipartRequest<{ key: string; url: string }>("/api/upload", formData);
  },

  /** @deprecated use uploadMedia */
  uploadImage: async (localUri: string, folder = "profile-pictures") =>
    uploadApi.uploadMedia(localUri, folder),
};
