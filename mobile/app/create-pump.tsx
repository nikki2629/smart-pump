import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/client';
import { useCreatePump, useOrganizations } from '@/data/queries';
import type { Organization } from '@/api/types';
import {
  AppButton,
  AppScreen,
  Card,
  FormField,
  LoadingState,
  PageHeader,
  colors,
} from '@/ui/components';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter a pump name.').max(120),
  location: z.string().max(200),
  rated_power_kw: z
    .string()
    .optional()
    .refine((value) => !value || (Number.isFinite(Number(value)) && Number(value) > 0), {
      message: 'Enter a positive power value.',
    }),
});
type FormValues = z.infer<typeof schema>;

function OrganizationPicker({
  organizations,
  value,
  onChange,
}: {
  organizations: Organization[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>Organization</Text>
      {organizations.map((organization) => (
        <Pressable
          key={organization.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === organization.id }}
          onPress={() => onChange(organization.id)}
          style={[
            styles.option,
            value === organization.id && styles.optionSelected,
          ]}>
          <Text
            style={[
              styles.optionText,
              value === organization.id && styles.optionTextSelected,
            ]}>
            {organization.name}
          </Text>
        </Pressable>
      ))}
      {organizations.length === 0 ? (
        <>
          <Text style={styles.hint}>
            No organizations are available. Create one or ask an organization
            manager to add you.
          </Text>
          <Link href="/create-organization" style={styles.link}>
            Create an organization
          </Link>
        </>
      ) : null}
    </View>
  );
}

export default function CreatePumpScreen() {
  const organizations = useOrganizations();
  const createPump = useCreatePump();
  const [organizationId, setOrganizationId] = useState('');
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', location: '', rated_power_kw: '' },
  });

  const submit = handleSubmit(async (values) => {
    if (!organizationId) {
      setServerError('Select an organization for this pump.');
      return;
    }
    setServerError('');
    try {
      const pump = await createPump.mutateAsync({
        organization: organizationId,
        name: values.name.trim(),
        location: values.location.trim(),
        rated_power_kw: values.rated_power_kw?.trim() || null,
      });
      router.replace(`/pump/${pump.id}` as never);
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  if (organizations.isPending) {
    return (
      <AppScreen>
        <LoadingState label="Loading organizations…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Pump management"
        title="Add a pump"
        subtitle="Your organization role is checked by the backend."
      />
      {organizations.isError ? (
        <Card>
          <Text style={styles.error}>
            {apiErrorMessage(organizations.error)}
          </Text>
          <AppButton
            title="Retry"
            variant="secondary"
            onPress={() => void organizations.refetch()}
          />
        </Card>
      ) : (
        <Card>
          <OrganizationPicker
            organizations={organizations.data}
            value={organizationId}
            onChange={setOrganizationId}
          />
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <FormField
                label="Pump name"
                placeholder="North well pump"
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
            name="location"
            render={({ field, fieldState }) => (
              <FormField
                label="Location"
                placeholder="Building / site"
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
            name="rated_power_kw"
            render={({ field, fieldState }) => (
              <FormField
                label="Rated power (kW, optional)"
                placeholder="e.g. 7.5"
                keyboardType="decimal-pad"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
          <AppButton
            title="Create pump"
            onPress={() => void submit()}
            loading={formState.isSubmitting || createPump.isPending}
            disabled={organizations.data.length === 0}
          />
        </Card>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  field: { gap: 7 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  option: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
  },
  optionSelected: { borderColor: colors.teal, backgroundColor: '#EAF6F4' },
  optionText: { color: colors.ink, fontSize: 14 },
  optionTextSelected: { color: colors.tealDark, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  link: { color: colors.teal, fontWeight: '700', paddingVertical: 4 },
});
