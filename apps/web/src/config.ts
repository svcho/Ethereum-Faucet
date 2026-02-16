import { getAddress, type Address } from 'viem';

const DEFAULT_FAUCET_ADDRESS = '0x0000000000000000000000000000000000000000';

export const appConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787',
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? 11155111),
  rpcUrl: import.meta.env.VITE_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com',
  faucetAddress: getAddress(
    import.meta.env.VITE_FAUCET_ADDRESS ?? DEFAULT_FAUCET_ADDRESS,
  ) as Address,
  explorerBaseUrl: import.meta.env.VITE_EXPLORER_BASE_URL ?? 'https://sepolia.etherscan.io',
  turnstileSiteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined,
};
