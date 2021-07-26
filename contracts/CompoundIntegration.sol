// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../interfaces/ICompound.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/math/SafeMath.sol';

contract CompoundIntegration {

    using SafeMath for uint;

    address owner;
    Comptroller public comptroller;
    PriceFeed public priceFeed;

    constructor(address _comptroller, address _priceFeed) {
        owner=  msg.sender;
        comptroller = Comptroller(_comptroller);
        priceFeed = PriceFeed(_priceFeed);
    }

    struct tokenData {
        address token;
        address cToken;
        bool registered;
    }

    mapping (address => tokenData) tokensRegistered;

    modifier onlyOwner {
        require(msg.sender == owner, 'only the owner of this contract can call this function');
        _;
    }

    modifier tokenIsRegistered(address _token) {
        require(tokensRegistered[_token].registered == true,
            'token address is not registered');
        _;
    }

    function supply(address _token, uint _amount) tokenIsRegistered(_token) external {
        IERC20 token = IERC20(_token);
        CErc20 cToken = CErc20(tokensRegistered[_token].cToken);
        token.transferFrom(msg.sender, address(this), _amount);
        token.approve(address(cToken), _amount);

        // mint has to return 0, if not it has failed
        require(cToken.mint(_amount) == 0, 'mint failed');
    }

    function cTokenBalance(address _token) tokenIsRegistered(_token) external view onlyOwner() returns(uint) {
        address cToken = tokensRegistered[_token].cToken;

        return CErc20(cToken).balanceOf(address(this));
    }

    // to use this function you need to make an static call - not view function - 
    function getInfo(address _token) tokenIsRegistered(_token) external returns(uint exchangeRate, uint supplyRate) {
        address cToken = tokensRegistered[_token].cToken;

        // Aount of current exchnage rate from cToken to underlying
        exchangeRate = CErc20(cToken).exchangeRateCurrent();
        // Amount addred to your supply balance this block
        supplyRate = CErc20(cToken).supplyRatePerBlock();
    }

    function addTokenData(address _token, address _cToken) external onlyOwner() {
        (bool isListed, uint collateral_factor, bool isComped) = comptroller.markets(_cToken);
        require(isListed, 'cToken is not listed');
        tokensRegistered[_token] = tokenData(_token, _cToken, true);
    }

    function balanceOfUnderlying(address _token) tokenIsRegistered(_token) onlyOwner() external returns(uint) {
        return CErc20(tokensRegistered[_token].cToken).balanceOfUnderlying(address(this));
    }

    function redeemUnderlying(address _token, uint _cTokenAmount) tokenIsRegistered(_token) onlyOwner() external  {
        require(CErc20(tokensRegistered[_token].cToken).redeem(_cTokenAmount) == 0, 'redeem failed');
    }

    function getCollateralFactor(address _token) tokenIsRegistered(_token) external view returns(uint) {
        address cToken = tokensRegistered[_token].cToken;
        (bool isListed, uint collateral_factor, bool isComped) = comptroller.markets(cToken);
        return collateral_factor;
    }

    function getAccountLiquidity() onlyOwner() external view returns(uint liquidity, uint shortfall) {
        (uint _error, uint _liquidity, uint _shortfall) = comptroller.getAccountLiquidity(address(this));
        require(_error == 0, 'there is an error getting account liquidity');
        // liquidity is in USD => amount that we can borrow
        // if shortfall > 0, then is subject to liquidation
        return(_liquidity, _shortfall);
    }

    function getPriceFeed(address _cToken) external view returns(uint) {
        (bool isListed, uint collateral_factor, bool isComped) = comptroller.markets(_cToken);
        require(isListed, 'cToken is not listed');
        // this returns the price opf the token to borrow in USD
        return priceFeed.getUnderlyingPrice(_cToken);
    }

    // _token => token provided, internally this will get the corresponding cToken to use as collateral and calculate liqudity and shortfall
    // decimals of token to borrow
    function borrow(address _token, address _cTokenToBorrow, uint _decimals) tokenIsRegistered(_token) onlyOwner() external {
        address cToken = tokensRegistered[_token].cToken;
        address[] memory cTokens = new address[](1);
        cTokens[0] = cToken;
        uint[] memory errors = comptroller.enterMarkets(cTokens);
        require(errors[0] == 0, 'comptroller.enterMarkets failed');
        // check account liquidity
        (uint _error, uint _liquidity, uint _shortfall) = comptroller.getAccountLiquidity(address(this));
        require(_error == 0, 'there is an error getting account liquidity, function borrow');
        require(_liquidity > 0, 'no liquidity available to borrow');
        require(_shortfall == 0, 'account underwater, shorfall has to be greater than 0');

        // calculate max borrow
        // get price of cToken that we want to borrow
        uint price = priceFeed.getUnderlyingPrice(_cTokenToBorrow);
        uint max_borrow = (_liquidity.mul(10 ** _decimals)).div(price);

        // get 50% of max_borrow
        uint amount_to_borrow = (max_borrow.mul(50)).div(100);
        // actual borrow happens here, it has to return 0 otherwise there is an error
        require(CErc20(_cTokenToBorrow).borrow(amount_to_borrow) == 0, 'borrow failed');
    }

    // to use this function you need to make an static call - not view function - 
    function getBorrowedBalance(address _cTokenBorrowed) public returns(uint) {
        return CErc20(_cTokenBorrowed).borrowBalanceCurrent(address(this));
    }

    function getBorrowRatePerBlock(address _cTokenBorrowed) external view returns(uint) {
        // return value is scaled up by 1e18
        return CErc20(_cTokenBorrowed).borrowRatePerBlock();
    }

    function repay(address _tokenBorrowed, address _cTokenBorrowed, uint _amount) external {
        // first approve cTokenBorrowed to spend _amount of _tokenBorrowed
        IERC20(_tokenBorrowed).approve(_cTokenBorrowed, _amount);
        // repay happens here
        require(CErc20(_cTokenBorrowed).repayBorrow(_amount) == 0, 'repay failed');
    }

}