// app.json stays the source of truth for everything else. This wrapper only
// lets EAS file-type environment variables (GOOGLE_SERVICES_JSON /
// GOOGLE_SERVICES_INFO_PLIST, set per environment with `eas env:set --type
// file`) override the two Google services file paths. Without them it falls
// back to the git-tracked assets/google-services.json and
// assets/GoogleService-Info.plist, which are Firebase client configs tracked
// on purpose (see .gitignore and CLAUDE.md).
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
