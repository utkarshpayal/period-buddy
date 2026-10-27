const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname)

// The Body Map's 3D model (assets/models/female-body.glb).
config.resolver.assetExts.push("glb");

// App code's `react-native` imports go through lib/react-native-shim.tsx, which
// gives Text/TextInput Manrope as the default font (React 19 dropped
// `defaultProps` on function components). node_modules and the shim itself
// still get the real module.
const shimPath = path.resolve(__dirname, "lib/react-native-shim.tsx");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react-native" &&
    context.originModulePath !== shimPath &&
    !context.originModulePath.includes(`${path.sep}node_modules${path.sep}`)
  ) {
    return { type: "sourceFile", filePath: shimPath };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' })
