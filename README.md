# Modern Ethereum Faucet

A full rewrite of the original faucet into a modern, abuse-resistant architecture:

- Hardened Solidity faucet contract
- API service that issues short-lived EIP-712 claim tickets
- React dashboard for wallet auth, claims, and donations
- Clean monorepo layout with explicit setup and ops docs

## Why this rewrite

Legacy faucet implementations (single function + static frontend) are easy to drain with scripted wallets and botnets. Modern public faucets now combine:

- Wallet ownership proof (signed challenge)
- Eligibility rules and rate limits
- Short-lived signed claim authorization
- On-chain replay/cooldown enforcement
- Operational observability and explicit runbooks

This repository now follows that model.

## GitHub Pages status

The legacy GitHub Pages frontend deployment was removed. This project is now run as a full-stack application (`apps/api` + `apps/web`) and deployed via your own hosting/runtime.

## Architecture

```text
apps/web (React + viem)
    |
    | 1) POST /challenge
    | 2) sign challenge with wallet
    | 3) POST /ticket
    v
apps/api (Fastify + viem signer)
    |
    | validates: signature, captcha (optional), ip/address cooldown,
    | on-chain claim eligibility, faucet balance
    | issues EIP-712 ticket (nonce + deadline + signature)
    v
contracts/contracts/ModernEthFaucet.sol
    |
    | verifies ticket signer + nonce uniqueness + cooldown + wallet balance cap
    | transfers drip amount and records next claim window
    v
recipient wallet
```

## Repository layout

```text
.
├── apps/
│   ├── api/                 # Fastify backend issuing claim tickets
│   └── web/                 # React frontend
├── contracts/
│   ├── contracts/           # Solidity contracts
│   ├── scripts/             # Deployment scripts
│   └── test/                # Hardhat tests
├── package.json             # Workspace scripts
└── tsconfig.base.json
```

## Smart contract design

`contracts/contracts/ModernEthFaucet.sol`

Key protections:

- `claim(bytes32 nonce, uint256 deadline, bytes signature)`
  - Verifies EIP-712 signature from trusted `claimSigner`
  - Enforces one-time nonce usage (`usedNonces`)
  - Enforces per-wallet cooldown (`nextEligibleAt`)
  - Rejects over-funded recipient wallets (`maxRecipientBalanceWei`)
  - Uses `call` + `nonReentrant` for payout safety
- Owner controls:
  - `setClaimSigner`
  - `setFaucetConfig`
  - `pause` / `unpause`
  - `withdraw`
- Donation support:
  - `receive()` and `donate()` emit `DonationReceived`

## API design

`apps/api/src/index.ts`

### Endpoints

- `GET /api/v1/health`
- `GET /api/v1/config`
- `POST /api/v1/challenge`
  - Input: wallet address
  - Output: challenge message + challengeId + expiry
- `POST /api/v1/ticket`
  - Input: address, challengeId, wallet signature, optional captcha token
  - Output: short-lived claim ticket (`nonce`, `deadline`, `signature`)

### Eligibility checks before ticket issuance

- Challenge signature validation (`verifyMessage`)
- Optional Turnstile verification
- Local IP + address cooldown gate
- On-chain recipient cooldown check (`nextEligibleAt`)
- Recipient wallet balance ceiling
- Faucet liquidity check

## Frontend design

`apps/web/src/App.tsx`

Features:

- Wallet connection (EIP-1193)
- Live faucet + wallet state
- Challenge signing flow
- Claim ticket request + on-chain `claim` execution
- Donation transaction flow
- Mobile/desktop responsive UI

## Prerequisites

- Node.js 20.x or 22.x LTS (Hardhat does not support Node 25)
- npm 10+ or Bun 1.3+
- A Sepolia-compatible RPC endpoint

## Quick start

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment files

