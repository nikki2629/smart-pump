import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { api } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import { useSession } from '@/auth/SessionContext';
import {
  AppButton,
  AppScreen,
  Card,
  FormField,
  colors,
} from '@/ui/components';

const schema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});
type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const { signIn } = useSession();
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      const tokens = await api.login(values.email.trim(), values.password);
      await signIn(tokens);
      router.replace('/(tabs)');
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  return (
    <AppScreen contentStyle={styles.screen}>
      <View style={styles.brand}>
        <View style={styles.mark}>
          <Text style={styles.markText}>SP</Text>
        </View>
        <Text style={styles.brandName}>Smart Pump</Text>
        <Text style={styles.brandTagline}>CONTROL · MONITOR · PROTECT</Text>
      </View>
      <Card style={styles.card}>
        <View style={styles.heading}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>
            Sign in to view confirmed pump conditions and authorized controls.
          </Text>
        </View>
        <Controller
          control={control}
          name="email"
          render={({ field, fieldState }) => (
            <FormField
              label="Email"
              placeholder="you@company.com"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field, fieldState }) => (
            <FormField
              label="Password"
              placeholder="Your password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        <AppButton
          title="Sign in"
          onPress={() => void submit()}
          loading={formState.isSubmitting}
        />
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
      </Card>
      <Text style={styles.footer}>
        New to Smart Pump?{' '}
        <Link href="/(auth)/register" style={styles.linkInline}>
          Create an account
        </Link>
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', paddingBottom: 52 },
  brand: { alignItems: 'center', gap: 7, marginBottom: 14 },
  mark: {
    height: 54,
    width: 54,
    borderRadius: 18,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  markText: { color: 'white', fontWeight: '900', fontSize: 17 },
  brandName: { color: colors.ink, fontWeight: '800', fontSize: 21 },
  brandTagline: {
    color: colors.muted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  card: { padding: 22 },
  heading: { gap: 6, marginBottom: 5 },
  title: { color: colors.ink, fontWeight: '800', fontSize: 24 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  link: { alignSelf: 'center', color: colors.teal, fontWeight: '700', padding: 6 },
  linkInline: { color: colors.teal, fontWeight: '800' },
  footer: { color: colors.muted, textAlign: 'center', fontSize: 14 },
});
