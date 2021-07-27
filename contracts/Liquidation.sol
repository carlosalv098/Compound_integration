// SPDX-Licencse-Identifier: MIT

pragma solidity ^0.8.0;

import '../interfaces/ICompound.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract Liquidation {

    address public owner;
    Comptroller public comptroller;

    constructor(address _comptroller) {
        owner = msg.sender;
        comptroller = Comptroller(_comptroller);
    }

    modifier onlyOwner {
        require(msg.sender == owner, 'only the owner of this contract can call this function');
        _;
    }

    function getCloseFactor() external view returns(uint) {
        return comptroller.closeFactorMantissa();
    }

    function getLiquidationIncentive() external view returns(uint) {
        return comptroller.liquidationIncentiveMantissa();
    }

    function getAmountToBeLiquidated(
        address _cToken_borrowed, 
        address _cToken_collateral, 
        uint _repay_amount
    ) external view returns(uint) {
        (uint error, uint cToken_collateral_amount) = comptroller.liquidateCalculateSeizeTokens(
            _cToken_borrowed, _cToken_collateral, _repay_amount);
        require(error == 0, 'error calculating amount to be liquidated');
        return cToken_collateral_amount;
    }

    //  if supplied DAI _cToken_collateral => cDAI
    function getSupplyBalance(address _cToken_collateral) external returns(uint) {
        return CErc20(_cToken_collateral).balanceOfUnderlying(address(this));
    }

    function liquidate(
        address _borrower,              // account is going to be liquidated
        uint _repay_amount,             // how much
        address _cToken_collateral,     // cToken received as reward
        address _token_borrowed,        // token we are going to repay
        address _cToken_borrowed        // cToken of the token we are going to repay
    ) external {
        IERC20(_token_borrowed).transferFrom(msg.sender, address(this), _repay_amount);
        IERC20(_token_borrowed).approve(_cToken_borrowed, _repay_amount);

        require(CErc20(_cToken_borrowed).liquidateBorrow(_borrower, _repay_amount, _cToken_collateral) == 0,
        'liquidate failed'
        );
    }

    function redeem_CErc20(address _cToken) onlyOwner() external {
        uint amount_redeem = CErc20(_cToken).balanceOf(address(this));
        require(CErc20(_cToken).redeem(amount_redeem) == 0, 'redeem failed');
    }

    function transfer_token(address _token, address _recipient, uint _amount) onlyOwner() external {
        IERC20(_token).transfer(_recipient, _amount);
    }
}