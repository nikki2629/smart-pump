import * as Crypto from 'expo-crypto';

import { keyValueStore } from '@/api/keyValueStore';
import type { CommandAction } from '@/api/types';

function storageKey(pumpId: string, action: CommandAction): string {
  return `smart-pump.command-key.v1.${pumpId}.${action}`;
}

export async function getCommandIdempotencyKey(
  pumpId: string,
  action: CommandAction,
): Promise<string> {
  const key = storageKey(pumpId, action);
  const existing = await keyValueStore.get(key);
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return existing;
  }
  const generated = Crypto.randomUUID();
  await keyValueStore.set(key, generated);
  return generated;
}

export async function clearCommandIdempotencyKey(
  pumpId: string,
  action: CommandAction,
): Promise<void> {
  await keyValueStore.delete(storageKey(pumpId, action));
}
