import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import { useDevices, useDeviceStatus, usePumps } from '@/data/queries';
import {
  AppButton,
  AppScreen,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StateBadge,
  colors,
  formatDate,
} from '@/ui/components';
import { motorLabel } from '@/utils/format';
import { displayMotorState } from '@/utils/motorState';

function PumpListItem({
  pump,
  deviceId,
}: {
  pump: {
    id: string;
    name: string;
    location: string;
    rated_power_kw: string | null;
    is_active: boolean;
  };
  deviceId: string | null;
}) {
  const statusQuery = useDeviceStatus(deviceId);
  const state = displayMotorState(statusQuery.data);
  const tone =
    state === 'running'
      ? 'success'
      : state === 'fault'
        ? 'danger'
        : state === 'stopped'
          ? 'neutral'
          : 'warning';

  return (
    <Link href={`/pump/${pump.id}` as never} asChild>
      <Pressable accessibilityRole="link" style={styles.link}>
        <Card style={styles.card}>
          <View style={styles.row}>
            <View style={styles.info}>
              <Text style={styles.name}>{pump.name}</Text>
              <Text style={styles.secondary}>
                {pump.location || 'Location not set'}
              </Text>
            </View>
            <StateBadge label={motorLabel(state)} tone={tone} />
          </View>
          <View style={styles.details}>
            <Text style={styles.secondary}>
              Device {statusQuery.data?.is_online ? 'online' : 'offline'} ·{' '}
              {pump.is_active ? 'Active' : 'Inactive'}
            </Text>
            <Text style={styles.secondary}>
              {pump.rated_power_kw ? `${pump.rated_power_kw} kW` : 'Power not set'}
            </Text>
            <Text style={styles.secondary}>
              Feedback: {formatDate(statusQuery.data?.motor_feedback_at)}
            </Text>
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}

export default function PumpsScreen() {
  const pumps = usePumps();
  const devices = useDevices();
  if (pumps.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading pump records…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Assets"
        title="Pumps"
        subtitle="Current motor state is derived from recent physical feedback."
        action={
          <AppButton
            title="Add"
            compact
            onPress={() => router.push('/create-pump')}
          />
        }
      />
      {pumps.isError ? (
        <ErrorState
          message={apiErrorMessage(pumps.error)}
          onRetry={() => void pumps.refetch()}
        />
      ) : devices.isError ? (
        <ErrorState
          message="Pump records loaded, but device status could not be retrieved."
          onRetry={() => void devices.refetch()}
        />
      ) : pumps.data.length === 0 ? (
        <EmptyState
          title="No pumps yet"
          message="Create a pump record in an organization where your role allows it."
          action={{ label: 'Create a pump', href: '/create-pump' }}
        />
      ) : (
        <View style={styles.list}>
          {pumps.data.map((pump) => {
            const device = (devices.data ?? []).find(
              (item) => item.pump === pump.id,
            );
            return (
              <PumpListItem
                key={pump.id}
                pump={pump}
                deviceId={device?.id ?? null}
              />
            );
          })}
        </View>
      )}
      <AppButton
        title="Register or pair a device"
        variant="secondary"
        onPress={() => router.push('/pair-device')}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  link: {},
  card: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  info: { flex: 1, gap: 4 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  secondary: { color: colors.muted, fontSize: 12 },
  details: {
    paddingTop: 10,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
});
