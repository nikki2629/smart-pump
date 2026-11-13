import type { ConfigContext, ExpoConfig } from 'expo/config';

function apiUsesHttp(): boolean {
  const url = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';
  return url.startsWith('http://');
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const allowCleartext = apiUsesHttp();
  const cleartextPlugin: [string, { allowCleartextTraffic: boolean }] = [
    './plugins/withAndroidCleartextTraffic',
    { allowCleartextTraffic: allowCleartext },
  ];
  return {
    ...config,
    name: config.name ?? 'Smart Pump Control',
    slug: config.slug ?? 'smart-pump-control',
    plugins: [...(config.plugins ?? []), cleartextPlugin],
    android: {
      ...config.android,
    },
    extra: {
      ...config.extra,
      ...(process.env.EXPO_PUBLIC_API_URL
        ? { apiBaseUrl: process.env.EXPO_PUBLIC_API_URL }
        : {}),
      ...(process.env.EXPO_PUBLIC_SUPPORT_EMAIL
        ? { supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL }
        : {}),
    },
  };
};
