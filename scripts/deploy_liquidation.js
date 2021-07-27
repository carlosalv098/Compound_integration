const hre = require("hardhat");

async function main() {

    const COMPTROLLER = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
    const Liquidation = await hre.ethers.getContractFactory("Liquidation");
    const liquidation = await Liquidation.deploy(COMPTROLLER);

    await liquidation.deployed();

    console.log("Liquidation deployed to:", liquidation.address);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });