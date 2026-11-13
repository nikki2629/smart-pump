import { type ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';

type PluginOptions = {
  allowCleartextTraffic: boolean;
};

const withAndroidCleartextTraffic: ConfigPlugin<PluginOptions> = (
  config,
  options,
) =>
  withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error('AndroidManifest.xml does not contain an application.');
    }

    application.$['android:usesCleartextTraffic'] = options.allowCleartextTraffic
      ? 'true'
      : 'false';
    return config;
  });

export default withAndroidCleartextTraffic;
