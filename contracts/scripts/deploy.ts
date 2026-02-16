import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';

dotenv.config();

function readBigInt(name: string, fallback: bigint): bigint {
  const value = process.env[name];
  return value ? BigInt(value) : fallback;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  const owner = process.env.FAUCET_OWNER ?? deployer.address;
  const claimSigner = process.env.TICKET_SIGNER_ADDRESS ?? deployer.address;

  const dripAmountWei = readBigInt('DRIP_AMOUNT_WEI', ethers.parseEther('0.01'));
  const cooldownSeconds = readNumber('COOLDOWN_SECONDS', 24 * 60 * 60);
  const maxRecipientBalanceWei = readBigInt('MAX_RECIPIENT_BALANCE_WEI', ethers.parseEther('0.05'));
  const initialFundingWei = readBigInt('INITIAL_FUNDING_WEI', ethers.parseEther('1'));

  const factory = await ethers.getContractFactory('ModernEthFaucet');
  const faucet = await factory.deploy(owner, claimSigner, [
    dripAmountWei,
    cooldownSeconds,
    maxRecipientBalanceWei,
  ]);

  await faucet.waitForDeployment();

  const faucetAddress = await faucet.getAddress();

  if (initialFundingWei > 0n) {
    const fundingTx = await deployer.sendTransaction({
      to: faucetAddress,
      value: initialFundingWei,
    });
    await fundingTx.wait();
  }

  console.log('Deployment complete');
  console.log(`Network chain ID: ${network.chainId.toString()}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Faucet: ${faucetAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Claim signer: ${claimSigner}`);
  console.log(`Drip amount (wei): ${dripAmountWei.toString()}`);
  console.log(`Cooldown (seconds): ${cooldownSeconds}`);
  console.log(`Max recipient balance (wei): ${maxRecipientBalanceWei.toString()}`);
  console.log(`Initial funding (wei): ${initialFundingWei.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
