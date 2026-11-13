import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { SUPPORT_EMAIL } from '@/api/config';
import {
  AppButton,
  AppScreen,
  Card,
  PageHeader,
  SectionTitle,
  colors,
} from '@/ui/components';

const helpItems = [
  {
    question: 'Why is the motor state UNKNOWN?',
    answer:
      'The device may be offline, feedback may be too old or invalid, or the feedback source may not provide suitable physical confirmation.',
  },
  {
    question: 'The command is acknowledged but the pump did not start.',
    answer:
      'Acknowledgement confirms receipt only. Review command history and alerts. Never bypass electrical protections; have a qualified technician inspect the panel.',
  },
  {
    question: 'The app says the device is offline.',
    answer:
      'Check the controller power, network coverage, and approved broker connectivity. The app does not connect to MQTT directly.',
  },
  {
    question: 'A command timed out.',
    answer:
      'Check the device and physical pump state before retrying. A timed-out request may have an uncertain physical outcome.',
  },
];

export default function HelpScreen() {
  const contactSupport = async () => {
    try {
      await Linking.openURL(
        `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
          'Smart Pump Control support',
        )}`,
      );
    } catch {
      Alert.alert('Support', `Email ${SUPPORT_EMAIL} for assistance.`);
    }
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Support"
        title="Help and troubleshooting"
        subtitle="Always verify conditions at the motor-control panel when safe to do so."
      />
      {helpItems.map((item) => (
        <Card key={item.question}>
          <SectionTitle title={item.question} />
          <Text style={styles.answer}>{item.answer}</Text>
        </Card>
      ))}
      <Card style={styles.safety}>
        <Text style={styles.safetyHeading}>Electrical safety</Text>
        <Text style={styles.answer}>
          Software cannot replace local safety procedures. Do not defeat overload,
          phase-loss, emergency-stop, or other protective interlocks.
        </Text>
      </Card>
      <View style={styles.support}>
        <AppButton title="Email support" onPress={() => void contactSupport()} />
        <Text style={styles.email}>{SUPPORT_EMAIL}</Text>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  answer: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  safety: { backgroundColor: '#FFF8EA', borderColor: '#E8D19D' },
  safetyHeading: { color: colors.amber, fontSize: 15, fontWeight: '800' },
  support: { gap: 8 },
  email: { color: colors.muted, textAlign: 'center', fontSize: 12 },
});
