const BN = require('bn.js');
const { assert } = require('chai');
const { web3 } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');

const IERC20 = artifacts.require('IERC20');
const CErc20 = artifacts.require('CErc20');
const CompoundIntegration = artifacts.require('CompoundIntegration')

require('dotenv').config();
require('chai')
    .use(require('chai-as-promised'))
    .should()

contract('CompundIntegration', accounts => {

    const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';  
    const cDAI = '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'; 
    const DAI_WHALE = process.env.DAI_WHALE

    const DEPOSIT_AMOUNT_COMPOUND = new BN(10).pow(new BN(18)).mul(new BN(1000000));

    let token, cToken, compoundIntegration, owner, notOwner, before, after, block, time_initial_supply

    function sendEther(web3, from, to, amount) {
        return web3.eth.sendTransaction({
          from,
          to,
          value: web3.utils.toWei(amount.toString(), "ether"),
        });
    }

    beforeEach(async () => {
        owner = accounts[0];
        notOwner = accounts[1];
        token = await IERC20.at(DAI);
        cToken = await CErc20.at(cDAI);
        compoundIntegration = await CompoundIntegration.new();

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [DAI_WHALE],
        });

        console.log(`contract address is: ${compoundIntegration.address}`);

    })

    const snapshot = async (compoundIntegration, token, cToken) => {
        const { exchangeRate, supplyRate } = await compoundIntegration.getInfo.call(DAI)
        return {
            exchangeRate,
            supplyRate,
            balanceOfUnderlying: await compoundIntegration.balanceOfUnderlying.call(DAI),
            tokenBalance: await token.balanceOf(compoundIntegration.address),
            cTokenBalance: await cToken.balanceOf(compoundIntegration.address)
        }
    }

    it('should allow only owner to add token and ctoken addresses', async () => {
        await compoundIntegration.addTokenData(DAI, cDAI, { from: notOwner}).should.be.rejected
        await compoundIntegration.addTokenData(DAI, cDAI, { from: owner}).should.be.fulfilled
    })

    it('should supply and redeem', async () => {

        await sendEther(web3, owner, DAI_WHALE, 1);
        await compoundIntegration.addTokenData(DAI, cDAI, { from: owner})
   
        const whale_balance = await token.balanceOf(DAI_WHALE);
        assert(whale_balance.gte(DEPOSIT_AMOUNT_COMPOUND), 'Whale DAI balance has to be higher than DEPOSIT_FUND_AMOUNT');
        console.log(`whales DAI balance is: ${whale_balance/1e18.toString()} \n`);
        await token.transfer(owner, DEPOSIT_AMOUNT_COMPOUND, { from: DAI_WHALE });
        console.log(`sending ${DEPOSIT_AMOUNT_COMPOUND/1e18.toString()} DAI to the owner...`);
        console.log(`contract owner DAI balance: ${await token.balanceOf(owner)/1e18.toString()} \n`)

        before = await snapshot(compoundIntegration, token, cToken);

        console.log(`exchange rate ${before.exchangeRate}`)
        console.log(`supply rate ${before.supplyRate} \n`)
        
        console.log('--- before supply ---');
        console.log(`balance of underlying ${before.balanceOfUnderlying/1e18.toString()}`);
        console.log(`token balance ${before.tokenBalance/1e18.toString()}`);
        console.log(`cToken balance ${before.cTokenBalance/1e8.toString()} \n`)     // cTokens have 8 decimals

        console.log(`owner supplying ${DEPOSIT_AMOUNT_COMPOUND/1e18.toString()} DAI to the contract \n`)

        await token.approve(compoundIntegration.address, DEPOSIT_AMOUNT_COMPOUND, { from: owner });
        await compoundIntegration.supply(token.address, DEPOSIT_AMOUNT_COMPOUND, { from: owner });

        time_initial_supply = await time.latest();

        after = await snapshot(compoundIntegration, token, cToken);

        console.log('--- after supply ---');
        console.log(`balance of underlying ${after.balanceOfUnderlying/1e18.toString()}`);
        console.log(`token balance ${after.tokenBalance/1e18.toString()}`);
        console.log(`cToken balance ${after.cTokenBalance/1e8.toString()} \n`);   // cTokens have 8 decimals

        await time.increaseTo(time_initial_supply.add(time.duration.days(1)));

        after = await snapshot(compoundIntegration, token, cToken);

        console.log('--- After 1 day ---');
        console.log(`balance of underlying ${after.balanceOfUnderlying/1e18.toString()} \n`);

        console.log('redeeming cTtokens...');
        const cTokenAmount = await compoundIntegration.cTokenBalance(DAI)
        await compoundIntegration.redeemUnderlying(DAI, cTokenAmount, { from: notOwner }).should.be.rejected;
        await compoundIntegration.redeemUnderlying(DAI, cTokenAmount, { from: owner });

        after = await snapshot(compoundIntegration, token, cToken);
        console.log(`balance of underlying ${after.balanceOfUnderlying/1e18.toString()}`);
        console.log(`token balance ${after.tokenBalance/1e18.toString()}`);
        console.log(`cToken balance ${after.cTokenBalance/1e8.toString()} \n`);   // cTokens have 8 decimals

    })

})