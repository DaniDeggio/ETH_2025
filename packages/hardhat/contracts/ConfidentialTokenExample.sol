// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialFungibleToken} from "@openzeppelin/confidential-contracts/token/ConfidentialFungibleToken.sol";

/// @notice Minimal wrapper around ConfidentialFungibleToken used for testing fixtures.
contract ConfidentialTokenExample is SepoliaConfig, ConfidentialFungibleToken, Ownable2Step {
    mapping(address operator => bool allowed) private trustedOperators;

    event TrustedOperatorUpdated(address indexed operator, bool indexed allowed);

    constructor(
        uint64 initialSupply,
        string memory name_,
        string memory symbol_,
        string memory tokenURI_,
        address initialRecipient
    ) ConfidentialFungibleToken(name_, symbol_, tokenURI_) Ownable(msg.sender) {
        if (initialSupply > 0) {
            euint64 minted = _mint(msg.sender, FHE.asEuint64(initialSupply));
            FHE.allowThis(minted);
            FHE.allow(minted, msg.sender);

            uint64 halfAmount = initialSupply / 2;
            if (initialRecipient != address(0) && halfAmount > 0) {
                euint64 half = FHE.asEuint64(halfAmount);
                euint64 sent = _transfer(msg.sender, initialRecipient, half);
                FHE.allowThis(sent);
                FHE.allow(sent, initialRecipient);
                FHE.allow(sent, msg.sender);
            }
        }
    }

    function isOperator(address holder, address spender) public view override returns (bool) {
        return trustedOperators[spender] || super.isOperator(holder, spender);
    }

    function setTrustedOperator(address operator, bool allowed) external onlyOwner {
        trustedOperators[operator] = allowed;
        emit TrustedOperatorUpdated(operator, allowed);
    }

    function mint(address to, externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        onlyOwner
        returns (euint64 minted)
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        minted = _mint(to, amount);
        FHE.allowThis(minted);
        FHE.allow(minted, to);
    }
}
