import { Link, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import {
  useAcknowledgeAlert,
  useAlert,
  useDevices,
  usePump,
} from '@/data/queries';
import {
  AppButton,
  AppScreen,
  Card,
  ErrorState,
  LoadingState,
  PageHeader,
  StateBadge,
  colors,
  formatDate,
} from '@/ui/components';
import { severityTone, titleCase } from '@/utils/format';

export default function AlertDetailScreen() {
  const params = useLocalSearchParams<{ alertId: string | string[] }>();
  const alertId = Array.isArray(params.alertId) ? params.alertId[0] : params.alertId;
  const alert = useAlert(alertId ?? '');
  const acknowledge = useAcknowledgeAlert(alertId ?? '');
  const devices = useDevices();
  const device = (devices.data ?? []).find((item) => item.id === alert.data?.device);
  const pump = usePump(device?.pump ?? '');

  if (alert.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading alert details…" />
      </AppScreen>
    );
  }
  if (alert.isError) {
    return (
      <AppScreen>
        <PageHeader title="Alert details" />
        <ErrorState
          message={apiErrorMessage(alert.error)}
          onRetry={() => void alert.refetch()}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Fault and alert history"
        title={titleCase(alert.data.code.replace(/[_-]/g, ' '))}
        subtitle={pump.data?.name ?? 'Pump alert'}
      />
      <Card>
        <StateBadge
          label={titleCase(alert.data.severity)}
          tone={severityTone(alert.data.severity)}
        />
        <Text style={styles.message}>{alert.data.message}</Text>
        <Text style={styles.meta}>
          Occurred: {formatDate(alert.data.occurred_at)}
        </Text>
        <Text style={styles.meta}>
          Status:{' '}
          {alert.data.resolved_at
            ? `Resolved ${formatDate(alert.data.resolved_at)}`
            : 'Unresolved'}
        </Text>
        <Text style={styles.meta}>
          Acknowledgment:{' '}
          {alert.data.acknowledged_at
            ? `Acknowledged ${formatDate(alert.data.acknowledged_at)}`
            : 'Not acknowledged'}
        </Text>
        {acknowledge.isError ? (
          <Text style={styles.error}>
            {apiErrorMessage(acknowledge.error)}
          </Text>
        ) : null}
        {!alert.data.acknowledged_at ? (
          <AppButton
            title="Acknowledge alert"
            variant="secondary"
            loading={acknowledge.isPending}
            onPress={() => acknowledge.mutate()}
          />
        ) : null}
        <Text style={styles.meta}>
          Device: {device?.name ?? device?.serial_number ?? 'Not available'}
        </Text>
        {device?.pump ? (
          <Link href={`/pump/${device.pump}` as never} style={styles.link}>
            View pump
          </Link>
        ) : null}
      </Card>
      <Card style={styles.safety}>
        <Text style={styles.safetyTitle}>Follow site safety procedures</Text>
        <Text style={styles.safetyText}>
          Do not bypass electrical protections or attempt remote resets. Have a
          qualified technician inspect the panel when required.
        </Text>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  message: { color: colors.ink, fontSize: 15, lineHeight: 23 },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  link: { color: colors.teal, fontWeight: '700', paddingTop: 4 },
  safety: { backgroundColor: '#FFF8EA', borderColor: '#E8D19D' },
  safetyTitle: { color: colors.amber, fontWeight: '800', fontSize: 14 },
  safetyText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
