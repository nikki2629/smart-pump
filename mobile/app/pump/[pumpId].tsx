import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useNetInfo } from '@react-native-community/netinfo';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError, apiErrorMessage } from '@/api/client';
import type { CommandAction } from '@/api/types';
import {
  useCreateCommand,
  useDevices,
  useDeviceStatus,
  usePump,
  useTelemetry,
} from '@/data/queries';
import {
  clearCommandIdempotencyKey,
  getCommandIdempotencyKey,
} from '@/data/commandIdempotency';
import {
  AppButton,
  AppScreen,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionTitle,
  StateBadge,
  colors,
  formatDate,
} from '@/ui/components';
import { motorLabel, titleCase } from '@/utils/format';
import { displayMotorState } from '@/utils/motorState';

export default function PumpDetailScreen() {
  const { pumpId: rawPumpId } = useLocalSearchParams<{ pumpId: string | string[] }>();
  const pumpId = Array.isArray(rawPumpId) ? rawPumpId[0] : rawPumpId;
  const router = useRouter();
  const pump = usePump(pumpId ?? '');
  const devices = useDevices();
  const device = (devices.data ?? []).find((item) => item.pump === pump.data?.id);
  const status = useDeviceStatus(device?.id ?? null);
  const telemetry = useTelemetry(device?.id ?? null);
  const createCommand = useCreateCommand();
  const network = useNetInfo();
  const [commandError, setCommandError] = useState('');
  const commandInFlight = useRef(false);
  const currentState = displayMotorState(status.data);
  const canSendCommand =
    status.data?.is_online === true &&
    !status.isError &&
    network.isConnected !== false &&
    network.isInternetReachable !== false;

  const sendCommand = async (action: CommandAction) => {
    if (
      !pump.data ||
      !canSendCommand ||
      createCommand.isPending ||
      commandInFlight.current
    ) {
      return;
    }
    commandInFlight.current = true;
    setCommandError('');
    try {
      const idempotencyKey = await getCommandIdempotencyKey(
        pump.data.id,
        action,
      );
      const command = await createCommand.mutateAsync({
        pumpId: pump.data.id,
        action,
        idempotencyKey,
      });
      await clearCommandIdempotencyKey(pump.data.id, action);
      router.push(`/command/${command.id}` as never);
    } catch (error) {
      if (
        pump.data &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        try {
          await clearCommandIdempotencyKey(pump.data.id, action);
        } catch (storageError) {
          setCommandError(
            `${apiErrorMessage(error)} Also, the saved retry key could not be cleared: ${apiErrorMessage(storageError)}`,
          );
          return;
        }
      }
      setCommandError(apiErrorMessage(error));
    } finally {
      commandInFlight.current = false;
    }
  };

  const confirmCommand = (action: CommandAction) => {
    if (!canSendCommand) {
      setCommandError(
        network.isConnected === false ||
          network.isInternetReachable === false
          ? 'You are offline. No command was submitted.'
          : 'The device is offline or its status is unavailable. No command was submitted.',
      );
      return;
    }
    Alert.alert(
      `${action === 'start' ? 'Start' : 'Stop'} ${pump.data?.name ?? 'pump'}?`,
      'This sends an authorized request to the controller. The app will not assume a motor state; wait for device feedback.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Send ${action}`,
          style: action === 'stop' ? 'destructive' : 'default',
          onPress: () => void sendCommand(action),
        },
      ],
    );
  };

  if (pump.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading pump details…" />
      </AppScreen>
    );
  }
  if (pump.isError) {
    return (
      <AppScreen>
        <PageHeader title="Pump details" />
        <ErrorState
          message={apiErrorMessage(pump.error)}
          onRetry={() => void pump.refetch()}
        />
      </AppScreen>
    );
  }

  const feedbackTone =
    currentState === 'running'
      ? 'success'
      : currentState === 'fault'
        ? 'danger'
        : currentState === 'stopped'
          ? 'neutral'
          : 'warning';
  const latestTelemetry = telemetry.data?.[0];

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Pump details"
        title={pump.data.name}
        subtitle={pump.data.location || 'Location not set'}
      />
      <Card>
        <View style={styles.stateHeader}>
          <View style={styles.stateCopy}>
            <Text style={styles.label}>CONFIRMED MOTOR STATE</Text>
            <Text style={styles.state}>{motorLabel(currentState)}</Text>
          </View>
          <StateBadge label={feedbackTone === 'warning' ? 'Unconfirmed' : 'Feedback valid'} tone={feedbackTone} />
        </View>
        <View style={styles.metadata}>
          <Text style={styles.metaText}>
            Device: {device?.name ?? 'No device paired'}
          </Text>
          <Text style={styles.metaText}>
            Connection: {status.data?.is_online ? 'Online' : 'Offline / unknown'}
          </Text>
          <Text style={styles.metaText}>
            Feedback source:{' '}
            {status.data?.motor_feedback_source
              ? titleCase(status.data.motor_feedback_source)
              : 'Unknown'}
          </Text>
          <Text style={styles.metaText}>
            Feedback time: {formatDate(status.data?.motor_feedback_at)}
          </Text>
        </View>
        {status.isError ? (
          <Text style={styles.caution}>
            Live status could not be loaded. Actual motor state is UNKNOWN.
          </Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Remote control</Text>
        <Text style={styles.body}>
          Commands are authorized by the backend and may take time to confirm.
          A successful request alone does not mean the motor changed state.
        </Text>
        {!device ? (
          <Text style={styles.caution}>
            Pair a device before sending pump commands.
          </Text>
        ) : null}
        <View style={styles.actions}>
          <AppButton
            title="Start"
            onPress={() => confirmCommand('start')}
            disabled={
              !canSendCommand ||
              createCommand.isPending ||
              currentState !== 'stopped'
            }
            loading={createCommand.isPending}
          />
          <AppButton
            title="Stop"
            variant="danger"
            onPress={() => confirmCommand('stop')}
            disabled={
              !canSendCommand ||
              createCommand.isPending ||
              currentState === 'stopped'
            }
          />
        </View>
        {commandError ? <Text style={styles.error}>{commandError}</Text> : null}
        {currentState === 'unknown' ? (
          <Text style={styles.caution}>
            Start is disabled until recent physical feedback confirms the pump
            is stopped. Stop remains available while the device is online.
          </Text>
        ) : null}
        {devices.isError ? (
          <Text style={styles.caution}>Device information is unavailable.</Text>
        ) : null}
        {status.isFetching ? (
          <Text style={styles.metaText}>Refreshing device status…</Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Pump information</Text>
        <Text style={styles.metaText}>
          Rated power: {pump.data.rated_power_kw ?? 'Not set'}
          {pump.data.rated_power_kw ? ' kW' : ''}
        </Text>
        <Text style={styles.metaText}>
          Record status: {pump.data.is_active ? 'Active' : 'Inactive'}
        </Text>
        {device ? (
          <Link href="/pair-device" asChild>
            <Pressable accessibilityRole="link">
              <Text style={styles.link}>Pair another device</Text>
            </Pressable>
          </Link>
        ) : null}
      </Card>
      <Card>
        <SectionTitle title="Latest telemetry" />
        {telemetry.isPending ? (
          <Text style={styles.metaText}>Loading telemetry…</Text>
        ) : telemetry.isError ? (
          <Text style={styles.caution}>
            Telemetry history is unavailable right now.
          </Text>
        ) : !latestTelemetry ? (
          <Text style={styles.metaText}>No telemetry has been reported.</Text>
        ) : (
          <>
            <Text style={styles.metaText}>
              Reported {formatDate(latestTelemetry.reported_at)}
            </Text>
            {Object.entries(latestTelemetry.values).map(([key, value]) => (
              <Text key={key} style={styles.metaText}>
                {titleCase(key)}: {Array.isArray(value) ? value.join(', ') : value}
              </Text>
            ))}
          </>
        )}
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  stateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  stateCopy: { gap: 5 },
  label: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  state: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  metadata: {
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    gap: 5,
  },
  metaText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  caution: { color: colors.amber, fontSize: 13, lineHeight: 19 },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10 },
  error: { color: colors.red, fontSize: 13 },
  link: { color: colors.teal, fontWeight: '700', paddingTop: 5 },
});
