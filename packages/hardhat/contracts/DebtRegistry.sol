// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ConfidentialFungibleToken} from "@openzeppelin/confidential-contracts/token/ConfidentialFungibleToken.sol";

contract DebtRegistry is SepoliaConfig {
    struct Debt {
        address debtor;
        address creditor;
        euint64 amountEnc;
        uint64 dueDate;
        bool closed;
    }

    /// @notice Raised when a decryption callback does not match an existing request
    error UnknownDecryptionRequest(uint256 requestId);
    error InvalidTokenAddress();
    error InvalidCreditor();
    error DebtAlreadyExists();
    error UnknownDebt();
    error NotDebtor();
    error DebtAlreadyClosed();

    ConfidentialFungibleToken public confidentialFungibleToken;

    mapping(bytes32 id => Debt debtEntry) private debts;
    mapping(uint256 requestId => bytes32 debtId) private closeRequests;
    mapping(uint256 requestId => bool exists) private closeRequestExists;

    event DebtCreated(bytes32 indexed id, address indexed debtor, address indexed creditor, uint64 dueDate);
    event DebtPayment(bytes32 indexed id);
    event DebtClosed(bytes32 indexed id);

    /// @notice Raised when the payment token has not authorized this registry as operator
    error PaymentOperatorMissing();

    /// @notice Raised when the payment token transfer fails
    error PaymentTransferFailed(bytes lowLevelData);

    constructor(address confidentialTokenAddress) {
        if (confidentialTokenAddress == address(0)) revert InvalidTokenAddress();
        confidentialFungibleToken = ConfidentialFungibleToken(confidentialTokenAddress);
    }

    /// @notice Create a new encrypted debt position
    function createDebt(
        bytes32 id,
        address creditor,
        externalEuint64 encAmount,
        bytes calldata inputProof,
        uint64 dueDate
    ) external {
        if (creditor == address(0)) revert InvalidCreditor();
        if (debts[id].debtor != address(0)) revert DebtAlreadyExists();

        euint64 amount = FHE.fromExternal(encAmount, inputProof);
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);
        FHE.allow(amount, creditor);

        Debt storage debtEntry = debts[id];
        debtEntry.debtor = msg.sender;
        debtEntry.creditor = creditor;
        debtEntry.amountEnc = amount;
        debtEntry.dueDate = dueDate;

        FHE.allowThis(debtEntry.amountEnc);
        FHE.allow(debtEntry.amountEnc, debtEntry.debtor);
        FHE.allow(debtEntry.amountEnc, debtEntry.creditor);

        emit DebtCreated(id, msg.sender, creditor, dueDate);
    }

    /// @notice Register a confidential repayment towards a debt
    function pay(bytes32 id, externalEuint64 encPayment, bytes calldata inputProof) external {
        Debt storage debtEntry = debts[id];
        if (debtEntry.debtor == address(0)) revert UnknownDebt();
        if (msg.sender != debtEntry.debtor) revert NotDebtor();
        if (debtEntry.closed) revert DebtAlreadyClosed();

        if (!confidentialFungibleToken.isOperator(msg.sender, address(this))) revert PaymentOperatorMissing();

        euint64 paymentAmount = FHE.fromExternal(encPayment, inputProof);
        FHE.allowThis(paymentAmount);
        FHE.allow(paymentAmount, msg.sender);
        FHE.allowTransient(paymentAmount, address(confidentialFungibleToken));

        euint64 transferred;
        try confidentialFungibleToken.confidentialTransferFrom(msg.sender, debtEntry.creditor, paymentAmount) returns (
            euint64 moved
        ) {
            transferred = moved;
        } catch (bytes memory lowLevelData) {
            revert PaymentTransferFailed(lowLevelData);
        }

        FHE.allowThis(transferred);
        euint64 zero = FHE.asEuint64(0);

        euint64 rawRemaining = FHE.sub(debtEntry.amountEnc, transferred);
        ebool overPayment = FHE.lt(debtEntry.amountEnc, transferred);
        euint64 remaining = FHE.select(overPayment, zero, rawRemaining);

        debtEntry.amountEnc = remaining;

        FHE.allowThis(debtEntry.amountEnc);
        FHE.allow(debtEntry.amountEnc, debtEntry.debtor);
        FHE.allow(debtEntry.amountEnc, debtEntry.creditor);

        // Ask the gateway to reveal whether the debt is fully repaid without disclosing the amount.
        ebool isZero = FHE.eq(debtEntry.amountEnc, zero);
        euint64 one = FHE.asEuint64(1);
        euint64 closingFlag = FHE.select(isZero, one, zero);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(closingFlag);

        uint256 requestId = FHE.requestDecryption(cts, this.resolveDebtClosure.selector);
        closeRequests[requestId] = id;
        closeRequestExists[requestId] = true;

        emit DebtPayment(id);
    }

    /// @notice Decryption callback invoked by the Gateway when the remaining debt hits zero
    function resolveDebtClosure(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public {
        if (!closeRequestExists[requestId]) revert UnknownDecryptionRequest(requestId);

        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Decode the boolean flag returned by the gateway (1 == closed).
        uint256 shouldCloseRaw = abi.decode(cleartexts, (uint256));
        bool shouldClose = shouldCloseRaw != 0;
        bytes32 debtId = closeRequests[requestId];

        delete closeRequestExists[requestId];
        delete closeRequests[requestId];

        if (!shouldClose) return;

        Debt storage debtEntry = debts[debtId];
        if (!debtEntry.closed) {
            debtEntry.closed = true;
            emit DebtClosed(debtId);
        }
    }

    /// @notice Return static, non-confidential debt information
    function getDebt(bytes32 id)
        external
        view
        returns (address debtor, address creditor, uint64 dueDate, bool closed)
    {
        Debt storage debtEntry = debts[id];
        return (debtEntry.debtor, debtEntry.creditor, debtEntry.dueDate, debtEntry.closed);
    }

    /// @notice Return the encrypted outstanding amount for a debt
    function getEncryptedDebtAmount(bytes32 id) external view returns (euint64) {
        return debts[id].amountEnc;
    }
}
