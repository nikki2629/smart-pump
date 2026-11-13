import Constants from 'expo-constants';
import { Platform } from 'react-native';

function configuredUrl(): string {
  const extraUrl = Constants.expoConfig?.extra?.apiBaseUrl;
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  const url =
    typeof extraUrl === 'string' && extraUrl.trim() ? extraUrl : envUrl;

  if (typeof url === 'string' && url.trim()) {
    return url.trim().replace(/\/+$/, '');
  }

  if (__DEV__) {
    const host = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
    return `http://${host}:8000/api/v1`;
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL must be configured for production builds.',
  );
}

export function getApiBaseUrl(): string {
  const url = configuredUrl();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }
  if (
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error('The API base URL must not contain credentials or query data.');
  }
  const allowInsecureHttp =
    process.env.EXPO_PUBLIC_ALLOW_INSECURE_HTTP === 'true';
  if (
    !__DEV__ &&
    parsedUrl.protocol !== 'https:' &&
    !allowInsecureHttp
  ) {
    throw new Error('Production API connections must use HTTPS.');
  }
  return parsedUrl.toString().replace(/\/+$/, '');
}

export const SUPPORT_EMAIL =
  Constants.expoConfig?.extra?.supportEmail ??
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ??
  'support@example.invalid';
