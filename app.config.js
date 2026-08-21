// app.json stays the source of truth for everything else. This wrapper only
// overrides the two Google services file paths so EAS Build can inject them
// via file-type environment variables (GOOGLE_SERVICES_JSON /
// GOOGLE_SERVICES_INFO_PLIST) -- those files are gitignored (see CLAUDE.md)
// and EAS Build only uploads git-tracked files, so without this the cloud
// build can't find them. Falls back to the local gitignored files for
// `npx expo start` / local builds where the env vars aren't set.
//
// `config` below is Expo's own resolved static config (app.json + defaults),
// passed in for exactly this purpose -- extend it, don't re-require app.json,
// or `expo-doctor` can't tell the static config was actually used.
module.exports = ({ config }) => {
  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
    },
    ios: {
      ...config.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_INFO_PLIST ?? config.ios.googleServicesFile,
    },
  };
};
