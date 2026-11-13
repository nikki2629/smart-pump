import {
  displayMotorState,
  MAX_FEEDBACK_AGE_MS,
} from '../utils/motorState';
import type { DeviceStatus } from '../api/types';
import { describe, expect, it } from '@jest/globals';

const recentStatus: DeviceStatus = {
  id: 'device-1',
  serial_number: 'PUMP-01',
  provisioning_status: 'paired',
  is_online: true,
  last_seen_at: '2026-01-01T00:00:00Z',
  motor_feedback: 'running',
  motor_feedback_source: 'auxiliary_contact',
  motor_feedback_valid: true,
  motor_feedback_at: '2026-01-01T00:00:00Z',
};

describe('displayMotorState', () => {
  const now = new Date(recentStatus.motor_feedback_at ?? '').getTime();

  it('displays a recent, valid, online physical feedback value', () => {
    expect(displayMotorState(recentStatus, now)).toBe('running');
  });

  it('returns UNKNOWN for offline or invalid feedback', () => {
    expect(
      displayMotorState({ ...recentStatus, is_online: false }, now),
    ).toBe('unknown');
    expect(
      displayMotorState({ ...recentStatus, motor_feedback_valid: false }, now),
    ).toBe('unknown');
  });

  it('returns UNKNOWN when feedback source is not physical', () => {
    expect(
      displayMotorState(
        { ...recentStatus, motor_feedback_source: 'unknown' },
        now,
      ),
    ).toBe('unknown');
  });

  it('returns UNKNOWN for stale or implausibly future feedback', () => {
    expect(
      displayMotorState(recentStatus, now + MAX_FEEDBACK_AGE_MS + 1),
    ).toBe('unknown');
    expect(
      displayMotorState(recentStatus, now - 60_001),
    ).toBe('unknown');
  });
});
