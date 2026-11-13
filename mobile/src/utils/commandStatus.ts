import type { CommandStatus } from '@/api/types';

export type CommandPresentation = {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'danger' | 'warning';
  pending: boolean;
  terminal: boolean;
  explanation: string;
};

const presentations: Record<CommandStatus, CommandPresentation> = {
  authorized: {
    label: 'Queued',
    tone: 'info',
    pending: true,
    terminal: false,
    explanation: 'Waiting for the backend to publish this request.',
  },
  published: {
    label: 'Sent to broker',
    tone: 'info',
    pending: true,
    terminal: false,
    explanation: 'The broker accepted the request. Device confirmation is pending.',
  },
  acknowledged: {
    label: 'Received by device',
    tone: 'info',
    pending: true,
    terminal: false,
    explanation: 'The device acknowledged receipt. Motor state is not confirmed yet.',
  },
  result_received: {
    label: 'Waiting for feedback',
    tone: 'warning',
    pending: true,
    terminal: false,
    explanation: 'Execution reported; waiting for valid physical feedback.',
  },
  succeeded: {
    label: 'Physically confirmed',
    tone: 'success',
    pending: false,
    terminal: true,
    explanation: 'The device result and physical motor feedback agree.',
  },
  failed: {
    label: 'Failed',
    tone: 'danger',
    pending: false,
    terminal: true,
    explanation: 'The device or controller reported that this request failed.',
  },
  expired: {
    label: 'Expired',
    tone: 'warning',
    pending: false,
    terminal: true,
    explanation: 'The request expired before the device accepted it.',
  },
  timed_out: {
    label: 'Timed out',
    tone: 'warning',
    pending: false,
    terminal: true,
    explanation: 'Confirmation did not arrive in time. Check the device before retrying.',
  },
};

export function commandPresentation(status: CommandStatus): CommandPresentation {
  return presentations[status];
}
