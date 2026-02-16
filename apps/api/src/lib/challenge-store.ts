import { randomUUID } from 'node:crypto';
import type { Address } from 'viem';

export type ChallengeRecord = {
  id: string;
  address: Address;
  message: string;
  expiresAt: number;
  used: boolean;
};

export class ChallengeStore {
  private readonly records = new Map<string, ChallengeRecord>();

  create(address: Address, ttlSeconds: number): ChallengeRecord {
    const id = randomUUID();
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

    const message = [
      'Ethereum Faucet Request',
      '',
      `Wallet: ${address}`,
      `Challenge ID: ${id}`,
      `Expires: ${new Date(expiresAt * 1000).toISOString()}`,
      '',
      'Sign this message to prove wallet ownership and request a faucet ticket.',
    ].join('\n');

    const record: ChallengeRecord = {
      id,
      address,
      message,
      expiresAt,
      used: false,
    };

    this.records.set(id, record);
    this.cleanupExpired();
    return record;
  }

  get(id: string): ChallengeRecord | undefined {
    const record = this.records.get(id);
    if (!record) {
      return undefined;
    }

    if (record.expiresAt < Math.floor(Date.now() / 1000)) {
      this.records.delete(id);
      return undefined;
    }

    return record;
  }

  markUsed(id: string): void {
    const record = this.records.get(id);
    if (record) {
      record.used = true;
      this.records.set(id, record);
    }
  }

  private cleanupExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, record] of this.records.entries()) {
      if (record.expiresAt < now || record.used) {
        this.records.delete(id);
      }
    }
  }
}
