import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { apiErrorMessage } from '@/api/client';
import { api } from '@/api/endpoints';
import { useSession } from '@/auth/SessionContext';
import { useProfile, useUpdateProfile } from '@/data/queries';
import type { UserProfile } from '@/api/types';
import {
  AppButton,
  AppScreen,
  Card,
  ErrorState,
  FormField,
  LoadingState,
  PageHeader,
  colors,
} from '@/ui/components';

export default function ProfileScreen() {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading your profile…" />
      </AppScreen>
    );
  }
  if (profile.isError) {
    return (
      <AppScreen>
        <PageHeader title="Profile" />
        <ErrorState
          message={apiErrorMessage(profile.error)}
          onRetry={() => void profile.refetch()}
        />
      </AppScreen>
    );
  }
  return <ProfileEditor profile={profile.data} />;
}

function ProfileEditor({ profile }: { profile: UserProfile }) {
  const updateProfile = useUpdateProfile();
  const { signOut } = useSession();
  const [firstName, setFirstName] = useState(profile.first_name);
  const [lastName, setLastName] = useState(profile.last_name);
  const [phone, setPhone] = useState(profile.phone_number);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async () => {
    setError('');
    setSuccess('');
    try {
      await updateProfile.mutateAsync({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim(),
        timezone: timezone.trim(),
      });
      setSuccess('Profile saved.');
    } catch (saveError) {
      setError(apiErrorMessage(saveError));
    }
  };

  const finishSignOut = async () => {
    let notificationWarning = '';
    try {
      const registrations = await api.getPushTokens();
      await Promise.all(
        registrations.map((registration) =>
          api.removePushToken(registration.id),
        ),
      );
    } catch (error) {
      notificationWarning = `Push tokens could not be revoked: ${apiErrorMessage(error)}`;
    }

    try {
      await signOut();
      if (notificationWarning) {
        Alert.alert(
          'Signed out',
          `${notificationWarning}. Reconnect and remove this installation from notification settings.`,
        );
      }
    } catch (signOutError) {
      Alert.alert(
        'Sign-out issue',
        `The app could not confirm that all session data was cleared: ${apiErrorMessage(signOutError)}`,
      );
    }
  };

  const logout = () => {
    Alert.alert(
      'Sign out?',
      'Your secure session will be removed from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => void finishSignOut(),
        },
      ],
    );
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Account"
        title="Profile"
        subtitle="Manage your personal information and security settings."
      />
      <Card>
        <Text style={styles.section}>Personal details</Text>
        <FormField
          label="Email"
          value={profile.email}
          editable={false}
          autoCapitalize="none"
        />
        <View style={styles.row}>
          <View style={styles.half}>
            <FormField
              label="First name"
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.half}>
            <FormField
              label="Last name"
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
            />
          </View>
        </View>
        <FormField
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <FormField
          label="Time zone (IANA)"
          value={timezone}
          onChangeText={setTimezone}
          placeholder="e.g. America/Denver"
          autoCapitalize="none"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}
        <AppButton
          title="Save profile"
          onPress={() => void save()}
          loading={updateProfile.isPending}
        />
      </Card>
      <Card style={styles.links}>
        <Text style={styles.section}>Settings and help</Text>
        <NavigationRow href="/create-organization" title="Organizations" />
        <NavigationRow href="/account-security" title="Account security" />
        <NavigationRow
          href="/notification-settings"
          title="Notification settings"
        />
        <NavigationRow href="/help" title="Help and troubleshooting" />
        <NavigationRow href="/account-deletion" title="Account deletion" />
      </Card>
      <AppButton title="Sign out" variant="secondary" onPress={logout} />
    </AppScreen>
  );
}

function NavigationRow({ href, title }: { href: string; title: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable accessibilityRole="link" style={styles.rowLink}>
        <Text style={styles.linkText}>{title}</Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  error: { color: colors.red, fontSize: 13 },
  success: { color: colors.green, fontSize: 13 },
  links: { gap: 4 },
  rowLink: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chevron: { color: colors.muted, fontSize: 22 },
});
