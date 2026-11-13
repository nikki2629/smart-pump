import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import { useCommands } from '@/data/queries';
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
import { commandTone, titleCase } from '@/utils/format';

export default function CommandHistoryScreen() {
  const commands = useCommands();
  if (commands.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading command history…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Activity"
        title="Commands"
        subtitle="Receipt acknowledgement is not proof of motor operation."
      />
      {commands.isError ? (
        <ErrorState
          message={apiErrorMessage(commands.error)}
          onRetry={() => void commands.refetch()}
        />
      ) : commands.data.length === 0 ? (
        <EmptyState
          title="No command history"
          message="Authorized start and stop requests will appear here."
        />
      ) : (
        <View style={styles.list}>
          {commands.data.map((command) => (
            <Link
              key={command.id}
              href={`/command/${command.id}` as never}
              asChild>
              <Pressable accessibilityRole="link" style={styles.link}>
                <Card style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.main}>
                      <Text style={styles.title}>
                        {titleCase(command.action)} request
                      </Text>
                      <Text style={styles.meta}>
                        {formatDate(command.created_at)}
                      </Text>
                    </View>
                    <StateBadge
                      label={titleCase(command.status)}
                      tone={commandTone(command.status)}
                    />
                  </View>
                  <Text style={styles.meta}>
                    {command.result_outcome
                      ? `Result: ${titleCase(command.result_outcome)}`
                      : command.status === 'succeeded'
                        ? 'Confirmed by physical feedback'
                        : 'Open for full status and feedback'}
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
  link: {},
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
});
