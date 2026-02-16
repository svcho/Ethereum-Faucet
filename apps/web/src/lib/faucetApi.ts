import { appConfig } from '../config';

export type FaucetApiConfig = {
  chainId: number;
  contractAddress: `0x${string}`;
  dripAmountWei: string;
  cooldownSeconds: number;
  maxRecipientBalanceWei: string;
  captchaProvider: 'turnstile' | 'none';
};

export type FaucetChallenge = {
  challengeId: string;
  address: `0x${string}`;
  message: string;
  expiresAt: number;
};

export type FaucetTicketResponse = {
  ticket: {
    nonce: `0x${string}`;
    deadline: number;
    signature: `0x${string}`;
    signerAddress: `0x${string}`;
  };
  expiresAt: number;
  constraints: {
    dripAmountWei: string;
    cooldownSeconds: number;
    maxRecipientBalanceWei: string;
  };
};

type ApiErrorPayload = {
  error?: string;
};

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json();

  if (!response.ok) {
    const payload = body as ApiErrorPayload;
    throw new Error(payload.error ?? 'api_request_failed');
  }

  return body as T;
}

export async function getFaucetApiConfig(): Promise<FaucetApiConfig> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/config`);
  return parseResponse<FaucetApiConfig>(response);
}

export async function createChallenge(address: string): Promise<FaucetChallenge> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/challenge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ address }),
  });

  return parseResponse<FaucetChallenge>(response);
}

export async function requestTicket(input: {
  address: string;
  challengeId: string;
  signature: `0x${string}`;
  captchaToken?: string;
}): Promise<FaucetTicketResponse> {
  const response = await fetch(`${appConfig.apiBaseUrl}/api/v1/ticket`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseResponse<FaucetTicketResponse>(response);
}
