import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import { usePushTokens, useRegisterPushToken, useRemovePushToken } from '@/data/queries';
import { registerNativePushToken } from '@/notifications/devicePush';
import {
  AppButton,
  AppScreen,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  colors,
  formatDate,
} from '@/ui/components';

export default function NotificationSettingsScreen() {
  const tokens = usePushTokens();
  const register = useRegisterPushToken();
  const remove = useRemovePushToken();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const enableNotifications = async () => {
    setError('');
    setSuccess('');
    try {
      const payload = await registerNativePushToken();
      await register.mutateAsync(payload);
      setSuccess('This device is registered for pump notifications.');
    } catch (registerError) {
      setError(apiErrorMessage(registerError));
    }
  };

  const removeToken = (id: string) => {
    Alert.alert(
      'Remove this device?',
      'Push notifications will no longer be delivered to this installation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setError('');
            void remove.mutateAsync(id).catch((removeError: unknown) => {
              setError(apiErrorMessage(removeError));
            });
          },
        },
      ],
    );
  };

  if (tokens.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading notification settings…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Notifications"
        title="Notification settings"
        subtitle="Register this installation to receive backend-delivered device alerts."
      />
      <Card>
        <Text style={styles.heading}>Push notifications</Text>
        <Text style={styles.body}>
          The app registers the native Android or iOS device token with the
          backend. It never connects to MQTT or stores broker credentials.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
        <AppButton
          title="Enable on this device"
          onPress={() => void enableNotifications()}
          loading={register.isPending}
        />
      </Card>
      {tokens.isError ? (
        <ErrorState
          message={apiErrorMessage(tokens.error)}
          onRetry={() => void tokens.refetch()}
        />
      ) : tokens.data.length === 0 ? (
        <Card>
          <Text style={styles.heading}>No registered devices</Text>
          <Text style={styles.body}>
            Enable notifications above to register this installation.
          </Text>
        </Card>
      ) : (
        <View style={styles.list}>
          <Text style={styles.heading}>Registered devices</Text>
          {tokens.data.map((token) => (
            <Card key={token.id} style={styles.tokenCard}>
              <View style={styles.row}>
                <View style={styles.tokenInfo}>
                  <Text style={styles.deviceName}>
                    {token.platform.toUpperCase()} device
                  </Text>
                  <Text style={styles.body}>
                    {token.active ? 'Active' : 'Inactive'} · Added{' '}
                    {formatDate(token.created_at)}
                  </Text>
                  <Text style={styles.tokenValue}>
                    Token ending {token.token.slice(-8)}
                  </Text>
                </View>
                <AppButton
                  title="Remove"
                  variant="danger"
                  compact
                  onPress={() => removeToken(token.id)}
                  loading={remove.isPending}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  success: { color: colors.green, fontSize: 13, lineHeight: 19 },
  list: { gap: 10 },
  tokenCard: { padding: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  tokenInfo: { flex: 1, gap: 5 },
  deviceName: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  tokenValue: { color: colors.muted, fontSize: 11 },
});
