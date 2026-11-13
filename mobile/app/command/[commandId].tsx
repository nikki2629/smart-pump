import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import {
  useCommand,
  useDevices,
  useDeviceStatus,
  usePump,
} from '@/data/queries';
import {
  AppScreen,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  StateBadge,
  colors,
  formatDate,
} from '@/ui/components';
import { commandPresentation } from '@/utils/commandStatus';
import { commandTone, motorLabel, titleCase } from '@/utils/format';
import { displayMotorState } from '@/utils/motorState';

export default function CommandDetailScreen() {
  const params = useLocalSearchParams<{ commandId: string | string[] }>();
  const commandId = Array.isArray(params.commandId)
    ? params.commandId[0]
    : params.commandId;
  const command = useCommand(commandId ?? '');
  const pump = usePump(command.data?.pump ?? '');
  const devices = useDevices();
  const device = (devices.data ?? []).find(
    (item) => item.pump === command.data?.pump,
  );
  const status = useDeviceStatus(device?.id ?? null);

  if (command.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Checking command status…" />
      </AppScreen>
    );
  }
  if (command.isError) {
    return (
      <AppScreen>
        <PageHeader title="Command status" />
        <ErrorState
          message={apiErrorMessage(command.error)}
          onRetry={() => void command.refetch()}
        />
      </AppScreen>
    );
  }

  const presentation = commandPresentation(command.data.status);
  return (
    <AppScreen>
      <PageHeader
        eyebrow="Command history"
        title={`${titleCase(command.data.action)} request`}
        subtitle={pump.data?.name ?? 'Pump'}
      />
      <Card>
        <StateBadge
          label={presentation.label}
          tone={commandTone(command.data.status)}
        />
        <Text style={styles.explanation}>{presentation.explanation}</Text>
        {presentation.pending ? (
          <Text style={styles.pending}>
            Confirmation is pending. This page checks for updates automatically.
          </Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Physical feedback</Text>
        <Text style={styles.motorState}>
          {motorLabel(displayMotorState(status.data))}
        </Text>
        <Text style={styles.meta}>
          Device {status.data?.is_online ? 'online' : 'offline / unknown'}
        </Text>
        <Text style={styles.meta}>
          Feedback source:{' '}
          {status.data?.motor_feedback_source
            ? titleCase(status.data.motor_feedback_source)
            : 'Unknown'}
        </Text>
        <Text style={styles.meta}>
          Feedback time: {formatDate(status.data?.motor_feedback_at)}
        </Text>
        {status.isError ? (
          <Text style={styles.warning}>
            Cannot confirm current physical state. Displaying UNKNOWN.
          </Text>
        ) : null}
      </Card>
      <Card>
        <Text style={styles.cardTitle}>Request timeline</Text>
        <Text style={styles.meta}>Created: {formatDate(command.data.created_at)}</Text>
        <Text style={styles.meta}>Expires: {formatDate(command.data.expires_at)}</Text>
        <Text style={styles.meta}>
          Published: {formatDate(command.data.published_at)}
        </Text>
        <Text style={styles.meta}>
          Acknowledged: {formatDate(command.data.acknowledged_at)}
        </Text>
        <Text style={styles.meta}>
          Result received: {formatDate(command.data.result_received_at)}
        </Text>
        {command.data.result_outcome ? (
          <Text style={styles.meta}>
            Result: {titleCase(command.data.result_outcome)}
          </Text>
        ) : null}
        {command.data.result_code ? (
          <Text style={styles.meta}>Code: {command.data.result_code}</Text>
        ) : null}
      </Card>
      {command.data.status === 'timed_out' || command.data.status === 'failed' ? (
        <Card style={styles.warningCard}>
          <Text style={styles.warning}>
            Do not retry until you have checked the device and confirmed the
            physical pump condition.
          </Text>
        </Card>
      ) : null}
      <Link href={`/pump/${command.data.pump}` as never} style={styles.link}>
        View pump
      </Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  explanation: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  pending: { color: colors.amber, fontSize: 13, lineHeight: 19 },
  cardTitle: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  motorState: { color: colors.ink, fontSize: 24, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  warning: { color: colors.amber, fontSize: 13, lineHeight: 20 },
  warningCard: { backgroundColor: '#FFF8EA', borderColor: '#E8D19D' },
  link: { color: colors.teal, fontWeight: '700', alignSelf: 'center', padding: 8 },
});
