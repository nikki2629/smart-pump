export type TokenPair = {
  access: string;
  refresh: string;
};

export type ApiMessage = {
  detail: string;
};

export type Page<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type UserProfile = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  timezone: string;
};

export type Organization = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type OrganizationCreateRequest = {
  name: string;
};

export type Pump = {
  id: string;
  organization: string;
  name: string;
  location: string;
  rated_power_kw: string | null;
  motor_capacity_hp: string | null;
  motor_type: string;
  phase_configuration: string;
  controller_id: string;
  installation_description: string;
  is_active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
  device_id?: string;
  connection_status?: 'Online' | 'Offline' | 'Not Paired' | 'Pairing Pending' | 'Fault';
  actual_motor_status?: 'Running' | 'Stopped' | 'Fault' | 'Unknown';
  last_seen_at?: string | null;
  latest_fault?: string | null;
};

export type PumpNotification = {
  id: string;
  user: number;
  pump: string | null;
  notification_type: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export type DeviceProvisioningStatus =
  | 'pending_pairing'
  | 'paired'
  | 'revoked';

export type MotorFeedback = 'unknown' | 'running' | 'stopped' | 'fault';
export type MotorFeedbackSource =
  | 'unknown'
  | 'auxiliary_contact'
  | 'phase_current';

export type Device = {
  id: string;
  organization: string;
  pump: string | null;
  serial_number: string;
  name: string;
  provisioning_status: DeviceProvisioningStatus;
  paired_at: string | null;
  last_seen_at: string | null;
  is_online: boolean;
  motor_feedback: MotorFeedback;
  motor_feedback_source: MotorFeedbackSource;
  motor_feedback_valid: boolean;
  motor_feedback_at: string | null;
  created_at: string;
};

export type DeviceStatus = {
  id: string;
  serial_number: string;
  provisioning_status: DeviceProvisioningStatus;
  is_online: boolean;
  last_seen_at: string | null;
  motor_feedback: MotorFeedback;
  motor_feedback_source: MotorFeedbackSource;
  motor_feedback_valid: boolean;
  motor_feedback_at: string | null;
};

export type CommandAction = 'start' | 'stop';
export type CommandStatus =
  | 'authorized'
  | 'published'
  | 'acknowledged'
  | 'result_received'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'timed_out';

export type PumpCommand = {
  id: string;
  pump: string;
  requested_by: number;
  action: CommandAction;
  status: CommandStatus;
  expires_at: string;
  published_at: string | null;
  acknowledged_at: string | null;
  result_received_at: string | null;
  result_outcome: string;
  result_code: string;
  created_at: string;
  updated_at: string;
};

export type CommandRequest = {
  pump_id: string;
  action: CommandAction;
};

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type PumpAlert = {
  id: string;
  device: string;
  severity: AlertSeverity;
  code: string;
  message: string;
  occurred_at: string;
  resolved_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  created_at: string;
};

export type TelemetryRecord = {
  id: string;
  device: string;
  reported_at: string;
  received_at: string;
  values: Record<string, number | number[]>;
};

export type PushTokenRegistration = {
  id: string;
  token: string;
  installation_id: string;
  platform: 'android' | 'ios';
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type DevicePairingRequest = {
  serial_number: string;
  pairing_code: string;
};

export type DeviceMqttConnectionInfo = {
  host: string;
  port: number;
  username: string;
  topic_root: string;
  protocol_version: number;
  tls: boolean;
};

export type DevicePairingResponse = {
  id: string;
  serial_number: string;
  provisioning_status: DeviceProvisioningStatus;
  mqtt: DeviceMqttConnectionInfo;
};

export type DeviceCreateRequest = {
  organization: string;
  pump?: string | null;
  serial_number: string;
  name: string;
};

export type DeviceCreatedResponse = Device & {
  pairing_code: string;
};

export type PumpCreateRequest = {
  organization?: string;
  name: string;
  location?: string;
  rated_power_kw?: string | null;
  motor_capacity_hp?: string | null;
  motor_type?: string;
  phase_configuration?: string;
  controller_id?: string;
  installation_description?: string;
  is_active?: boolean;
};

export type PumpUpdateRequest = Partial<PumpCreateRequest>;

export type RegistrationRequest = {
  email: string;
  password: string;
  confirm_password?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  phone_number?: string;
};

export type PasswordResetConfirmation = {
  uid: string;
  token: string;
  password: string;
};
