import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams, router } from 'expo-router';
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

const schema = z.object({ token: z.string().min(6, 'Enter 6-digit code.').max(6, 'Code must be 6 digits.') });
type FormValues = z.infer<typeof schema>;

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initialToken = Array.isArray(params.token) ? params.token[0] : params.token;
  const [serverError, setServerError] = useState('');
  const [complete, setComplete] = useState(false);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token: initialToken ?? '' },
  });
  const submit = handleSubmit(async ({ token }) => {
    setServerError('');
    try {
      await api.verifyEmail(token.trim());
      setComplete(true);
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Account security"
        title={complete ? 'Email verified' : 'Verify your email'}
        subtitle={
          complete
            ? 'Your account is ready. Sign in to continue.'
            : 'Enter the 6-digit verification code sent to your email.'
        }
      />
      <Card>
        {!complete ? (
          <>
            <Controller
              control={control}
              name="token"
              render={({ field, fieldState }) => (
                <FormField
                  label="6-Digit Verification Code"
                  placeholder="e.g. 849201"
                  keyboardType="number-pad"
                  maxLength={6}
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
            <AppButton
              title="Verify Code"
              onPress={() => void submit()}
              loading={formState.isSubmitting}
            />
          </>
        ) : (
          <AppButton
            title="Go to sign in"
            onPress={() => router.replace('/(auth)/login')}
          />
        )}
      </Card>
      <Link href="/(auth)/login" style={styles.link}>
        Back to sign in
      </Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13 },
  link: { color: colors.teal, fontWeight: '700', textAlign: 'center' },
});
