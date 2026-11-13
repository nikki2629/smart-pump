import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type {
  Device,
  DeviceStatus,
  Pump,
  PumpAlert,
  PumpCommand,
  UserProfile,
} from '../api/types';
import * as queries from '../data/queries';
import DashboardScreen from '../../app/(tabs)/index';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: ReactNode }) => {
    if (typeof children !== 'string') return children;
    const { Text: NativeText } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <NativeText>{children}</NativeText>;
  },
}));

jest.mock('@/data/queries', () => ({
  useAlerts: jest.fn(),
  useCommands: jest.fn(),
  useDevices: jest.fn(),
  useDeviceStatus: jest.fn(),
  useProfile: jest.fn(),
  usePumps: jest.fn(),
  useNotifications: jest.fn(),
  useEsp32Config: jest.fn(),
  useCreateCommand: jest.fn(),
  useCreatePump: jest.fn(),
  useUpdatePump: jest.fn(),
  useDeletePump: jest.fn(),
  useMarkNotificationRead: jest.fn(),
}));

jest.mock('@/auth/SessionContext', () => ({
  useSession: () => ({
    tokens: { access: 'test', refresh: 'test' },
    signOut: jest.fn(),
  }),
}));

const pump: Pump = {
  id: 'pump-1',
  organization: 'org-1',
  name: 'North well',
  location: 'Field A',
  rated_power_kw: '7.50',
  motor_capacity_hp: '10.0',
  motor_type: 'Submersible',
  phase_configuration: '3-Phase',
  controller_id: 'PUMP-01',
  installation_description: 'Main pump',
  is_active: true,
  created_by: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const device: Device = {
  id: 'device-1',
  organization: 'org-1',
  pump: pump.id,
  serial_number: 'PUMP-01',
  name: 'Controller 1',
  provisioning_status: 'paired',
  paired_at: '2026-01-01T00:00:00Z',
  last_seen_at: '2026-01-01T00:00:00Z',
  is_online: true,
  motor_feedback: 'running',
  motor_feedback_source: 'auxiliary_contact',
  motor_feedback_valid: true,
  motor_feedback_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
};

function configureQueries(status: DeviceStatus | undefined) {
  const profile: UserProfile = {
    id: 1,
    email: 'operator@example.test',
    first_name: 'Alex',
    last_name: 'Operator',
    phone_number: '',
    timezone: 'UTC',
  };
  const pendingCommand: PumpCommand = {
    id: 'command-1',
    pump: pump.id,
    requested_by: 1,
    action: 'start',
    status: 'succeeded',
    expires_at: '2026-01-01T00:01:00Z',
    published_at: '2026-01-01T00:00:01Z',
    acknowledged_at: '2026-01-01T00:00:02Z',
    result_received_at: '2026-01-01T00:00:03Z',
    result_outcome: 'success',
    result_code: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:03Z',
  };
  jest.mocked(queries.useProfile).mockReturnValue({
    data: profile,
  } as ReturnType<typeof queries.useProfile>);
  jest.mocked(queries.usePumps).mockReturnValue({
    data: [pump],
    isPending: false,
    isError: false,
  } as ReturnType<typeof queries.usePumps>);
  jest.mocked(queries.useDevices).mockReturnValue({
    data: [device],
    isError: false,
  } as ReturnType<typeof queries.useDevices>);
  jest.mocked(queries.useDeviceStatus).mockReturnValue({
    data: status,
    isError: false,
  } as ReturnType<typeof queries.useDeviceStatus>);
  jest.mocked(queries.useCommands).mockReturnValue({
    data: [pendingCommand],
    isError: false,
  } as ReturnType<typeof queries.useCommands>);
  jest.mocked(queries.useAlerts).mockReturnValue({
    data: [] as PumpAlert[],
    isError: false,
  } as ReturnType<typeof queries.useAlerts>);
  jest.mocked(queries.useNotifications).mockReturnValue({
    data: [],
    isError: false,
  } as unknown as ReturnType<typeof queries.useNotifications>);
  jest.mocked(queries.useEsp32Config).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof queries.useEsp32Config>);
  jest.mocked(queries.useCreateCommand).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof queries.useCreateCommand>);
  jest.mocked(queries.useCreatePump).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof queries.useCreatePump>);
  jest.mocked(queries.useUpdatePump).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof queries.useUpdatePump>);
  jest.mocked(queries.useDeletePump).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof queries.useDeletePump>);
  jest.mocked(queries.useMarkNotificationRead).mockReturnValue({
    mutateAsync: jest.fn(),
  } as unknown as ReturnType<typeof queries.useMarkNotificationRead>);
}

describe('Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows RUNNING only for recent, valid, online physical feedback', async () => {
    configureQueries({
      id: device.id,
      serial_number: device.serial_number,
      provisioning_status: 'paired',
      is_online: true,
      last_seen_at: new Date().toISOString(),
      motor_feedback: 'running',
      motor_feedback_source: 'auxiliary_contact',
      motor_feedback_valid: true,
      motor_feedback_at: new Date().toISOString(),
    });

    const dashboard = await render(<DashboardScreen />);
    expect(dashboard.getAllByText('Running').length).toBeGreaterThan(0);
  });

  it('keeps state UNKNOWN even when a command succeeded without confirmed status data', async () => {
    configureQueries(undefined);

    const dashboard = await render(<DashboardScreen />);
    expect(dashboard.getByText('UNKNOWN')).toBeTruthy();
    expect(dashboard.getByText('All')).toBeTruthy();
  });
});
