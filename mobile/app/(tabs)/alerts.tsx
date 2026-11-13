import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import { useAlerts } from '@/data/queries';
import {
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
import { severityTone, titleCase } from '@/utils/format';

export default function AlertsScreen() {
  const alerts = useAlerts();
  if (alerts.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading alert history…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Safety and faults"
        title="Alerts"
        subtitle="Review device-reported faults and protection events."
      />
      {alerts.isError ? (
        <ErrorState
          message={apiErrorMessage(alerts.error)}
          onRetry={() => void alerts.refetch()}
        />
      ) : alerts.data.length === 0 ? (
        <EmptyState
          title="No alerts reported"
          message="Device faults and safety events will be recorded here."
        />
      ) : (
        <View style={styles.list}>
          {alerts.data.map((alert) => (
            <Link
              key={alert.id}
              href={`/alert/${alert.id}` as never}
              asChild>
              <Pressable accessibilityRole="link">
                <Card style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.main}>
                      <Text style={styles.title}>
                        {titleCase(alert.code.replace(/[_-]/g, ' '))}
                      </Text>
                      <Text style={styles.meta}>
                        {formatDate(alert.occurred_at)}
                      </Text>
                    </View>
                    <StateBadge
                      label={titleCase(alert.severity)}
                      tone={severityTone(alert.severity)}
                    />
                  </View>
                  <Text style={styles.message} numberOfLines={3}>
                    {alert.message}
                  </Text>
                  <Text style={styles.meta}>
                    {alert.resolved_at
                      ? `Resolved ${formatDate(alert.resolved_at)}`
                      : 'Unresolved'}
                  </Text>
                  <Text style={styles.meta}>
                    {alert.acknowledged_at
                      ? `Acknowledged ${formatDate(alert.acknowledged_at)}`
                      : 'Not acknowledged'}
                  </Text>
                </Card>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: { padding: 15, gap: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  main: { flex: 1, gap: 4 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 15 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.ink, fontSize: 13, lineHeight: 20 },
});
