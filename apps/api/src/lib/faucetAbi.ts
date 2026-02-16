export const faucetAbi = [
  {
    type: 'function',
    name: 'nextEligibleAt',
    stateMutability: 'view',
    inputs: [{ name: 'recipient', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
