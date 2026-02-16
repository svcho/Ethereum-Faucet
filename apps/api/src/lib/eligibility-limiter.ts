import type { Address } from 'viem';

export type EligibilityDecision = {
  allowed: boolean;
  reason?: 'address_cooldown' | 'ip_cooldown';
  retryAfterSeconds?: number;
};

export class EligibilityLimiter {
  private readonly lastIssuedByAddress = new Map<Address, number>();
  private readonly lastIssuedByIp = new Map<string, number>();

  constructor(
    private readonly addressCooldownSeconds: number,
    private readonly ipCooldownSeconds: number,
  ) {}

  check(address: Address, ip: string, nowSeconds: number): EligibilityDecision {
    const byAddress = this.lastIssuedByAddress.get(address);
    if (typeof byAddress === 'number') {
      const retryAfter = byAddress + this.addressCooldownSeconds - nowSeconds;
      if (retryAfter > 0) {
        return {
          allowed: false,
          reason: 'address_cooldown',
          retryAfterSeconds: retryAfter,
        };
      }
    }

    const byIp = this.lastIssuedByIp.get(ip);
    if (typeof byIp === 'number') {
      const retryAfter = byIp + this.ipCooldownSeconds - nowSeconds;
      if (retryAfter > 0) {
        return {
          allowed: false,
          reason: 'ip_cooldown',
          retryAfterSeconds: retryAfter,
        };
      }
    }

    return { allowed: true };
  }

  markIssued(address: Address, ip: string, nowSeconds: number): void {
    this.lastIssuedByAddress.set(address, nowSeconds);
    this.lastIssuedByIp.set(ip, nowSeconds);
    this.cleanup(nowSeconds);
  }

  private cleanup(nowSeconds: number): void {
    for (const [address, timestamp] of this.lastIssuedByAddress.entries()) {
      if (timestamp + this.addressCooldownSeconds <= nowSeconds) {
        this.lastIssuedByAddress.delete(address);
      }
    }

    for (const [ip, timestamp] of this.lastIssuedByIp.entries()) {
      if (timestamp + this.ipCooldownSeconds <= nowSeconds) {
        this.lastIssuedByIp.delete(ip);
      }
    }
  }
}