```bash
cp contracts/.env.example contracts/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Fill all required variables, especially:

- `contracts/.env`
  - `SEPOLIA_RPC_URL`
  - `DEPLOYER_PRIVATE_KEY`
  - `FAUCET_OWNER`
  - `TICKET_SIGNER_ADDRESS`
- `apps/api/.env`
  - `RPC_URL`
  - `FAUCET_CONTRACT_ADDRESS`
  - `TICKET_SIGNER_PRIVATE_KEY`
- `apps/web/.env`
  - `VITE_API_BASE_URL`
  - `VITE_FAUCET_ADDRESS`

### 3) Compile and test contracts

```bash
npm run contracts:test
```

### 4) Deploy faucet contract

```bash
npm run contracts:deploy
```

The deployment script can seed initial faucet balance via `INITIAL_FUNDING_WEI`.

### 5) Run API and web apps

```bash
npm run dev
```

- API: [http://localhost:8787](http://localhost:8787)
- Web: [http://localhost:5173](http://localhost:5173)

## Configuration reference

### `contracts/.env`

| Variable                    | Description                                    |
| --------------------------- | ---------------------------------------------- |
| `SEPOLIA_RPC_URL`           | RPC endpoint used for deployment/verification. |
| `HOLESKY_RPC_URL`           | Optional alternate network RPC endpoint.       |
| `DEPLOYER_PRIVATE_KEY`      | Deployer wallet private key.                   |
| `ETHERSCAN_API_KEY`         | Optional contract verification key.            |
| `FAUCET_OWNER`              | Owner address for admin controls.              |
| `TICKET_SIGNER_ADDRESS`     | Address allowed to sign claim tickets.         |
| `DRIP_AMOUNT_WEI`           | Drip amount paid per successful claim.         |
| `COOLDOWN_SECONDS`          | Minimum wait between claims per wallet.        |
| `MAX_RECIPIENT_BALANCE_WEI` | Wallet balance ceiling for eligibility.        |
| `INITIAL_FUNDING_WEI`       | Optional deploy-time faucet seed amount.       |

### `apps/api/.env`

| Variable                                           | Description                                  |
| -------------------------------------------------- | -------------------------------------------- |
| `HOST` / `PORT`                                    | API bind address/port.                       |
| `WEB_ORIGIN`                                       | Allowed CORS origin for frontend.            |
| `RPC_URL`                                          | RPC endpoint for on-chain checks.            |
| `FAUCET_CHAIN_ID`                                  | Chain ID used in typed-data domain.          |
| `FAUCET_CONTRACT_ADDRESS`                          | Deployed faucet contract address.            |
| `FAUCET_DOMAIN_NAME` / `FAUCET_DOMAIN_VERSION`     | EIP-712 domain values (must match contract). |
| `FAUCET_DRIP_WEI`                                  | Expected on-chain drip amount.               |
| `FAUCET_COOLDOWN_SECONDS`                          | Expected on-chain cooldown.                  |
| `FAUCET_MAX_RECIPIENT_BALANCE_WEI`                 | Eligibility balance cap.                     |
| `TICKET_SIGNER_PRIVATE_KEY`                        | Private key used to sign claim tickets.      |
| `CHALLENGE_TTL_SECONDS`                            | Signature challenge expiry window.           |
| `TICKET_TTL_SECONDS`                               | Claim ticket expiry window.                  |
| `ADDRESS_COOLDOWN_SECONDS` / `IP_COOLDOWN_SECONDS` | Local anti-abuse cooldown windows.           |
| `TURNSTILE_SECRET_KEY`                             | Optional Cloudflare Turnstile secret.        |
| `TURNSTILE_VERIFY_URL`                             | Turnstile verification endpoint.             |

### `apps/web/.env`

| Variable                  | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `VITE_API_BASE_URL`       | Base URL of faucet API.                          |
| `VITE_CHAIN_ID`           | Target chain ID for wallet switching.            |
| `VITE_RPC_URL`            | Public RPC used for read operations.             |
| `VITE_FAUCET_ADDRESS`     | Faucet contract address.                         |
| `VITE_EXPLORER_BASE_URL`  | Explorer base URL for tx/address links.          |
| `VITE_TURNSTILE_SITE_KEY` | Optional key for frontend Turnstile integration. |

## Workspace commands

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run format
```

## Security model

Primary defense layers:

- Off-chain challenge-response proves wallet control before ticket issuance.
- Ticket signatures are EIP-712 typed data bound to recipient + nonce + deadline.
- Contract-level nonce replay protection prevents ticket reuse.
- Contract cooldown and max-balance checks provide deterministic anti-drain rules.
- Optional captcha adds bot friction for public internet deployments.
- Owner pause switch enables emergency shutdown.

## Production hardening recommendations

- Replace in-memory challenge/rate-limit storage with Redis.
- Add reputation inputs (attestations, account age, allowlists, etc.) to API eligibility.
- Move signer key into KMS/HSM; never keep long-lived plaintext secrets on disk.
- Add structured logs + metrics (latency, deny reasons, claim success rates).
- Add CI checks (lint, tests, static analysis, contract size limits).
- Add multi-region RPC fallback and health probes.

## Research references

This rewrite follows patterns used by current public faucets and standards docs:

- Ethereum test networks + faucet references: [ethereum.org testnets](https://ethereum.org/en/developers/docs/networks/)
- Chainlink faucet wallet-first UX: [faucets.chain.link](https://faucets.chain.link/)
- Alchemy faucet eligibility and cooldown model: [Alchemy Sepolia Faucet](https://www.alchemy.com/faucets/ethereum-sepolia)
- QuickNode faucet anti-abuse FAQ and timing limits: [QuickNode Faucet](https://faucet.quicknode.com/ethereum/sepolia)
- Typed signatures standard: [EIP-712](https://eips.ethereum.org/EIPS/eip-712)
- Contract security primitives (ReentrancyGuard/Pausable): [OpenZeppelin Contracts docs](https://docs.openzeppelin.com/contracts/5.x/api/utils)
- EIP-712 implementation helper: [OpenZeppelin EIP712 docs](https://docs.openzeppelin.com/contracts/5.x/api/utils/cryptography)
- Captcha verification API: [Cloudflare Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## License

MIT
