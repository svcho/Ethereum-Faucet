import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { verifyMessage, type Hex } from 'viem';
import { z } from 'zod';
import { config } from './config.js';
import { verifyCaptcha } from './lib/captcha.js';
import { ChallengeStore } from './lib/challenge-store.js';
import { EligibilityLimiter } from './lib/eligibility-limiter.js';
import { normalizeAddress, TicketService } from './lib/ticket-service.js';

const app = Fastify({
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

const challengeStore = new ChallengeStore();
const eligibilityLimiter = new EligibilityLimiter(
  config.addressCooldownSeconds,
  config.ipCooldownSeconds,
);
const ticketService = new TicketService(config);

const challengeRequestSchema = z.object({
  address: z.string(),
});

const ticketRequestSchema = z.object({
  address: z.string(),
  challengeId: z.string().uuid(),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
  captchaToken: z.string().optional(),
});

app.register(cors, {
  origin: config.webOrigin,
  credentials: false,
});

app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
});

app.get('/api/v1/health', async () => {
  return {
    ok: true,
    service: 'ethereum-faucet-api',
    timestamp: new Date().toISOString(),
  };
});

app.get('/api/v1/config', async () => {
  return {
    chainId: config.faucetChainId,
    contractAddress: config.faucetContractAddress,
    dripAmountWei: config.faucetDripWei.toString(),
    cooldownSeconds: config.faucetCooldownSeconds,
    maxRecipientBalanceWei: config.faucetMaxRecipientBalanceWei.toString(),
    captchaProvider: config.turnstileSecretKey ? 'turnstile' : 'none',
  };
});

app.post('/api/v1/challenge', async (request, reply) => {
  const parsedBody = challengeRequestSchema.safeParse(request.body);
  if (!parsedBody.success) {
    return reply.code(400).send({
      error: 'invalid_request',
      details: parsedBody.error.flatten(),
    });
  }

  let address;
  try {
    address = normalizeAddress(parsedBody.data.address);
  } catch {
    return reply.code(400).send({
      error: 'invalid_address',
    });
  }

  const challenge = challengeStore.create(address, config.challengeTtlSeconds);

  return {
    challengeId: challenge.id,
    address,
    message: challenge.message,
    expiresAt: challenge.expiresAt,
  };
});

app.post('/api/v1/ticket', async (request, reply) => {
  const parsedBody = ticketRequestSchema.safeParse(request.body);
  if (!parsedBody.success) {
    return reply.code(400).send({
      error: 'invalid_request',
      details: parsedBody.error.flatten(),
    });
  }

  let address;
  try {
    address = normalizeAddress(parsedBody.data.address);
  } catch {
    return reply.code(400).send({
      error: 'invalid_address',
    });
  }

  const challenge = challengeStore.get(parsedBody.data.challengeId);
  if (!challenge || challenge.used) {
    return reply.code(400).send({
      error: 'challenge_not_found',
    });
  }

  if (challenge.address !== address) {
    return reply.code(403).send({
      error: 'challenge_address_mismatch',
    });
  }

  const signatureValid = await verifyMessage({
    address,
    message: challenge.message,
    signature: parsedBody.data.signature as Hex,
  });

  if (!signatureValid) {
    return reply.code(401).send({
      error: 'invalid_wallet_signature',
    });
  }

  const captchaResult = await verifyCaptcha({
    token: parsedBody.data.captchaToken,
    remoteIp: request.ip,
    secretKey: config.turnstileSecretKey,
    verifyUrl: config.turnstileVerifyUrl,
  });

  if (!captchaResult.success) {
    return reply.code(403).send({
      error: 'captcha_verification_failed',
      provider: captchaResult.provider,
    });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const localEligibility = eligibilityLimiter.check(address, request.ip, nowSeconds);
  if (!localEligibility.allowed) {
    return reply.code(429).send({
      error: localEligibility.reason,
      retryAfterSeconds: localEligibility.retryAfterSeconds,
    });
  }

  const claimState = await ticketService.getClaimState(address);

  if (claimState.faucetBalanceWei < config.faucetDripWei) {
    return reply.code(503).send({
      error: 'faucet_empty',
      faucetBalanceWei: claimState.faucetBalanceWei.toString(),
    });
  }

  if (claimState.recipientBalanceWei > config.faucetMaxRecipientBalanceWei) {
    return reply.code(403).send({
      error: 'recipient_balance_too_high',
      recipientBalanceWei: claimState.recipientBalanceWei.toString(),
      maxRecipientBalanceWei: config.faucetMaxRecipientBalanceWei.toString(),
    });
  }

  if (claimState.nextEligibleAt > nowSeconds) {
    return reply.code(429).send({
      error: 'onchain_cooldown_active',
      retryAfterSeconds: claimState.nextEligibleAt - nowSeconds,
      nextEligibleAt: claimState.nextEligibleAt,
    });
  }

  const ticket = await ticketService.issueTicket(address);

  challengeStore.markUsed(challenge.id);
  eligibilityLimiter.markIssued(address, request.ip, nowSeconds);

  return {
    ticket,
    expiresAt: ticket.deadline,
    constraints: {
      dripAmountWei: config.faucetDripWei.toString(),
      cooldownSeconds: config.faucetCooldownSeconds,
      maxRecipientBalanceWei: config.faucetMaxRecipientBalanceWei.toString(),
    },
  };
});

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({
    error: 'internal_error',
  });
});

app
  .listen({
    host: config.host,
    port: config.port,
  })
  .then(() => {
    app.log.info(`API running on http://${config.host}:${config.port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
