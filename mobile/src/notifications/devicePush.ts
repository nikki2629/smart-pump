import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { PushTokenRegistration } from '@/api/types';

const INSTALLATION_ID_KEY = 'smart-pump.installation-id.v1';

export async function registerNativePushToken(): Promise<
  Pick<PushTokenRegistration, 'token' | 'installation_id' | 'platform'>
> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Push notifications are available in the Android and iOS apps.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pump-alerts', {
      name: 'Pump alerts',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#087E83',
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  const result =
    permission.status === 'granted'
      ? permission
      : await Notifications.requestPermissionsAsync();
  if (result.status !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const nativeToken = await Notifications.getDevicePushTokenAsync();
  let installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
  if (!installationId) {
    installationId = Crypto.randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
  }

  return {
    token: String(nativeToken.data),
    installation_id: installationId,
    platform: Platform.OS,
  };
}
