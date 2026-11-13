import { Alert, Linking, StyleSheet, Text } from 'react-native';

import { SUPPORT_EMAIL } from '@/api/config';
import {
  AppButton,
  AppScreen,
  Card,
  PageHeader,
  colors,
} from '@/ui/components';

export default function AccountDeletionScreen() {
  const contactSupport = async () => {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      'Smart Pump Control account deletion request',
    )}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to open email',
        `Contact support at ${SUPPORT_EMAIL} to request account deletion.`,
      );
    }
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Privacy"
        title="Account deletion"
        subtitle="Your account and operational history are protected records."
      />
      <Card>
        <Text style={styles.heading}>Deletion is not available in the app</Text>
        <Text style={styles.body}>
          The backend does not currently provide an account-deletion endpoint.
          This screen does not pretend to delete your account or its pump,
          command, alert, or audit history.
        </Text>
        <Text style={styles.body}>
          Contact support to request account closure and receive information
          about the applicable data-retention process.
        </Text>
        <AppButton title="Contact support" onPress={() => void contactSupport()} />
        <Text style={styles.support}>{SUPPORT_EMAIL}</Text>
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  support: { color: colors.teal, textAlign: 'center', fontSize: 13 },
});
