const { withAndroidManifest } = require('expo/config-plugins');

// Google Play infiere android.hardware.screen.portrait como obligatorio cuando
// la actividad fija screenOrientation="portrait". Lo declaramos como opcional
// para no restringir la disponibilidad en tablets, Chromebooks y Android XR.
const FEATURES = ['android.hardware.screen.portrait', 'android.hardware.screen.landscape'];

module.exports = function withOptionalScreenFeatures(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] ?? [];
    for (const name of FEATURES) {
      const existing = manifest['uses-feature'].find((f) => f.$['android:name'] === name);
      if (existing) {
        existing.$['android:required'] = 'false';
      } else {
        manifest['uses-feature'].push({ $: { 'android:name': name, 'android:required': 'false' } });
      }
    }
    return cfg;
  });
};
