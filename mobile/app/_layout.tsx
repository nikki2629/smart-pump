import { QueryClientProvider } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox, Platform, View } from 'react-native';
import 'react-native-reanimated';

if (Platform.OS === 'web') {
  LogBox.ignoreLogs([
    '[expo-notifications] Listening to push token changes is not yet fully supported on web.',
  ]);
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('[expo-notifications]')
    ) {
      return;
    }
    originalWarn(...args);
  };
}

import { SessionProvider, useSession } from '@/auth/SessionContext';
import { queryClient } from '@/data/queryClient';
import { OfflineBanner } from '@/ui/OfflineBanner';
import {
  AppButton,
  AppScreen,
  Card,
  LoadingState,
  PageHeader,
} from '@/ui/components';

export { ErrorBoundary } from 'expo-router';

function useNotificationNavigation() {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const navigateToNotification = (notification: Notifications.Notification) => {
      const data = notification.request.content.data ?? {};
      const url = data.url;
      if (typeof url === 'string' && /^\/(pump|alert)\/[0-9a-f-]+$/i.test(url)) {
        router.push(url as never);
        Notifications.clearLastNotificationResponse();
        return;
      }

      const alertId = data.alert_id;
      const pumpId = data.pump_id;
      if (typeof alertId === 'string') {
        router.push(`/alert/${encodeURIComponent(alertId)}` as never);
      } else if (typeof pumpId === 'string') {
        router.push(`/pump/${encodeURIComponent(pumpId)}` as never);
      }
      Notifications.clearLastNotificationResponse();
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse?.notification) {
      navigateToNotification(lastResponse.notification);
    }
    const subscription =
      Notifications.addNotificationResponseReceivedListener((response) =>
        navigateToNotification(response.notification),
      );
    return () => subscription.remove();
  }, []);
}

function RootNavigation() {
  const { hydrated, hydrationError, tokens, clearSession } = useSession();
  const segments = useSegments();
  useNotificationNavigation();

  useEffect(() => {
    if (!hydrated || hydrationError) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (tokens && inAuthGroup) {
      router.replace('/(tabs)');
    } else if (!tokens && !inAuthGroup) {
      router.replace('/(auth)/login');
    }
  }, [hydrated, hydrationError, segments, tokens]);

  if (!hydrated) {
    return (
      <AppScreen scroll={false}>
        <LoadingState label="Restoring your secure session…" />
      </AppScreen>
    );
  }

  if (hydrationError) {
    return (
      <AppScreen>
        <PageHeader title="Session unavailable" />
        <Card>
          <PageHeader
            title="Could not read secure storage"
            subtitle={hydrationError.message}
          />
          <AppButton
            title="Continue to sign in"
            onPress={() => {
              void clearSession()
                .then(() => router.replace('/(auth)/login'))
                .catch((error: unknown) => {
                  console.error('Unable to clear the saved session.', error);
                });
            }}
          />
        </Card>
      </AppScreen>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        <OfflineBanner />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#F3F7F9' },
          }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="pump/[pumpId]" />
          <Stack.Screen name="command/[commandId]" />
          <Stack.Screen name="alert/[alertId]" />
          <Stack.Screen name="pair-device" />
          <Stack.Screen name="create-pump" />
          <Stack.Screen name="create-organization" />
          <Stack.Screen name="notification-settings" />
          <Stack.Screen name="account-security" />
          <Stack.Screen name="account-deletion" />
          <Stack.Screen name="help" />
        </Stack>
      </View>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RootNavigation />
      </SessionProvider>
    </QueryClientProvider>
  );
}
