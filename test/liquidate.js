const BN = require('bn.js');
const { assert } = require('chai');
const { web3, artifacts } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');

const IERC20 = artifacts.require('IERC20');
const CErc20 = artifacts.require('CErc20');
const CompoundIntegration = artifacts.require('CompoundIntegration');
const Liquidation = artifacts.require('Liquidation');

require('dotenv').config();
require('chai')
    .use(require('chai-as-promised'))
    .should()

contract('Liquidate', accounts => {
    
    const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';  
    const cDAI = '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'; 
    const DAI_DECIMALS = 18;
    const DAI_AMOUNT = new BN(10).pow(new BN(DAI_DECIMALS)).mul(new BN(70000))

    const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';  
    const cUNI = '0x35a18000230da775cac24873d00ff85bccded550'; 
    const UNI_DECIMALS = 18;
    const UNI_AMOUNT = new BN(10).pow(new BN(UNI_DECIMALS)).mul(new BN(4000))
    
    const COMPTROLLER = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
    const PRICE_FEED = '0x841616a5CBA946CF415Efe8a326A621A794D0f97';

    const UNI_WHALE = process.env.UNI_WHALE;
    const DAI_WHALE = process.env.DAI_WHALE;

    let token_supply, cToken_supply, token_borrow, cToken_borrow, compoundIntegration, liquidation, owner_contract_liquidated, owner_contract_liquidator, before, after
    
    function sendEther(web3, from, to, amount) {
        return web3.eth.sendTransaction({
          from,
          to,
          value: web3.utils.toWei(amount.toString(), "ether"),
        });
    }

    const snapshot = async (compoundIntegration, liquidation) => {
        const supplied = await compoundIntegration.balanceOfUnderlying.call(token_supply.address);
        const borrowed = await compoundIntegration.getBorrowedBalance.call(cToken_borrow.address);
        const collateral_factor = await compoundIntegration.getCollateralFactor(token_supply.address);
        const { liquidity, shortfall } = await compoundIntegration.getAccountLiquidity();
        const price = await compoundIntegration.getPriceFeed(cToken_borrow.address);
        const close_factor = await liquidation.getCloseFactor();
        const incentive = await liquidation.getLiquidationIncentive();  
        const amount_liquidated = await liquidation.getSupplyBalance.call(cToken_supply.address);

        return {

            collateral_factor: collateral_factor.div(new BN(10).pow(new BN(18 - 2))) / 100,
            supplied: supplied.div(new BN(10).pow(new BN(UNI_DECIMALS -2))) / 100,
            borrowed: borrowed.div(new BN(10).pow(new BN(DAI_DECIMALS - 2))) /100,
            price: price.div(new BN(10).pow(new BN(DAI_DECIMALS - 2))) / 100,
            liquidity: liquidity.div(new BN(10).pow(new BN(14))) / 10000,
            shortfall: shortfall.div(new BN(10).pow(new BN(14))) / 10000,
            close_factor: close_factor.div(new BN(10).pow(new BN(18 - 2))),
            incentive: incentive.div(new BN(10).pow(new BN(18 - 2))) / 100,
            amount_liquidated: amount_liquidated.div(new BN(10).pow(new BN(UNI_DECIMALS - 4))) / 10000

        }
    }

    beforeEach(async () => {
        owner_contract_liquidated = accounts[0];
        owner_contract_liquidator = accounts[1];
        token_supply = await IERC20.at(UNI)
        cToken_supply = await CErc20.at(cUNI);
        token_borrow = await IERC20.at(DAI);
        cToken_borrow = await CErc20.at(cDAI);
        compoundIntegration = await CompoundIntegration.new(COMPTROLLER, PRICE_FEED, { from: owner_contract_liquidated });
        liquidation = await Liquidation.new(COMPTROLLER, { from: owner_contract_liquidator });
    
        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [DAI_WHALE],
        });

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [UNI_WHALE],
        });

        const UNI_whale_balance = await token_supply.balanceOf(UNI_WHALE);
        const dai_whale_balance = await token_borrow.balanceOf(DAI_WHALE);

        assert(UNI_whale_balance.gte(UNI_AMOUNT), 'Whale UNI balance has to be higher than UNI_AMOUNT')
    })

    it('should liquidate correctly', async function() {

        this.timeout(60000)

        // first supply to Compound, UNI is going to be supplied
        await sendEther(web3, owner_contract_liquidated, UNI_WHALE, 1);
        await sendEther(web3, owner_contract_liquidated, DAI_WHALE, 1);
        await token_supply.transfer(owner_contract_liquidated, UNI_AMOUNT, { from: UNI_WHALE })

        console.log(`contract owner has ${await token_supply.balanceOf(owner_contract_liquidated)/1e18.toString()} UNI tokens`);

        await compoundIntegration.addTokenData(UNI, cUNI, { from: owner_contract_liquidated });
        // token and cToken are UNI and cUNI 
        await token_supply.approve(compoundIntegration.address, UNI_AMOUNT, { from: owner_contract_liquidated });

        console.log('Supplying UNI tokens...\n')

        await compoundIntegration.supply(token_supply.address, UNI_AMOUNT, { from: owner_contract_liquidated });
        console.log(`contract owner now has ${await token_supply.balanceOf(owner_contract_liquidated)/1e18.toString()} UNI tokens`)
        console.log(`contract now has ${await cToken_supply.balanceOf(compoundIntegration.address)/1e8.toString()} cUNI tokens\n`);

        before = await snapshot(compoundIntegration, liquidation)
        console.log('--- supplied ---');
        console.log(`collateral factor: ${before.collateral_factor}%`);
        console.log(`supplied: ${before.supplied} UNI tokens\n`);

        // after supply some tokens => enter market 

        await compoundIntegration.enterMarket(token_supply.address, { from: owner_contract_liquidated });
        after = await snapshot(compoundIntegration, liquidation);

        console.log('--- entered market ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`borrowed: $${after.borrowed}\n`);

        console.log('borrowing max amount of DAI...\n');

        // borrow

        await compoundIntegration.borrowMax(cToken_borrow.address, DAI_DECIMALS, { from: owner_contract_liquidated })
        after = await snapshot(compoundIntegration, liquidation);
        console.log('--- after borrow ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`shortfall: $${after.shortfall}`);
        console.log(`borrowed: ${after.borrowed}\n`);

        const block = await web3.eth.getBlockNumber();
        await time.advanceBlockTo(block + 10000);
        
        // tx sent just to update liquidity and shortfall otherwise they will remain the same 
        await compoundIntegration.getBorrowedBalance(cToken_borrow.address);

        after = await snapshot(compoundIntegration, liquidation);

        console.log('--- After 10,000 blocks ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`shortfall: $${after.shortfall}`);
        console.log(`borrowed: ${after.borrowed}\n`);

        // liquidate
        // first transfer some DAI to the owner of the contract
        await token_borrow.transfer(owner_contract_liquidator, DAI_AMOUNT, { from: DAI_WHALE })
        console.log(`owner of liquidator contract has ${await token_borrow.balanceOf(owner_contract_liquidator)/1e18.toString()} DAI tokens`)

        const close_factor = await liquidation.getCloseFactor();
        const repay_amount = (await compoundIntegration.getBorrowedBalance.call(cToken_borrow.address)).mul(close_factor).div(new BN(10).pow(new BN(18)))
        const liquidate_balance = await token_borrow.balanceOf(owner_contract_liquidator);
        assert(liquidate_balance.gte(repay_amount), 'liquidate balance has to be higher than repay amount');
        console.log(`repay amount is: ${repay_amount.toString()}`)

        const amount_to_be_liquidated = await liquidation.
            getAmountToBeLiquidated(cToken_borrow.address, cToken_supply.address, repay_amount);
        console.log(`amount to be liquidated cToken collateral -- cUNI -- is: ${amount_to_be_liquidated.div(new BN(10).pow(new BN(8 - 2))) /100 }\n`);

        await token_borrow.approve(liquidation.address, repay_amount, { from: owner_contract_liquidator });
        await liquidation.liquidate(compoundIntegration.address, 
                                    repay_amount, 
                                    cToken_supply.address, 
                                    token_borrow.address, 
                                    cToken_borrow.address,
                                    { from: owner_contract_liquidator });

        after = await snapshot(compoundIntegration, liquidation);
        console.log('--- liquidation details ---');
        console.log(`close factor: ${after.close_factor}%`);
        console.log(`liquidation incentive ${after.incentive}\n`);

        console.log('--- after liquidation ---');
        console.log(`supplied: ${after.supplied} UNI tokens \n`);
        console.log('liquidity and shortfall after liquidation...')
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`shortfall: $${after.shortfall}`);
        console.log('borrow  balance after liquidation should be 50% of what it was')
        console.log(`borrowed: ${after.borrowed}\n`);
        console.log(`amount earned by liquidation contract: ${after.amount_liquidated} UNI tokens`)

        console.log(`liquidation contract has ${await cToken_supply.balanceOf(liquidation.address)/1e8} cUNI tokens`)
    })  
})