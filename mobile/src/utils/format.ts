import type { AlertSeverity, CommandStatus, MotorFeedback } from '@/api/types';
import type { DisplayMotorState } from './motorState';

export function titleCase(value: string): string {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function motorLabel(state: DisplayMotorState | MotorFeedback): string {
  return state === 'unknown' ? 'UNKNOWN' : titleCase(state);
}

export function commandTone(
  status: CommandStatus,
): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'expired' || status === 'timed_out') return 'warning';
  if (status === 'authorized' || status === 'published' || status === 'acknowledged') {
    return 'info';
  }
  return 'warning';
}

export function severityTone(
  severity: AlertSeverity,
): 'neutral' | 'info' | 'success' | 'danger' | 'warning' {
  if (severity === 'critical') return 'danger';
  if (severity === 'warning') return 'warning';
  return 'info';
}
