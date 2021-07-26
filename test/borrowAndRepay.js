const BN = require('bn.js');
const { assert } = require('chai');
const { web3, contract } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');

const IERC20 = artifacts.require('IERC20');
const CErc20 = artifacts.require('CErc20');
const CompoundIntegration = artifacts.require('CompoundIntegration')

require('dotenv').config();
require('chai')
    .use(require('chai-as-promised'))
    .should()

contract('CompoundIntegration', accounts => {

    const UNI = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';  
    const cUNI = '0x35a18000230da775cac24873d00ff85bccded550'; 
    const DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F';  
    const cDAI = '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643'; 

    const COMPTROLLER = '0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b';
    const PRICE_FEED = '0x841616a5CBA946CF415Efe8a326A621A794D0f97';

    const UNI_DECIMALS = 18;
    const DAI_DECIMALS = 18;

    const UNI_WHALE = process.env.UNI_WHALE;
    const DAI_WHALE = process.env.DAI_WHALE;

    const UNI_AMOUNT = new BN(10).pow(new BN(UNI_DECIMALS)).mul(new BN(4000));
    //  DAI to pay interests
    const DAI_AMOUNT_INTERESTS = new BN(10).pow(new BN(UNI_DECIMALS)).mul(new BN(1));


    let token, cToken, token_borrow, cToken_borrow, compoundIntegration, owner, notOwner, before, after, time_borrow

    function sendEther(web3, from, to, amount) {
        return web3.eth.sendTransaction({
          from,
          to,
          value: web3.utils.toWei(amount.toString(), "ether"),
        });
    }

    function pow(x, y) {
        x = cast(x);
        y = cast(y);
        return x.pow(y);
    }

    function cast(x) {
        if (x instanceof BN) {
          return x;
        }
        return new BN(x);
    }

    beforeEach(async () => {
        owner = accounts[0];
        notOwner = accounts[1];
        token = await IERC20.at(UNI);
        cToken = await CErc20.at(cUNI);
        token_borrow = await IERC20.at(DAI);
        cToken_borrow = await CErc20.at(cDAI);
        compoundIntegration = await CompoundIntegration.new(COMPTROLLER, PRICE_FEED);

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [UNI_WHALE],
        });

        await network.provider.request({
            method: "hardhat_impersonateAccount",
            params: [DAI_WHALE],
        });

        console.log(`contract address is: ${compoundIntegration.address}`);

        const whale_balance = await token.balanceOf(UNI_WHALE);
        assert(whale_balance.gte(UNI_AMOUNT), 'Whale UNI balance has to be higher than UNI_AMOUNT')

    })

    const snapshot = async (compoundIntegration, token, cToken_borrow) => {
        const { liquidity } = await compoundIntegration.getAccountLiquidity();
        const collateral_factor = await compoundIntegration.getCollateralFactor(token.address);
        const supplied = await compoundIntegration.balanceOfUnderlying.call(token.address);
        const price = await compoundIntegration.getPriceFeed(cToken_borrow.address);
        const max_borrow = liquidity.div(price);
        const borrowed_balance = await compoundIntegration.getBorrowedBalance.call(cToken_borrow.address);
        const token_borrow_balance = await token_borrow.balanceOf(compoundIntegration.address);

        const borrow_rate = await compoundIntegration.getBorrowRatePerBlock(cToken_borrow.address);


        return {
            collateral_factor: collateral_factor.div(pow(10, 18 -2)) / 100,
            //supplied: supplied.div(pow(10, UNI_DECIMALS - 2)) / 100,
            supplied: supplied.div(new BN(10).pow(new BN(UNI_DECIMALS - 2))) / 100,

            price: price.div(new BN(10).pow(new BN(DAI_DECIMALS - 2))) / 100,
            liquidity: liquidity.div(new BN(10).pow(new BN(18))),
            max_borrow,
            borrowed_balance: borrowed_balance.div(new BN(10).pow(new BN(DAI_DECIMALS - 2))) / 100,
            token_borrow_balance: token_borrow_balance.div(new BN(10).pow(new BN(DAI_DECIMALS - 2))) / 100,

            borrow_rate

        }
    }

    it('should supply, borrow and repay', async function() {
        this.timeout(60000);

        await sendEther(web3, owner, UNI_WHALE, 1);
        await token.transfer(owner, UNI_AMOUNT, { from: UNI_WHALE });

        console.log(`contract owner has ${await token.balanceOf(owner)/1e18.toString()} UNI tokens`);

        await compoundIntegration.addTokenData(UNI, cUNI, { from: owner}).should.be.fulfilled

        await token.approve(compoundIntegration.address, UNI_AMOUNT, { from: owner });

        console.log('Supplying UNI tokens...\n')
        
        await compoundIntegration.supply(token.address, UNI_AMOUNT, { from: owner });
        console.log(`contract owner now has ${await token.balanceOf(owner)/1e18.toString()} UNI tokens`)
        console.log(`contract now has ${await cToken.balanceOf(compoundIntegration.address)/1e8.toString()} cUNI tokens`);

        before = await snapshot(compoundIntegration, token, cToken_borrow);
        
        console.log('--- before borrow ---');
        console.log(`collateral factor: ${before.collateral_factor}%`);
        console.log(`supplied: ${before.supplied}`);
        console.log(`liquidity: $${before.liquidity}`);
        console.log(`price token to borrow: $${before.price}`);
        console.log(`max borrow: ${before.max_borrow}`);
        console.log(`borrowed balance COMPOUND: ${before.borrowed_balance}`);
        console.log(`borrowed balance ERC20: ${before.token_borrow_balance}`);
        console.log(`borrow rate: ${before.borrow_rate}\n`);

        console.log(`DAI balance in this contract ${await token_borrow.balanceOf(compoundIntegration.address)/1e18.toString()}`)
        console.log('borrowing some DAI...\n')

        // borrow

        await compoundIntegration.borrow(token.address, cToken_borrow.address, DAI_DECIMALS);
        //time_borrow = await time.latest();

        after = await snapshot(compoundIntegration, token, cToken_borrow);

        console.log('--- after borrow ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`max borrow: ${after.max_borrow}`);
        console.log(`borrowed balance COMPOUND: ${after.borrowed_balance}`);
        console.log(`borrowed balance ERC20: ${after.token_borrow_balance}\n`);
        console.log(`now DAI balance in this contract is: ${await token_borrow.balanceOf(compoundIntegration.address)/1e18.toString()}\n`)
        
        // await time.increaseTo(time_borrow.add(time.duration.days(10)));

        const block = await web3.eth.getBlockNumber();
        await time.advanceBlockTo(block + 1000)
        
        after = await snapshot(compoundIntegration, token, cToken_borrow);

        console.log('--- After 1000 blocks ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`max borrow: ${after.max_borrow}`);
        console.log('--- COMPOUND borrow balance should increase due interests ---')
        console.log(`borrowed balance COMPOUND: ${after.borrowed_balance}`);
        console.log(`borrowed balance ERC20: ${after.token_borrow_balance}\n`);

        // repay
        // first send some DAI to be able to pay the interests
        const AMOUNT_TO_PAY = await compoundIntegration.getBorrowedBalance.call(cToken_borrow.address);
        const ACTUAL_TOKEN_BALANCE = await token_borrow.balanceOf(compoundIntegration.address);
        const TOKEN_AMOUNT_TRANSFER = AMOUNT_TO_PAY.sub(ACTUAL_TOKEN_BALANCE);
        console.log(`sending ${TOKEN_AMOUNT_TRANSFER/1e18.toString()} DAI from DAI WHALE to repay debt...\n`);

        await token_borrow.transfer(compoundIntegration.address, TOKEN_AMOUNT_TRANSFER, { from: DAI_WHALE })
        console.log(`DAI balance in this contract ${await token_borrow.balanceOf(compoundIntegration.address)/1e18.toString()}`)
        console.log(`DAI debt in this contract is ${AMOUNT_TO_PAY.toString()/1e18.toString()}\n`);

        await compoundIntegration.repay(token_borrow.address, cToken_borrow.address, AMOUNT_TO_PAY);

        after = await snapshot(compoundIntegration, token, cToken_borrow);

        console.log('--- After repay is done ---');
        console.log(`liquidity: $${after.liquidity}`);
        console.log(`max borrow: ${after.max_borrow}`);
        console.log(`borrowed balance COMPOUND: ${after.borrowed_balance}`);
        console.log(`borrowed balance ERC20: ${after.token_borrow_balance}\n`);
        console.log(`contract has ${await cToken.balanceOf(compoundIntegration.address)/1e8.toString()} cUNI tokens`);

    })
})