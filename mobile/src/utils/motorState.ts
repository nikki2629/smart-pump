import type { DeviceStatus, MotorFeedback } from '@/api/types';

export type DisplayMotorState = MotorFeedback | 'unknown';

export const MAX_FEEDBACK_AGE_MS = 90_000;

export function displayMotorState(
  status: DeviceStatus | null | undefined,
  now = Date.now(),
): DisplayMotorState {
  const feedbackAt = status?.motor_feedback_at
    ? new Date(status.motor_feedback_at).getTime()
    : Number.NaN;
  const feedbackAge = now - feedbackAt;
  if (
    !status ||
    !status.is_online ||
    !status.motor_feedback_valid ||
    !Number.isFinite(feedbackAt) ||
    feedbackAge > MAX_FEEDBACK_AGE_MS ||
    feedbackAge < -60_000 ||
    !['auxiliary_contact', 'phase_current'].includes(
      status.motor_feedback_source,
    )
  ) {
    return 'unknown';
  }
  return status.motor_feedback;
}
