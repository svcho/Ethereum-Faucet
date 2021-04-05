# Ethereum Faucet

## Description

This project is a basic Ethereum faucet that enables anyone to send Ether to the smart contract to fill it up with funds and you can interact with it through the withdraw function to request 0.1 ETH from the faucet.

If the faucet has enough funds you will receive 0.1 ETH to your Ethereum address. There is a simple timeout filter built in to only allow one request per 30 minutes.

## Key Facts

* This code is published under the MIT License
* This code has been deveoped by Jacob Suchorabski
* Solidity (v. 0.7.4) has been used to develop and test the faucet
* You can find the frontend implementation in the `index.html` file which you can use to interface with the smart contract [here](https://svcho.github.io/Ethereum-Faucet/).

## Requirements & Demo

This version of the smart contract is deployed on the [Ropsten Testnetwork](https://ropsten.etherscan.io/) and you can find it with the following address:

[0x5194d3D2D77585ff89a2823F77C191a93d2F6416](https://ropsten.etherscan.io/address/0x5194d3D2D77585ff89a2823F77C191a93d2F6416)

If you want to use the smart contract you will need an Ethereum Wallet that can interact with smart contracts and switch to the Ropsten Testnetwork (Example: [MetaMask](https://metamask.io/)).

## Features

### Variables & Events

```Solidity
address owner;
mapping (address => uint) timeouts;
    
event Withdrawal(address indexed to);
event Deposit(address indexed from, uint amount);
    
constructor() {
    owner = msg.sender;
}

function destroy() public{
		require(msg.sender == owner, "Only the owner of this faucet can destroy it.");
		selfdestruct(msg.sender);
}
```

* When creating the smart contract the owner will be saved in order to protect the `selfdestruct` method which destroys this smart contract and sends all remaining funds of the contract to the sender.
* The `timeouts` hash map is used to track which address already used this faucet at which timestamp.
* `Withdrawal` and `Deposit` are events that will be called in the functions described below to make sure that we store our transactions in the transaction log which can be accessed through the blockchain.

### Withdrawing Ether

```Solidity
function withdraw() external{

    require(address(this).balance >= 0.1 ether, "This faucet is empty. Please check back later.");
    require(timeouts[msg.sender] <= block.timestamp - 30 minutes, "You can only withdraw once every 30 minutes. Please check back later.");

    msg.sender.transfer(0.1 ether);
    timeouts[msg.sender] = block.timestamp;

    emit Withdrawal(msg.sender);
    
}
```

* We are checking for two simple requirements in this project
  * Does this smart contract have enough funds? (This smart contract always sends exactly 0.1 ETH)
  * Did the sender already request a withdrawal in the last 30 minutes? (Checked using the timestamp of the current block of the transaction)
* If those conditions are met 0.1 ETH are sent to the `msg.sender` which is the entity calling the smart contract
* Finally the current timestamp is added to our `timeouts` hashmap

### Donating Ether

```Solidity
receive() external payable {
		emit Deposit(msg.sender, msg.value); 
} 
```

* Ether can be donated by anyone by simply sending Ether to the smart contract
* The `receive()` function is a default function that is payable so it can receive funds. You could also leave this function empty but since we want donations to be visible in the transaction log we are emitting our defined event.
