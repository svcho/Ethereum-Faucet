import 'dotenv/config';
import { z } from 'zod';
import { getAddress, type Address, type Hex } from 'viem';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  RPC_URL: z.string().url(),
  FAUCET_CHAIN_ID: z.coerce.number().int().positive().default(11155111),
  FAUCET_CONTRACT_ADDRESS: z.string(),
  FAUCET_DOMAIN_NAME: z.string().default('ModernEthFaucet'),
  FAUCET_DOMAIN_VERSION: z.string().default('1'),
  FAUCET_DRIP_WEI: z.string().default('10000000000000000'),
  FAUCET_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(86400),
  FAUCET_MAX_RECIPIENT_BALANCE_WEI: z.string().default('50000000000000000'),
  TICKET_SIGNER_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  TICKET_TTL_SECONDS: z.coerce.number().int().positive().default(180),
  ADDRESS_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(86400),
  IP_COOLDOWN_SECONDS: z.coerce.number().int().positive().default(3600),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_VERIFY_URL: z
    .string()
    .url()
    .default('https://challenges.cloudflare.com/turnstile/v0/siteverify'),
});

const parsedEnv = envSchema.parse(process.env);

export const config = {
  nodeEnv: parsedEnv.NODE_ENV,
  host: parsedEnv.HOST,
  port: parsedEnv.PORT,
  webOrigin: parsedEnv.WEB_ORIGIN,
  rpcUrl: parsedEnv.RPC_URL,
  faucetChainId: parsedEnv.FAUCET_CHAIN_ID,
  faucetContractAddress: getAddress(parsedEnv.FAUCET_CONTRACT_ADDRESS) as Address,
  faucetDomainName: parsedEnv.FAUCET_DOMAIN_NAME,
  faucetDomainVersion: parsedEnv.FAUCET_DOMAIN_VERSION,
  faucetDripWei: BigInt(parsedEnv.FAUCET_DRIP_WEI),
  faucetCooldownSeconds: parsedEnv.FAUCET_COOLDOWN_SECONDS,
  faucetMaxRecipientBalanceWei: BigInt(parsedEnv.FAUCET_MAX_RECIPIENT_BALANCE_WEI),
  ticketSignerPrivateKey: parsedEnv.TICKET_SIGNER_PRIVATE_KEY as Hex,
  challengeTtlSeconds: parsedEnv.CHALLENGE_TTL_SECONDS,
  ticketTtlSeconds: parsedEnv.TICKET_TTL_SECONDS,
  addressCooldownSeconds: parsedEnv.ADDRESS_COOLDOWN_SECONDS,
  ipCooldownSeconds: parsedEnv.IP_COOLDOWN_SECONDS,
  turnstileSecretKey: parsedEnv.TURNSTILE_SECRET_KEY?.trim() || undefined,
  turnstileVerifyUrl: parsedEnv.TURNSTILE_VERIFY_URL,
};

export type AppConfig = typeof config;
