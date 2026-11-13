import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams } from 'expo-router';
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

const requestSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
});
const confirmSchema = z.object({
  uid: z.string().min(1, 'Enter the user ID from the reset email.'),
  token: z.string().min(1, 'Enter the reset token from the email.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
});
type RequestValues = z.infer<typeof requestSchema>;
type ConfirmValues = z.infer<typeof confirmSchema>;

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ uid?: string; token?: string }>();
  const [message, setMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const resetForm = useForm<ConfirmValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { uid: params.uid ?? '', token: params.token ?? '', password: '' },
  });
  const requestForm = useForm<RequestValues>({
    resolver: zodResolver(requestSchema),
    defaultValues: { email: '' },
  });

  const requestReset = requestForm.handleSubmit(async ({ email }) => {
    setServerError('');
    try {
      const response = await api.requestPasswordReset(email.trim());
      setMessage(response.detail);
      setRequestSent(true);
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });
  const confirmReset = resetForm.handleSubmit(async (values) => {
    setServerError('');
    try {
      const response = await api.confirmPasswordReset({
        uid: values.uid.trim(),
        token: values.token.trim(),
        password: values.password,
      });
      setMessage(response.detail);
      setResetComplete(true);
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Account recovery"
        title={resetComplete ? 'Password updated' : 'Reset your password'}
        subtitle="The backend sends reset instructions if an account exists for the email."
      />
      <Card>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {!requestSent && !resetComplete ? (
          <>
            <Controller
              control={requestForm.control}
              name="email"
              render={({ field, fieldState }) => (
                <FormField
                  label="Account email"
                  placeholder="you@company.com"
                  keyboardType="email-address"
                  autoComplete="email"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <AppButton
              title="Send reset instructions"
              onPress={() => void requestReset()}
              loading={requestForm.formState.isSubmitting}
            />
          </>
        ) : null}
        {requestSent && !resetComplete ? (
          <>
            <Text style={styles.hint}>
              Enter the uid and token from the email to complete the reset.
            </Text>
            <Controller
              control={resetForm.control}
              name="uid"
              render={({ field, fieldState }) => (
                <FormField
                  label="User ID (uid)"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={resetForm.control}
              name="token"
              render={({ field, fieldState }) => (
                <FormField
                  label="Reset token"
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={resetForm.control}
              name="password"
              render={({ field, fieldState }) => (
                <FormField
                  label="New password"
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
            <AppButton
              title="Set new password"
              onPress={() => void confirmReset()}
              loading={resetForm.formState.isSubmitting}
            />
          </>
        ) : null}
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
      </Card>
      <Link href="/(auth)/login" style={styles.link}>
        Back to sign in
      </Link>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13 },
  message: { color: colors.green, fontSize: 14, lineHeight: 21 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  link: { color: colors.teal, fontWeight: '700', textAlign: 'center' },
});
