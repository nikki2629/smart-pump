import { zodResolver } from '@hookform/resolvers/zod';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';

import { apiErrorMessage } from '@/api/client';
import type { DeviceCreatedResponse, Organization, Pump } from '@/api/types';
import { useCreateDevice, useDevices, useOrganizations, usePumps } from '@/data/queries';
import {
  AppButton,
  AppScreen,
  Card,
  FormField,
  PageHeader,
  StateBadge,
  colors,
} from '@/ui/components';

const schema = z.object({
  serial_number: z.string().trim().min(1, 'Enter the device serial number.').max(64),
  name: z.string().trim().min(1, 'Enter a device name.').max(120),
});
type FormValues = z.infer<typeof schema>;

function OptionList<T extends { id: string; name: string }>({
  label,
  items,
  selected,
  onSelect,
  emptyLabel,
}: {
  label: string;
  items: T[];
  selected: string;
  onSelect: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected === item.id }}
          onPress={() => onSelect(item.id)}
          style={[styles.option, selected === item.id && styles.optionSelected]}>
          <Text
            style={[
              styles.optionText,
              selected === item.id && styles.optionTextSelected,
            ]}>
            {item.name}
          </Text>
        </Pressable>
      ))}
      {items.length === 0 ? <Text style={styles.hint}>{emptyLabel}</Text> : null}
    </View>
  );
}

export default function PairDeviceScreen() {
  const organizationsQuery = useOrganizations();
  const pumpsQuery = usePumps();
  const devicesQuery = useDevices();
  const createDevice = useCreateDevice();
  const [organizationId, setOrganizationId] = useState('');
  const [pumpId, setPumpId] = useState('');
  const [createdDevice, setCreatedDevice] =
    useState<DeviceCreatedResponse | null>(null);
  const [serverError, setServerError] = useState('');
  const { control, handleSubmit, formState, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { serial_number: '', name: '' },
  });
  const organizations = organizationsQuery.data ?? [];
  const availablePumps = (pumpsQuery.data ?? []).filter(
    (pump) => pump.organization === organizationId,
  );

  const submit = handleSubmit(async (values) => {
    if (!organizationId) {
      setServerError('Select an organization.');
      return;
    }
    setServerError('');
    try {
      const response = await createDevice.mutateAsync({
        organization: organizationId,
        pump: pumpId || null,
        serial_number: values.serial_number.trim(),
        name: values.name.trim(),
      });
      setCreatedDevice(response);
      reset();
    } catch (error) {
      setServerError(apiErrorMessage(error));
    }
  });

  const loading = organizationsQuery.isPending || pumpsQuery.isPending;
  const loadError = organizationsQuery.error ?? pumpsQuery.error;
  if (loading) {
    return (
      <AppScreen>
        <PageHeader title="Register a device" />
        <Card>
          <Text style={styles.hint}>Loading your organizations and pumps…</Text>
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Device onboarding"
        title={createdDevice ? 'Device registered' : 'Register a device'}
        subtitle="The backend creates a short-lived pairing credential for the hardware onboarding flow."
      />
      {loadError ? (
        <Card>
          <Text style={styles.error}>{apiErrorMessage(loadError)}</Text>
          <AppButton
            title="Retry"
            variant="secondary"
            onPress={() => {
              void Promise.all([
                organizationsQuery.refetch(),
                pumpsQuery.refetch(),
              ]);
            }}
          />
        </Card>
      ) : null}
      {!loadError && organizations.length === 0 ? (
        <Card>
          <Text style={styles.hint}>
            Add an organization before registering a device.
          </Text>
          <Link href="/create-organization" style={styles.link}>
            Create an organization
          </Link>
        </Card>
      ) : null}
      {createdDevice ? (
        <Card>
          <View style={styles.resultHeader}>
            <Text style={styles.cardTitle}>{createdDevice.name}</Text>
            <StateBadge label="Pending pairing" tone="warning" />
          </View>
          <Text style={styles.body}>
            Give this one-time code to the authorized embedded firmware
            provisioning workflow. The physical device must pair itself; this
            app does not impersonate a device.
          </Text>
          <View style={styles.codeBox}>
            <Text selectable style={styles.code}>
              {createdDevice.pairing_code}
            </Text>
          </View>
          <Text style={styles.hint}>
            Keep the code private and configure it only on the intended device.
            It is time-limited and is not stored in the app after this screen.
          </Text>
          <AppButton
            title="Done"
            onPress={() => {
              setCreatedDevice(null);
              void devicesQuery.refetch();
              router.replace('/(tabs)/pumps');
            }}
          />
        </Card>
      ) : (
        <Card>
          <OptionList<Organization>
            label="Organization"
            items={organizations}
            selected={organizationId}
            onSelect={(id) => {
              setOrganizationId(id);
              setPumpId('');
            }}
            emptyLabel="You have no organizations. Ask an administrator to add you."
          />
          <OptionList<Pump>
            label="Assign to pump (optional)"
            items={availablePumps}
            selected={pumpId}
            onSelect={setPumpId}
            emptyLabel={
              organizationId
                ? 'No pumps are available in this organization.'
                : 'Select an organization first.'
            }
          />
          {pumpId ? (
            <AppButton
              title="Clear pump assignment"
              onPress={() => setPumpId('')}
              variant="quiet"
              compact
            />
          ) : null}
          <Controller
            control={control}
            name="serial_number"
            render={({ field, fieldState }) => (
              <FormField
                label="Device serial number"
                placeholder="From the device label"
                autoCapitalize="characters"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <FormField
                label="Device name"
                placeholder="Pump panel 01"
                autoCapitalize="words"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
          {serverError ? <Text style={styles.error}>{serverError}</Text> : null}
          {devicesQuery.isError ? (
            <Text style={styles.hint}>
              Existing devices could not be refreshed; registration can still be
              checked from the pump list after submission.
            </Text>
          ) : null}
          <AppButton
            title="Register device"
            onPress={() => void submit()}
            loading={formState.isSubmitting || createDevice.isPending}
            disabled={!organizationId}
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
  resultHeader: { gap: 8 },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  codeBox: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#EEF3F6',
    borderWidth: 1,
    borderColor: colors.line,
  },
  code: {
    color: colors.ink,
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: '800',
    textAlign: 'center',
  },
  link: { color: colors.teal, fontWeight: '700', paddingVertical: 4 },
});
