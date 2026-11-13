import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/client';
import { useCreateOrganization } from '@/data/queries';
import {
  AppButton,
  AppScreen,
  Card,
  FormField,
  PageHeader,
  colors,
} from '@/ui/components';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter an organization name.').max(160),
});
type FormValues = z.infer<typeof schema>;

export default function CreateOrganizationScreen() {
  const createOrganization = useCreateOrganization();
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });

  const submit = handleSubmit(async ({ name }) => {
    setServerError('');
    try {
      await createOrganization.mutateAsync({ name: name.trim() });
      router.replace('/create-pump');
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Organization setup"
        title="Create an organization"
        subtitle="You will be assigned the owner role. Organization access is enforced by the backend."
      />
      <Card>
        <Controller
          control={control}
          name="name"
          render={({ field, fieldState }) => (
            <FormField
              label="Organization name"
              placeholder="Water utility / site name"
              autoCapitalize="words"
              maxLength={160}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
            />
          )}
        />
        {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
        <AppButton
          title="Create organization"
          onPress={() => void submit()}
          loading={formState.isSubmitting || createOrganization.isPending}
        />
      </Card>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
});
