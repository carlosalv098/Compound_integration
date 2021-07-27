const hre = require("hardhat");

async function main() {

    const COMPTROLLER = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
    const PRICE_FEED = '0x841616a5CBA946CF415Efe8a326A621A794D0f97';
    const CompoundIntegration = await hre.ethers.getContractFactory("CompoundIntegration");
    const compoundIntegration = await CompoundIntegration.deploy(COMPTROLLER, PRICE_FEED);

    await compoundIntegration.deployed();

    console.log("CompoundIntegration deployed to:", compoundIntegration.address);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });