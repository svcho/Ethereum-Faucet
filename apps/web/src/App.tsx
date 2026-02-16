import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  http,
  parseEther,
  type Address,
} from 'viem';
import faucetAbiJson from './abi/ModernEthFaucet.json';
import { appConfig } from './config';
import {
  createChallenge,
  getFaucetApiConfig,
  requestTicket,
  type FaucetApiConfig,
} from './lib/faucetApi';

const faucetAbi = faucetAbiJson;
const publicClient = createPublicClient({
  transport: http(appConfig.rpcUrl),
});

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

function shortenAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return 'Ready';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

type WalletClient = ReturnType<typeof createWalletClient>;

function App() {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [apiConfig, setApiConfig] = useState<FaucetApiConfig | null>(null);
  const [faucetBalanceWei, setFaucetBalanceWei] = useState<bigint>(0n);
  const [walletBalanceWei, setWalletBalanceWei] = useState<bigint>(0n);
  const [nextEligibleAt, setNextEligibleAt] = useState<number>(0);
  const [status, setStatus] = useState<string>('Connect your wallet to start.');
  const [donationAmount, setDonationAmount] = useState<string>('0.01');
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | null>(null);
  const [pendingClaim, setPendingClaim] = useState(false);
  const [pendingDonation, setPendingDonation] = useState(false);
  const [nowTimestamp, setNowTimestamp] = useState<number>(Math.floor(Date.now() / 1000));

  const dripAmountWei = apiConfig ? BigInt(apiConfig.dripAmountWei) : 0n;
  const maxRecipientBalanceWei = apiConfig ? BigInt(apiConfig.maxRecipientBalanceWei) : 0n;

  const cooldownRemainingSeconds = useMemo(() => {
    if (!walletAddress) {
      return 0;
    }

    return Math.max(0, nextEligibleAt - nowTimestamp);
  }, [walletAddress, nextEligibleAt, nowTimestamp]);

  const canClaim =
    Boolean(walletAddress) &&
    Boolean(walletClient) &&
    Boolean(apiConfig) &&
    !pendingClaim &&
    cooldownRemainingSeconds === 0 &&
    faucetBalanceWei >= dripAmountWei &&
    walletBalanceWei <= maxRecipientBalanceWei;

  const refresh = useCallback(async () => {
    const [fetchedConfig, fetchedFaucetBalance] = await Promise.all([
      getFaucetApiConfig(),
      publicClient.getBalance({ address: appConfig.faucetAddress }),
    ]);

    setApiConfig(fetchedConfig);
    setFaucetBalanceWei(fetchedFaucetBalance);

    if (walletAddress) {
      const [fetchedWalletBalance, fetchedNextEligibleAt] = await Promise.all([
        publicClient.getBalance({ address: walletAddress }),
        publicClient.readContract({
          address: appConfig.faucetAddress,
          abi: faucetAbi,
          functionName: 'nextEligibleAt',
          args: [walletAddress],
        }),
      ]);

      setWalletBalanceWei(fetchedWalletBalance);
      setNextEligibleAt(Number(fetchedNextEligibleAt));
    }
  }, [walletAddress]);

  useEffect(() => {
    refresh().catch((error) => {
      setStatus(`Unable to load faucet state: ${toErrorMessage(error)}`);
    });
  }, [refresh]);

  useEffect(() => {
    const tickTimer = setInterval(() => {
      setNowTimestamp(Math.floor(Date.now() / 1000));
    }, 1000);

    const refreshTimer = setInterval(() => {
      refresh().catch((error) => {
        setStatus(`Refresh failed: ${toErrorMessage(error)}`);
      });
    }, 15000);

    return () => {
      clearInterval(tickTimer);
      clearInterval(refreshTimer);
    };
  }, [refresh]);

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setStatus('No injected wallet detected. Install MetaMask or another EIP-1193 wallet.');
      return;
    }

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${appConfig.chainId.toString(16)}` }],
      });
    } catch {
      // Wallets may throw if the chain is already selected or unsupported; continue.
    }

    try {
      const client = createWalletClient({
        transport: custom(window.ethereum),
      });

      const accounts = await client.requestAddresses();
      if (accounts.length === 0) {
        setStatus('Wallet returned no accounts.');
        return;
      }

      const normalizedAddress = getAddress(accounts[0]);
      setWalletClient(client);
      setWalletAddress(normalizedAddress);
      setStatus(`Connected wallet ${shortenAddress(normalizedAddress)}.`);

      await refresh();
    } catch (error) {
      setStatus(`Wallet connection failed: ${toErrorMessage(error)}`);
    }
  }, [refresh]);

  const handleClaim = useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setStatus('Connect a wallet before requesting funds.');
      return;
    }

    setPendingClaim(true);
    setLastTxHash(null);

    try {
      setStatus('Creating challenge...');
      const challenge = await createChallenge(walletAddress);

      setStatus('Sign the ownership challenge in your wallet...');
      const walletSignature = await walletClient.signMessage({
        account: walletAddress,
        message: challenge.message,
      });

      setStatus('Requesting signed claim ticket...');
      const ticketResponse = await requestTicket({
        address: walletAddress,
        challengeId: challenge.challengeId,
        signature: walletSignature,
        captchaToken: captchaToken || undefined,
      });

      setStatus('Submitting on-chain claim transaction...');
      const claimTxHash = await walletClient.writeContract({
        account: walletAddress,
        chain: undefined,
        address: appConfig.faucetAddress,
        abi: faucetAbi,
        functionName: 'claim',
        args: [
          ticketResponse.ticket.nonce,
          BigInt(ticketResponse.ticket.deadline),
          ticketResponse.ticket.signature,
        ],
      });

      setLastTxHash(claimTxHash);
      setStatus('Claim submitted. Waiting for confirmation...');

      await publicClient.waitForTransactionReceipt({
        hash: claimTxHash,
      });

      setStatus('Claim confirmed. Funds delivered.');
      await refresh();
    } catch (error) {
      setStatus(`Claim failed: ${toErrorMessage(error)}`);
    } finally {
      setPendingClaim(false);
    }
  }, [captchaToken, refresh, walletAddress, walletClient]);

  const handleDonate = useCallback(async () => {
    if (!walletClient || !walletAddress) {
      setStatus('Connect a wallet before donating.');
      return;
    }

    setPendingDonation(true);
    setLastTxHash(null);

    try {
      const value = parseEther(donationAmount);
      setStatus('Submitting donation transaction...');

      const donationTxHash = await walletClient.sendTransaction({
        account: walletAddress,
        chain: undefined,
        to: appConfig.faucetAddress,
        value,
      });

      setLastTxHash(donationTxHash);
      setStatus('Donation submitted. Waiting for confirmation...');

      await publicClient.waitForTransactionReceipt({
        hash: donationTxHash,
      });

      setStatus('Donation confirmed. Thank you for funding the faucet.');
      await refresh();
    } catch (error) {
      setStatus(`Donation failed: ${toErrorMessage(error)}`);
    } finally {
      setPendingDonation(false);
    }
  }, [donationAmount, refresh, walletAddress, walletClient]);

  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Ethereum Faucet v2</p>
        <h1>Signed tickets. On-chain cooldown. No anonymous drain.</h1>
        <p>
          This faucet uses wallet-authenticated challenges, server-issued EIP-712 claim tickets, and
          on-chain replay protection.
        </p>

        <div className="hero-actions">
          <button onClick={connectWallet} className="button button-primary" type="button">
            {walletAddress ? `Connected: ${shortenAddress(walletAddress)}` : 'Connect Wallet'}
          </button>
          <a
            href={`${appConfig.explorerBaseUrl}/address/${appConfig.faucetAddress}`}
            target="_blank"
            rel="noreferrer"
            className="button button-secondary"
          >
            View Contract
          </a>
        </div>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Faucet Status</h2>
          <dl>
            <div>
              <dt>Network Chain ID</dt>
              <dd>{apiConfig?.chainId ?? appConfig.chainId}</dd>
            </div>
            <div>
              <dt>Contract</dt>
              <dd className="mono">{appConfig.faucetAddress}</dd>
            </div>
            <div>
              <dt>Faucet Balance</dt>
              <dd>{formatEther(faucetBalanceWei)} ETH</dd>
            </div>
            <div>
              <dt>Drip Amount</dt>
              <dd>{formatEther(dripAmountWei)} ETH</dd>
            </div>
            <div>
              <dt>Cooldown</dt>
              <dd>{apiConfig?.cooldownSeconds ?? 0} seconds</dd>
            </div>
            <div>
              <dt>Max Recipient Balance</dt>
              <dd>{formatEther(maxRecipientBalanceWei)} ETH</dd>
            </div>
          </dl>
        </article>

        <article className="card">
          <h2>Wallet State</h2>
          <dl>
            <div>
              <dt>Address</dt>
              <dd className="mono">{walletAddress ?? 'Not connected'}</dd>
            </div>
            <div>
              <dt>Wallet Balance</dt>
              <dd>{walletAddress ? `${formatEther(walletBalanceWei)} ETH` : 'N/A'}</dd>
            </div>
            <div>
              <dt>Next Claim Window</dt>
              <dd>{walletAddress ? formatDuration(cooldownRemainingSeconds) : 'N/A'}</dd>
            </div>
            <div>
              <dt>Captcha Provider</dt>
              <dd>{apiConfig?.captchaProvider ?? 'unknown'}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="grid">
        <article className="card action-card">
          <h2>Request ETH</h2>
          <p>
            Claim a drip after signing a challenge. Tickets expire quickly and can only be used
            once.
          </p>

          {apiConfig?.captchaProvider === 'turnstile' ? (
            <label className="field">
              <span>Turnstile token</span>
              <input
                type="text"
                value={captchaToken}
                onChange={(event) => setCaptchaToken(event.target.value)}
                placeholder="Paste token from your Turnstile widget"
              />
            </label>
          ) : null}

          <button
            onClick={handleClaim}
            className="button button-primary"
            type="button"
            disabled={!canClaim}
          >
            {pendingClaim ? 'Requesting...' : 'Request Faucet ETH'}
          </button>
        </article>

        <article className="card action-card">
          <h2>Fund Faucet</h2>
          <p>Keep the faucet healthy by donating test ETH to the contract treasury.</p>

          <label className="field">
            <span>Donation Amount (ETH)</span>
            <input
              type="number"
              min="0"
              step="0.001"
              value={donationAmount}
              onChange={(event) => setDonationAmount(event.target.value)}
            />
          </label>

          <button
            onClick={handleDonate}
            className="button button-secondary"
            type="button"
            disabled={!walletAddress || pendingDonation}
          >
            {pendingDonation ? 'Submitting...' : 'Donate ETH'}
          </button>
        </article>
      </section>

      <section className="status-bar">
        <p>{status}</p>
        {lastTxHash ? (
          <a
            href={`${appConfig.explorerBaseUrl}/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
        ) : null}
      </section>
    </main>
  );
}

export default App;
