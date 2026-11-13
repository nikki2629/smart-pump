import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';
import { z } from 'zod';

import { api } from '@/api/endpoints';
import { apiErrorMessage } from '@/api/client';
import {
  AppButton,
  AppScreen,
  Card,
  FormField,
  PageHeader,
  colors,
} from '@/ui/components';

const schema = z.object({
  first_name: z.string().max(150),
  last_name: z.string().max(150),
  email: z.string().email('Enter a valid email address.'),
  phone: z.string().max(32),
  password: z
    .string()
    .min(6, 'Use at least 6 characters.')
    .max(128, 'Password is too long.'),
});
type FormValues = z.infer<typeof schema>;

export default function RegisterScreen() {
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      password: '',
    },
  });
  const submit = handleSubmit(async (values) => {
    setServerError('');
    try {
      await api.register({
        ...values,
        email: values.email.trim(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        phone: values.phone.trim(),
      });
      router.push('/(auth)/verify');
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  return (
    <AppScreen>
      <PageHeader
        eyebrow="New account"
        title="Get started"
        subtitle="Create your secure Smart Pump Control account."
      />
      <Card>
        <Controller
          control={control}
          name="first_name"
          render={({ field, fieldState }) => (
            <FormField
              label="First name"
              placeholder="First name"
              autoCapitalize="words"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="last_name"
          render={({ field, fieldState }) => (
            <FormField
              label="Last name"
              placeholder="Last name"
              autoCapitalize="words"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
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
          name="phone"
          render={({ field, fieldState }) => (
            <FormField
              label="Phone (optional)"
              placeholder="+1 555 010 1234"
              keyboardType="phone-pad"
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
              placeholder="At least 8 characters"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        <AppButton
          title="Create account"
          onPress={() => void submit()}
          loading={formState.isSubmitting}
        />
      </Card>
      <Text style={styles.footer}>
        Already registered?{' '}
        <Link href="/(auth)/login" style={styles.link}>
          Sign in
        </Link>
      </Text>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13 },
  footer: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  link: { color: colors.teal, fontWeight: '800' },
});
