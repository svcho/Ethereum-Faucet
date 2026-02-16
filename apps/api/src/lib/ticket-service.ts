import { randomBytes } from 'node:crypto';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { AppConfig } from '../config.js';
import { faucetAbi } from './faucetAbi.js';

export type ClaimState = {
  faucetBalanceWei: bigint;
  recipientBalanceWei: bigint;
  nextEligibleAt: number;
};

export type FaucetTicket = {
  nonce: Hex;
  deadline: number;
  signature: Hex;
  signerAddress: Address;
};

const claimTypes = {
  Claim: [
    { name: 'recipient', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export class TicketService {
  private readonly signer;
  private readonly publicClient;
  private readonly walletClient;

  constructor(private readonly appConfig: AppConfig) {
    this.signer = privateKeyToAccount(this.appConfig.ticketSignerPrivateKey);
    this.publicClient = createPublicClient({
      transport: http(this.appConfig.rpcUrl),
    });
    this.walletClient = createWalletClient({
      account: this.signer,
      transport: http(this.appConfig.rpcUrl),
    });
  }

  async getClaimState(recipient: Address): Promise<ClaimState> {
    const [faucetBalanceWei, recipientBalanceWei, nextEligibleAtRaw] = await Promise.all([
      this.publicClient.getBalance({
        address: this.appConfig.faucetContractAddress,
      }),
      this.publicClient.getBalance({
        address: recipient,
      }),
      this.publicClient.readContract({
        address: this.appConfig.faucetContractAddress,
        abi: faucetAbi,
        functionName: 'nextEligibleAt',
        args: [recipient],
      }),
    ]);

    return {
      faucetBalanceWei,
      recipientBalanceWei,
      nextEligibleAt: Number(nextEligibleAtRaw),
    };
  }

  async issueTicket(recipient: Address): Promise<FaucetTicket> {
    const nonce = randomNonce();
    const deadline = Math.floor(Date.now() / 1000) + this.appConfig.ticketTtlSeconds;

    const signature = await this.walletClient.signTypedData({
      account: this.signer,
      domain: {
        name: this.appConfig.faucetDomainName,
        version: this.appConfig.faucetDomainVersion,
        chainId: this.appConfig.faucetChainId,
        verifyingContract: this.appConfig.faucetContractAddress,
      },
      types: claimTypes,
      primaryType: 'Claim',
      message: {
        recipient,
        nonce,
        deadline: BigInt(deadline),
      },
    });

    return {
      nonce,
      deadline,
      signature,
      signerAddress: this.signer.address,
    };
  }
}

function randomNonce(): Hex {
  const buffer = randomBytes(32);
  const value = `0x${buffer.toString('hex')}` as Hex;
  return value;
}

export function normalizeAddress(value: string): Address {
  return getAddress(value);
}
