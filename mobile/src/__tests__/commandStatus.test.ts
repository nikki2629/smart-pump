import { commandPresentation } from '../utils/commandStatus';
import { describe, expect, it } from '@jest/globals';

describe('commandPresentation', () => {
  it('does not present device acknowledgement as motor success', () => {
    const acknowledgement = commandPresentation('acknowledged');
    expect(acknowledgement.pending).toBe(true);
    expect(acknowledgement.terminal).toBe(false);
    expect(acknowledgement.explanation).toContain(
      'Motor state is not confirmed',
    );
  });

  it('marks success as terminal only after backend feedback confirmation', () => {
    const success = commandPresentation('succeeded');
    expect(success.pending).toBe(false);
    expect(success.terminal).toBe(true);
    expect(success.label).toBe('Physically confirmed');
  });

  it('warns users not to blindly retry timed-out commands', () => {
    expect(commandPresentation('timed_out').explanation).toContain(
      'Check the device before retrying',
    );
  });
});
