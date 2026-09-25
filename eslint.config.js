// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // eslint-config-expo references this jsx-a11y rule without bundling
      // the plugin, so the rule can't be resolved — disable rather than add
      // a whole new plugin dependency for one rule.
      'jsx-a11y/media-has-caption': 'off',
    },
  },
]);
