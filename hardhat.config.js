require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-truffle5");
require('dotenv').config();

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

module.exports = {
  solidity: "0.8.0",
  networks: {
    hardhat: {
      forking: {
        url: process.env.MAINNET_RPC
      }
    }
  }
};
