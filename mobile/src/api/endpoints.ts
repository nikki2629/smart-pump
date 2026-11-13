import { apiClient } from './client';
import type {
  ApiMessage,
  CommandRequest,
  Device,
  DeviceCreateRequest,
  DeviceCreatedResponse,
  DevicePairingRequest,
  DevicePairingResponse,
  DeviceStatus,
  Organization,
  OrganizationCreateRequest,
  Page,
  Pump,
  PumpCreateRequest,
  PumpAlert,
  PumpCommand,
  PushTokenRegistration,
  RegistrationRequest,
  TokenPair,
  TelemetryRecord,
  UserProfile,
} from './types';

async function getAllPages<T>(path: string): Promise<T[]> {
  const firstPage = await apiClient.get<Page<T>>(path);
  const results = [...firstPage.results];
  let next = firstPage.next;
  while (next) {
    const pageUrl = new URL(next);
    const page = pageUrl.searchParams.get('page');
    if (!page) {
      break;
    }
    const separator = path.includes('?') ? '&' : '?';
    const nextPage = await apiClient.get<Page<T>>(
      `${path}${separator}page=${encodeURIComponent(page)}`,
    );
    results.push(...nextPage.results);
    next = nextPage.next;
  }
  return results;
}

export const api = {
  register: (request: RegistrationRequest) =>
    apiClient.post<ApiMessage>('/accounts/register/', request),
  verifyEmail: (token: string) =>
    apiClient.post<ApiMessage>('/accounts/email/verify/', { token }),
  login: (email: string, password: string) =>
    apiClient.post<TokenPair>('/accounts/login/', { email, password }),
  requestPasswordReset: (email: string) =>
    apiClient.post<ApiMessage>('/accounts/password/reset/', { email }),
  confirmPasswordReset: (payload: {
    uid: string;
    token: string;
    password: string;
  }) =>
    apiClient.post<ApiMessage>(
      '/accounts/password/reset/confirm/',
      payload,
    ),
  getProfile: () => apiClient.get<UserProfile>('/accounts/me/'),
  updateProfile: (payload: Pick<UserProfile, 'first_name' | 'last_name' | 'phone_number' | 'timezone'>) =>
    apiClient.patch<UserProfile>('/accounts/me/', payload),
  logout: (refresh: string) =>
    apiClient.post<void>('/accounts/logout/', { refresh }),
  getOrganizations: () => apiClient.get<Organization[]>('/organizations/'),
  createOrganization: (payload: OrganizationCreateRequest) =>
    apiClient.post<Organization>('/organizations/', payload),
  getPumps: () => getAllPages<Pump>('/pumps/'),
  createPump: (payload: PumpCreateRequest) =>
    apiClient.post<Pump>('/pumps/', payload),
  getPump: (pumpId: string) =>
    apiClient.get<Pump>(`/pumps/${encodeURIComponent(pumpId)}/`),
  getEsp32Config: (pumpId: string) =>
    apiClient.get<{
      pump_id: string;
      pump_name: string;
      device_id: string;
      serial_number: string;
      config_h_code: string;
      instructions: string;
    }>(`/pumps/${encodeURIComponent(pumpId)}/esp32-config/`),
  updatePump: (pumpId: string, payload: Partial<PumpCreateRequest>) =>
    apiClient.patch<Pump>(`/pumps/${encodeURIComponent(pumpId)}/`, payload),
  deletePump: (pumpId: string) =>
    apiClient.delete<void>(`/pumps/${encodeURIComponent(pumpId)}/`),
  getDevices: () => getAllPages<Device>('/devices/'),
  createDevice: (payload: DeviceCreateRequest) =>
    apiClient.post<DeviceCreatedResponse>('/devices/', payload),
  getDeviceStatus: (deviceId: string) =>
    apiClient.get<DeviceStatus>(
      `/devices/${encodeURIComponent(deviceId)}/status/`,
    ),
  pairDevice: (payload: DevicePairingRequest) =>
    apiClient.post<DevicePairingResponse>('/devices/pair/', payload),
  unpairDevice: (deviceId: string) =>
    apiClient.post<{ detail: string }>(`/devices/${encodeURIComponent(deviceId)}/unpair/`, {}),
  getNotifications: () =>
    apiClient.get<import('./types').PumpNotification[]>('/notifications/'),
  markNotificationRead: (id: string) =>
    apiClient.post<import('./types').PumpNotification>(`/notifications/${encodeURIComponent(id)}/read/`, {}),
  getCommands: () => getAllPages<PumpCommand>('/commands/'),
  getCommand: (commandId: string) =>
    apiClient.get<PumpCommand>(
      `/commands/${encodeURIComponent(commandId)}/`,
    ),
  createCommand: (payload: CommandRequest, idempotencyKey: string) =>
    apiClient.post<PumpCommand>('/commands/', payload, {
      'Idempotency-Key': idempotencyKey,
    }),
  getAlerts: () => getAllPages<PumpAlert>('/alerts/'),
  getAlert: (alertId: string) =>
    apiClient.get<PumpAlert>(`/alerts/${encodeURIComponent(alertId)}/`),
  acknowledgeAlert: (alertId: string) =>
    apiClient.post<PumpAlert>(
      `/alerts/${encodeURIComponent(alertId)}/acknowledge/`,
      {},
    ),
  getTelemetry: (deviceId: string) =>
    getAllPages<TelemetryRecord>(
      `/telemetry/?device=${encodeURIComponent(deviceId)}`,
    ),
  getPushTokens: () =>
    apiClient.get<PushTokenRegistration[]>('/notifications/tokens/'),
  registerPushToken: (
    payload: Pick<
      PushTokenRegistration,
      'token' | 'installation_id' | 'platform'
    >,
  ) => apiClient.post<PushTokenRegistration>('/notifications/tokens/', payload),
  removePushToken: (tokenId: string) =>
    apiClient.delete<void>(
      `/notifications/tokens/${encodeURIComponent(tokenId)}/`,
    ),
};
