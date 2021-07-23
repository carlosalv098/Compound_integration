// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '../interfaces/ICompound.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract CompoundIntegration {

    address owner;

    constructor() {
        owner=  msg.sender;
    }

    struct tokenData {
        address token;
        address cToken;
        uint decimals;
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

    function cTokenBalance(address _cToken) external view onlyOwner() returns(uint) {
        return CErc20(_cToken).balanceOf(address(this));
    }

    // to use this function you need to make an static call to avoid paying tx fees
    function getInfo(address _cToken) external returns(uint exchangeRate, uint supplyRate) {
        // Aount of current exchnage rate from cToken to underlying
        exchangeRate = CErc20(_cToken).exchangeRateCurrent();
        // Amount addred to your supply balance this block
        supplyRate = CErc20(_cToken).supplyRatePerBlock();
    }

    function addTokenData(address _token, address _cToken, uint _decimals) external onlyOwner() {
        tokensRegistered[_token] = tokenData(_token, _cToken, _decimals, true);
    }

    function balanceOfUnderlying(address _token) external tokenIsRegistered(_token) onlyOwner() returns(uint) {
        return CErc20(tokensRegistered[_token].cToken).balanceOfUnderlying(address(this));
    }

    function redeemUnderlying(address _token, uint _cTokenAmount) external tokenIsRegistered(_token) onlyOwner() {
        require(CErc20(tokensRegistered[_token].cToken).redeem(_cTokenAmount) == 0, 'redeem failed');
    }

}