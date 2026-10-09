// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OracleAttestation, OracleAttestationConsumer} from "./OracleAttestation.sol";
import {TwoStepOwned} from "./TwoStepOwned.sol";

/// @notice The IdentityMD Intake, as this contract calls it (oracle-consumer skill).
interface IIntake {
    struct Callback {
        address target;
        bytes4 selector;
    }

    function priceOf(bytes32 action, address asset) external view returns (uint256);
    function request(bytes32 action, bytes calldata body, Callback calldata callback, address asset, uint256 amount)
        external
        payable
        returns (bytes32 requestId);
}

/// @title OracleAdapter: verified IMD panel attestations as Arena round results
/// @notice For each Arena round the owner pins one question (its canonical hash, the chain it is about, the
/// request body, the minimum panel and quorum, and the round's commit deadline). A result settles the round
/// only if a current, correctly signed EIP-712 attestation in this contract's domain carries exactly that
/// question hash, was issued no earlier than the commit deadline minus `ISSUED_AT_TOLERANCE`, is not
/// expired, has `agreed >= quorum`, meets the pinned panel/quorum minimums, has not been consumed before,
/// and carries a `uint256` answer. The result and its evidence reference (request id, panel job id, block
/// window and hash) are stored; the Arena reads them.
///
/// Two ways in: the Intake's own callback after a paid `oracle.request` made by `request()`, and
/// `submitAttestation()`, a permissionless manual relay for the same signed attestation (keys stay with the
/// oracle; relaying one is harmless because the signature is the proof). Paid requests are disabled until
/// the owner has configured the intake, action, asset, price and callback, pinned the round's question, set
/// an executor, set a budget, and the contract holds IMD bought by the treasury from earned fees.
contract OracleAdapter is OracleAttestationConsumer, TwoStepOwned {
    using SafeERC20 for IERC20;

    struct Pinned {
        bytes32 questionHash;
        uint256 chainId;
        uint16 minPanel;
        uint16 minQuorum;
        uint64 notBefore; // the round's commit deadline
        bytes body;
    }

    /// @dev Packed into five slots so the Intake's 200 000 gas callback can store it.
    struct Result {
        uint256 answer;
        bytes32 requestId;
        bytes32 panelJobId;
        bytes32 blockHash;
        uint64 fromBlock;
        uint64 toBlock;
        uint64 issuedAt;
        uint16 agreed;
        bool settled;
    }

    uint256 public constant BUDGET_WINDOW = 1 days;
    /// @notice After this long a pending intake request may be cleared (status 1/2 never call back).
    uint256 public constant REQUEST_TIMEOUT = 2 days;

    IIntake public intake;
    bytes32 public action;
    address public asset;
    uint256 public price;
    bool public callbackConfigured;
    address public executor;
    uint256 public budgetPerWindow;
    uint256 public windowStart;
    uint256 public spentInWindow;

    mapping(uint256 roundId => Pinned) internal _pinned;
    mapping(uint256 roundId => Result) internal _results;
    mapping(bytes32 intakeId => uint256 roundId) public pendingRound;
    mapping(bytes32 intakeId => uint256) public pendingSince;

    event IntakeSet(address indexed intake);
    event ActionSet(bytes32 indexed action);
    event PaymentSet(address indexed asset, uint256 price);
    event CallbackConfigured(bool configured);
    event ExecutorSet(address indexed executor);
    event BudgetSet(uint256 budgetPerWindow);
    event QuestionPinned(uint256 indexed roundId, bytes32 questionHash, uint256 chainId, uint64 notBefore);
    event Requested(uint256 indexed roundId, bytes32 indexed intakeId, uint256 paid);
    event RequestCleared(bytes32 indexed intakeId);
    event ResultStored(uint256 indexed roundId, uint256 answer, bytes32 requestId, bytes32 panelJobId);

    error NotConfigured(string what);
    error NotExecutor();
    error NotTheIntake();
    error UnknownRequest();
    error QuestionNotPinned(uint256 roundId);
    error QuestionMismatch();
    error ChainMismatch();
    error PanelTooSmall();
    error QuorumTooSmall();
    error NotAgreed();
    error IssuedTooEarly(uint64 issuedAt, uint64 notBefore);
    error AlreadySettled(uint256 roundId);
    error BudgetExceeded();
    error RequestNotStale();
    error ZeroAddress();
    error AlreadyPinned(uint256 roundId);

    constructor(address owner_, address signer_) OracleAttestationConsumer(signer_) TwoStepOwned(owner_) {}

    // ------------------------------------------------------------------ configuration (owner)

    function setIntake(IIntake to) external onlyOwner {
        if (address(to) == address(0)) revert ZeroAddress();
        intake = to;
        emit IntakeSet(address(to));
    }

    function setAction(bytes32 to) external onlyOwner {
        action = to;
        emit ActionSet(to);
    }

    /// @notice Asset and price move together; the asset is the chain's IMD.
    function setPayment(address asset_, uint256 price_) external onlyOwner {
        if (asset_ == address(0)) revert ZeroAddress();
        asset = asset_;
        price = price_;
        emit PaymentSet(asset_, price_);
    }

    /// @notice The explicit "callback is configured" switch: paid requests refuse until it is on.
    function setCallbackConfigured(bool on) external onlyOwner {
        callbackConfigured = on;
        emit CallbackConfigured(on);
    }

    function setExecutor(address to) external onlyOwner {
        executor = to;
        emit ExecutorSet(to);
    }

    /// @notice IMD the executor may spend per `BUDGET_WINDOW`.
    function setBudget(uint256 perWindow) external onlyOwner {
        budgetPerWindow = perWindow;
        emit BudgetSet(perWindow);
    }

    function setSigner(address to) external onlyOwner {
        _setOracleSigner(to);
    }

    /// @notice Pins a round's question before it opens. Immutable once pinned.
    function pinQuestion(
        uint256 roundId,
        bytes32 questionHash,
        uint256 chainId,
        uint16 minPanel,
        uint16 minQuorum,
        uint64 notBefore,
        bytes calldata body
    ) external onlyOwner {
        if (_pinned[roundId].questionHash != bytes32(0)) revert AlreadyPinned(roundId);
        if (questionHash == bytes32(0) || minQuorum < 2 || minPanel < minQuorum) revert NotConfigured("question");
        _pinned[roundId] = Pinned(questionHash, chainId, minPanel, minQuorum, notBefore, body);
        emit QuestionPinned(roundId, questionHash, chainId, notBefore);
    }

    // ------------------------------------------------------------------ views

    function pinned(uint256 roundId) external view returns (Pinned memory) {
        return _pinned[roundId];
    }

    function resultOf(uint256 roundId) external view returns (Result memory) {
        return _results[roundId];
    }

    function paidRequestsEnabled() public view returns (bool) {
        return address(intake) != address(0) && action != bytes32(0) && asset != address(0) && price != 0
            && callbackConfigured && executor != address(0) && budgetPerWindow != 0;
    }

    // ------------------------------------------------------------------ paid request (executor)

    /// @notice Buys one panel answer for `roundId` from IMD this contract holds, within the budget.
    function request(uint256 roundId) external returns (bytes32 intakeId) {
        if (msg.sender != executor) revert NotExecutor();
        if (!paidRequestsEnabled()) revert NotConfigured("paid requests");
        Pinned storage p = _pinned[roundId];
        if (p.questionHash == bytes32(0)) revert QuestionNotPinned(roundId);
        if (_results[roundId].settled) revert AlreadySettled(roundId);
        if (block.timestamp >= windowStart + BUDGET_WINDOW) {
            windowStart = block.timestamp;
            spentInWindow = 0;
        }
        if (spentInWindow + price > budgetPerWindow) revert BudgetExceeded();
        spentInWindow += price;
        IERC20(asset).forceApprove(address(intake), price);
        intakeId =
            intake.request(action, p.body, IIntake.Callback(address(this), this.onOracleResult.selector), asset, price);
        pendingRound[intakeId] = roundId;
        pendingSince[intakeId] = block.timestamp;
        emit Requested(roundId, intakeId, price);
    }

    /// @notice Clears a request the plane never answered (refused body, no agreement). The price is spent.
    function clearStale(bytes32 intakeId) external {
        if (pendingSince[intakeId] == 0 || block.timestamp < pendingSince[intakeId] + REQUEST_TIMEOUT) {
            revert RequestNotStale();
        }
        delete pendingRound[intakeId];
        delete pendingSince[intakeId];
        emit RequestCleared(intakeId);
    }

    // ------------------------------------------------------------------ results

    /// @notice The Intake's callback for `oracle.request`. Stays well under the 200 000 gas stipend.
    function onOracleResult(bytes32 intakeId, OracleAttestation.Attestation calldata a, bytes calldata signature)
        external
    {
        if (msg.sender != address(intake)) revert NotTheIntake();
        if (pendingSince[intakeId] == 0) revert UnknownRequest();
        uint256 roundId = pendingRound[intakeId];
        delete pendingRound[intakeId];
        delete pendingSince[intakeId];
        _accept(roundId, a, signature);
    }

    /// @notice Manual relay: anyone may submit the oracle's signed attestation for a round.
    function submitAttestation(uint256 roundId, OracleAttestation.Attestation calldata a, bytes calldata signature)
        external
    {
        _accept(roundId, a, signature);
    }

    function _accept(uint256 roundId, OracleAttestation.Attestation calldata a, bytes calldata signature) internal {
        Pinned storage p = _pinned[roundId];
        if (p.questionHash == bytes32(0)) revert QuestionNotPinned(roundId);
        if (_results[roundId].settled) revert AlreadySettled(roundId);
        _verifyAttestation(a, signature);
        if (a.questionHash != p.questionHash) revert QuestionMismatch();
        if (a.chainId != p.chainId) revert ChainMismatch();
        if (a.panelSize < p.minPanel) revert PanelTooSmall();
        if (a.quorum < p.minQuorum) revert QuorumTooSmall();
        if (a.agreed < a.quorum) revert NotAgreed();
        if (a.issuedAt + ISSUED_AT_TOLERANCE < p.notBefore) revert IssuedTooEarly(a.issuedAt, p.notBefore);
        uint256 answer = decodeUint256(a);
        _consume(a.requestId);
        _results[roundId] = Result({
            answer: answer,
            requestId: a.requestId,
            panelJobId: a.panelJobId,
            blockHash: a.blockHash,
            fromBlock: a.fromBlock,
            toBlock: a.toBlock,
            issuedAt: a.issuedAt,
            agreed: a.agreed,
            settled: true
        });
        emit ResultStored(roundId, answer, a.requestId, a.panelJobId);
    }

    /// @notice Returns IMD (or any token) the owner wants back, e.g. after a decommission.
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
