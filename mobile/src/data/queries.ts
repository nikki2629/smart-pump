import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api } from '@/api/endpoints';
import { useSession } from '@/auth/SessionContext';
import type {
  CommandAction,
  DeviceCreateRequest,
  DevicePairingRequest,
  OrganizationCreateRequest,
  PumpCreateRequest,
  UserProfile,
} from '@/api/types';

export const queryKeys = {
  profile: ['profile'] as const,
  organizations: ['organizations'] as const,
  pumps: ['pumps'] as const,
  pump: (id: string) => ['pumps', id] as const,
  devices: ['devices'] as const,
  deviceStatus: (id: string) => ['device-status', id] as const,
  commands: ['commands'] as const,
  command: (id: string) => ['commands', id] as const,
  alerts: ['alerts'] as const,
  alert: (id: string) => ['alerts', id] as const,
  telemetry: (id: string) => ['telemetry', id] as const,
  pushTokens: ['push-tokens'] as const,
};

export function useProfile() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: api.getProfile,
    enabled: Boolean(tokens),
  });
}

export function useOrganizations() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: api.getOrganizations,
    enabled: Boolean(tokens),
  });
}

export function usePumps() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.pumps,
    queryFn: api.getPumps,
    enabled: Boolean(tokens),
  });
}

export function usePump(pumpId: string) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.pump(pumpId),
    queryFn: () => api.getPump(pumpId),
    enabled: Boolean(tokens) && Boolean(pumpId),
  });
}

export function useEsp32Config(pumpId: string | null) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: ['esp32-config', pumpId],
    queryFn: () => api.getEsp32Config(pumpId ?? ''),
    enabled: Boolean(tokens) && Boolean(pumpId),
  });
}

export function useDevices() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: api.getDevices,
    enabled: Boolean(tokens),
  });
}

export function useDeviceStatus(deviceId: string | null) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.deviceStatus(deviceId ?? ''),
    queryFn: () => api.getDeviceStatus(deviceId ?? ''),
    enabled: Boolean(tokens) && Boolean(deviceId),
    refetchInterval: 15_000,
  });
}

export function useCommands() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.commands,
    queryFn: api.getCommands,
    enabled: Boolean(tokens),
    refetchInterval: 5_000,
  });
}

export function useCommand(commandId: string) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.command(commandId),
    queryFn: () => api.getCommand(commandId),
    enabled: Boolean(tokens) && Boolean(commandId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status &&
        ['authorized', 'published', 'acknowledged', 'result_received'].includes(
          status,
        )
        ? 2_500
        : false;
    },
  });
}

export function useCreateCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      pumpId,
      action,
      idempotencyKey,
    }: {
      pumpId: string;
      action: CommandAction;
      idempotencyKey: string;
    }) =>
      api.createCommand(
        { pump_id: pumpId, action },
        idempotencyKey,
      ),
    onSuccess: async (command) => {
      queryClient.setQueryData(queryKeys.command(command.id), command);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.commands }),
        queryClient.invalidateQueries({ queryKey: ['device-status'] }),
      ]);
    },
  });
}

export function useAlerts() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: api.getAlerts,
    enabled: Boolean(tokens),
    refetchInterval: 30_000,
  });
}

export function useAlert(alertId: string) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.alert(alertId),
    queryFn: () => api.getAlert(alertId),
    enabled: Boolean(tokens) && Boolean(alertId),
  });
}

export function useAcknowledgeAlert(alertId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.acknowledgeAlert(alertId),
    onSuccess: async (alert) => {
      queryClient.setQueryData(queryKeys.alert(alert.id), alert);
      await queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

export function useTelemetry(deviceId: string | null) {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.telemetry(deviceId ?? ''),
    queryFn: () => api.getTelemetry(deviceId ?? ''),
    enabled: Boolean(tokens) && Boolean(deviceId),
  });
}

export function usePushTokens() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: queryKeys.pushTokens,
    queryFn: api.getPushTokens,
    enabled: Boolean(tokens),
  });
}

export function useRegisterPushToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.registerPushToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pushTokens });
    },
  });
}

export function useRemovePushToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removePushToken(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pushTokens });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Pick<UserProfile, 'first_name' | 'last_name' | 'phone_number' | 'timezone'>) =>
      api.updateProfile(payload),
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile);
    },
  });
}

export function usePairDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DevicePairingRequest) => api.pairDevice(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useCreatePump() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: PumpCreateRequest) => api.createPump(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pumps });
    },
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: OrganizationCreateRequest) =>
      api.createOrganization(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.organizations,
      });
    },
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeviceCreateRequest) => api.createDevice(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useUpdatePump() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<PumpCreateRequest> }) =>
      api.updatePump(id, payload),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pumps }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pump(variables.id) }),
      ]);
    },
  });
}

export function useDeletePump() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePump(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.pumps });
    },
  });
}

export function useNotifications() {
  const { tokens } = useSession();
  return useQuery({
    queryKey: ['notifications'],
    queryFn: api.getNotifications,
    enabled: Boolean(tokens),
    refetchInterval: 15_000,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useUnpairDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => api.unpairDevice(deviceId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}
