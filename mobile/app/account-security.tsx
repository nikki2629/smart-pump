import { Link } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { useProfile } from '@/data/queries';
import {
  AppScreen,
  Card,
  LoadingState,
  PageHeader,
  colors,
} from '@/ui/components';

export default function AccountSecurityScreen() {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading account security…" />
      </AppScreen>
    );
  }
  return (
    <AppScreen>
      <PageHeader
        eyebrow="Security"
        title="Account security"
        subtitle="Access and credential options available through the backend."
      />
      <Card>
        <Text style={styles.heading}>Email address</Text>
        <Text style={styles.body}>
          {profile.data?.email ?? 'Email address unavailable'}
        </Text>
        <Text style={styles.note}>
          Email changes are not currently supported by the backend.
        </Text>
      </Card>
      <Card>
        <Text style={styles.heading}>Password</Text>
        <Text style={styles.body}>
          Use the password reset flow to set a new password. Existing sessions
          are invalidated by the backend when a reset completes.
        </Text>
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Reset password
        </Link>
      </Card>
      <Card style={styles.notice}>
        <Text style={styles.heading}>Session protection</Text>
        <Text style={styles.body}>
          Access and refresh tokens are stored using the platform secure
          storage. The app attempts to refresh expired sessions and clears
          local data when refresh is rejected.
        </Text>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  note: { color: colors.amber, fontSize: 12, lineHeight: 18 },
  link: { color: colors.teal, fontWeight: '700' },
  notice: { backgroundColor: '#EAF4F4', borderColor: '#CEE4E2' },
});
