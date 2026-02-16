import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const networks: HardhatUserConfig['networks'] = {
  hardhat: {
    chainId: 31337,
  },
};

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;

if (process.env.SEPOLIA_RPC_URL && deployerPrivateKey) {
  networks.sepolia = {
    url: process.env.SEPOLIA_RPC_URL,
    accounts: [deployerPrivateKey],
  };
}

if (process.env.HOLESKY_RPC_URL && deployerPrivateKey) {
  networks.holesky = {
    url: process.env.HOLESKY_RPC_URL,
    accounts: [deployerPrivateKey],
  };
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  networks,
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY ?? '',
  },
};

export default config;
