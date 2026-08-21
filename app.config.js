// app.json stays the source of truth for everything else. This wrapper only
// overrides the two Google services file paths so EAS Build can inject them
// via file-type environment variables (GOOGLE_SERVICES_JSON /
// GOOGLE_SERVICES_INFO_PLIST) -- those files are gitignored (see CLAUDE.md)
// and EAS Build only uploads git-tracked files, so without this the cloud
// build can't find them. Falls back to the local gitignored files for
// `npx expo start` / local builds where the env vars aren't set.
const { expo } = require("./app.json");

module.exports = ({ config }) => {
  return {
    ...expo,
    android: {
      ...expo.android,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_JSON ?? expo.android.googleServicesFile,
    },
    ios: {
      ...expo.ios,
      googleServicesFile:
        process.env.GOOGLE_SERVICES_INFO_PLIST ?? expo.ios.googleServicesFile,
    },
  };
};
