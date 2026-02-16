import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('ModernEthFaucet', function () {
  let faucet: any;

  async function signClaim(
    recipient: string,
    nonce: string,
    deadline: bigint,
    signer: Awaited<ReturnType<typeof ethers.getSigners>>[number],
  ) {
    const network = await ethers.provider.getNetwork();
    const faucetAddress = await faucet.getAddress();

    const domain = {
      name: 'ModernEthFaucet',
      version: '1',
      chainId: Number(network.chainId),
      verifyingContract: faucetAddress,
    };

    const types = {
      Claim: [
        { name: 'recipient', type: 'address' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    return signer.signTypedData(domain, types, {
      recipient,
      nonce,
      deadline,
    });
  }

  beforeEach(async function () {
    const [owner, ticketSigner] = await ethers.getSigners();

    const Faucet = await ethers.getContractFactory('ModernEthFaucet');
    faucet = await Faucet.deploy(owner.address, ticketSigner.address, [
      ethers.parseEther('0.01'),
      3600,
      ethers.parseEther('1000000'),
    ]);
    await faucet.waitForDeployment();

    await owner.sendTransaction({
      to: await faucet.getAddress(),
      value: ethers.parseEther('1'),
    });
  });

  it('allows a claim with a valid ticket', async function () {
    const [, ticketSigner, user] = await ethers.getSigners();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const deadline = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 600);
    const signature = await signClaim(user.address, nonce, deadline, ticketSigner);

    const balanceBefore = await ethers.provider.getBalance(user.address);
    const tx = await faucet.connect(user).claim(nonce, deadline, signature);
    const receipt = await tx.wait();

    const balanceAfter = await ethers.provider.getBalance(user.address);
    expect(balanceAfter).to.be.greaterThan(balanceBefore);

    const isUsed = await faucet.usedNonces(nonce);
    expect(isUsed).to.equal(true);

    expect(receipt?.status).to.equal(1);
  });

  it('rejects replayed nonces', async function () {
    const [, ticketSigner, user] = await ethers.getSigners();
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const deadline = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 600);
    const signature = await signClaim(user.address, nonce, deadline, ticketSigner);

    await faucet.connect(user).claim(nonce, deadline, signature);

    await expect(faucet.connect(user).claim(nonce, deadline, signature))
      .to.be.revertedWithCustomError(faucet, 'NonceAlreadyUsed')
      .withArgs(nonce);
  });

  it('rejects expired tickets', async function () {
    const [, ticketSigner, user] = await ethers.getSigners();
    const now = (await ethers.provider.getBlock('latest'))!.timestamp;
    const deadline = BigInt(now - 1);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const signature = await signClaim(user.address, nonce, deadline, ticketSigner);

    await expect(
      faucet.connect(user).claim(nonce, deadline, signature),
    ).to.be.revertedWithCustomError(faucet, 'ClaimExpired');
  });

  it('enforces cooldown between claims', async function () {
    const [, ticketSigner, user] = await ethers.getSigners();

    const deadlineA = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 600);
    const nonceA = ethers.hexlify(ethers.randomBytes(32));
    const signatureA = await signClaim(user.address, nonceA, deadlineA, ticketSigner);
    await faucet.connect(user).claim(nonceA, deadlineA, signatureA);

    const deadlineB = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 600);
    const nonceB = ethers.hexlify(ethers.randomBytes(32));
    const signatureB = await signClaim(user.address, nonceB, deadlineB, ticketSigner);

    await expect(
      faucet.connect(user).claim(nonceB, deadlineB, signatureB),
    ).to.be.revertedWithCustomError(faucet, 'CooldownActive');
  });

  it('rejects tickets signed by unauthorized signers', async function () {
    const [, , user, attacker] = await ethers.getSigners();
    const deadline = BigInt((await ethers.provider.getBlock('latest'))!.timestamp + 600);
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    const signature = await signClaim(user.address, nonce, deadline, attacker);

    await expect(
      faucet.connect(user).claim(nonce, deadline, signature),
    ).to.be.revertedWithCustomError(faucet, 'InvalidTicketSignature');
  });

  it('allows the owner to update signer and withdraw treasury funds', async function () {
    const [owner, previousSigner, , newSigner, treasuryRecipient] = await ethers.getSigners();

    await expect(faucet.connect(owner).setClaimSigner(newSigner.address))
      .to.emit(faucet, 'ClaimSignerUpdated')
      .withArgs(previousSigner.address, newSigner.address);

    const recipientBefore = await ethers.provider.getBalance(treasuryRecipient.address);

    await faucet.connect(owner).withdraw(treasuryRecipient.address, ethers.parseEther('0.1'));

    const recipientAfter = await ethers.provider.getBalance(treasuryRecipient.address);
    expect(recipientAfter).to.equal(recipientBefore + ethers.parseEther('0.1'));
  });
});
