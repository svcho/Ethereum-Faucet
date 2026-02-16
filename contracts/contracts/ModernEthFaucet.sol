// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {Pausable} from '@openzeppelin/contracts/utils/Pausable.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

contract ModernEthFaucet is Ownable2Step, Pausable, ReentrancyGuard, EIP712 {
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256('Claim(address recipient,bytes32 nonce,uint256 deadline)');

    struct FaucetConfig {
        uint96 dripAmountWei;
        uint64 cooldownSeconds;
        uint96 maxRecipientBalanceWei;
    }

    address public claimSigner;
    FaucetConfig public faucetConfig;

    mapping(address => uint256) public nextEligibleAt;
    mapping(bytes32 => bool) public usedNonces;

    error ZeroAddress();
    error InvalidDripAmount();
    error InvalidCooldown();
    error InvalidMaxRecipientBalance();
    error FaucetEmpty(uint256 balanceWei, uint256 requiredWei);
    error CooldownActive(uint256 nextEligibleTimestamp);
    error RecipientBalanceTooHigh(uint256 currentBalanceWei, uint256 maxAllowedWei);
    error ClaimExpired(uint256 deadline, uint256 currentTimestamp);
    error InvalidTicketSignature();
    error NonceAlreadyUsed(bytes32 nonce);
    error TransferFailed();

    event Claimed(
        address indexed recipient,
        uint256 amountWei,
        bytes32 indexed nonce,
        uint256 nextEligibleTimestamp
    );
    event DonationReceived(address indexed from, uint256 amountWei);
    event ClaimSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event FaucetConfigUpdated(
        uint256 dripAmountWei,
        uint256 cooldownSeconds,
        uint256 maxRecipientBalanceWei
    );
    event TreasuryWithdrawal(address indexed to, uint256 amountWei);

    constructor(address initialOwner, address initialClaimSigner, FaucetConfig memory initialConfig)
        Ownable(initialOwner)
        EIP712('ModernEthFaucet', '1')
    {
        _validateConfig(initialConfig);

        if (initialClaimSigner == address(0)) {
            revert ZeroAddress();
        }

        claimSigner = initialClaimSigner;
        faucetConfig = initialConfig;

        emit ClaimSignerUpdated(address(0), initialClaimSigner);
        emit FaucetConfigUpdated(
            initialConfig.dripAmountWei,
            initialConfig.cooldownSeconds,
            initialConfig.maxRecipientBalanceWei
        );
    }

    function claim(bytes32 nonce, uint256 deadline, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        if (deadline < block.timestamp) {
            revert ClaimExpired(deadline, block.timestamp);
        }

        if (usedNonces[nonce]) {
            revert NonceAlreadyUsed(nonce);
        }

        FaucetConfig memory config = faucetConfig;

        if (address(this).balance < config.dripAmountWei) {
            revert FaucetEmpty(address(this).balance, config.dripAmountWei);
        }

        uint256 eligibleAt = nextEligibleAt[msg.sender];
        if (block.timestamp < eligibleAt) {
            revert CooldownActive(eligibleAt);
        }

        if (msg.sender.balance > config.maxRecipientBalanceWei) {
            revert RecipientBalanceTooHigh(msg.sender.balance, config.maxRecipientBalanceWei);
        }

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_TYPEHASH, msg.sender, nonce, deadline))
        );
        address recoveredSigner = ECDSA.recover(digest, signature);
        if (recoveredSigner != claimSigner) {
            revert InvalidTicketSignature();
        }

        usedNonces[nonce] = true;

        uint256 nextEligibleTimestamp = block.timestamp + config.cooldownSeconds;
        nextEligibleAt[msg.sender] = nextEligibleTimestamp;

        (bool success,) = payable(msg.sender).call{value: config.dripAmountWei}('');
        if (!success) {
            revert TransferFailed();
        }

        emit Claimed(msg.sender, config.dripAmountWei, nonce, nextEligibleTimestamp);
    }

    function setClaimSigner(address newClaimSigner) external onlyOwner {
        if (newClaimSigner == address(0)) {
            revert ZeroAddress();
        }

        address previousSigner = claimSigner;
        claimSigner = newClaimSigner;

        emit ClaimSignerUpdated(previousSigner, newClaimSigner);
    }

    function setFaucetConfig(FaucetConfig calldata newConfig) external onlyOwner {
        _validateConfig(newConfig);
        faucetConfig = newConfig;

        emit FaucetConfigUpdated(
            newConfig.dripAmountWei,
            newConfig.cooldownSeconds,
            newConfig.maxRecipientBalanceWei
        );
    }

    function withdraw(address payable to, uint256 amountWei) external onlyOwner nonReentrant {
        if (to == address(0)) {
            revert ZeroAddress();
        }

        if (amountWei > address(this).balance) {
            revert FaucetEmpty(address(this).balance, amountWei);
        }

        (bool success,) = to.call{value: amountWei}('');
        if (!success) {
            revert TransferFailed();
        }

        emit TreasuryWithdrawal(to, amountWei);
    }

    function remainingCooldown(address recipient) external view returns (uint256) {
        uint256 eligibleAt = nextEligibleAt[recipient];
        if (block.timestamp >= eligibleAt) {
            return 0;
        }

        return eligibleAt - block.timestamp;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function donate() external payable {
        emit DonationReceived(msg.sender, msg.value);
    }

    receive() external payable {
        emit DonationReceived(msg.sender, msg.value);
    }

    function _validateConfig(FaucetConfig memory config) internal pure {
        if (config.dripAmountWei == 0) {
            revert InvalidDripAmount();
        }

        if (config.cooldownSeconds == 0) {
            revert InvalidCooldown();
        }

        if (config.maxRecipientBalanceWei == 0) {
            revert InvalidMaxRecipientBalance();
        }
    }
}
