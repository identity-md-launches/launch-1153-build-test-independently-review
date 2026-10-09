// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {OracleAttestation} from "../src/OracleAttestation.sol";
import {OracleAdapter, IIntake} from "../src/OracleAdapter.sol";
import {PrismRiotToken} from "../src/PrismRiotToken.sol";
import {MockIntake} from "./utils/MockIntake.sol";

/// @dev The protocol's conformance vector (oracle-consumer skill) plus the adapter's own rules.
contract OracleAdapterTest is Test {
    uint256 constant VECTOR_CHAIN = 11155111;
    address constant VECTOR_CONSUMER = 0x0000000000000000000000000000000000002748;
    bytes32 constant VECTOR_DIGEST = 0x95fefa8b7c529852f4e2b6aec888930eb2bf5078e6443a85808e36df19e1325c;
    address constant SIGNER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    uint256 constant SIGNER_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint64 constant ISSUED_AT = 1800000000;
    uint64 constant EXPIRES_AT = 1800003600;
    string constant CALLBACK =
        "onOracleResult(bytes32,(bytes32,uint256,bytes32,uint8,bytes,uint256,uint64,uint64,bytes32,bytes32,uint16,uint16,uint16,uint64,uint64),bytes)";
    bytes32 constant QUESTION = keccak256("which vault holds the prism?");

    address owner = makeAddr("owner");
    address executor = makeAddr("executor");
    OracleAdapter adapter;
    MockIntake intake;
    PrismRiotToken imd;

    function setUp() public {
        vm.chainId(VECTOR_CHAIN);
        vm.warp(ISSUED_AT);
        intake = new MockIntake();
        imd = new PrismRiotToken();
        bytes memory creation = abi.encodePacked(type(OracleAdapter).creationCode, abi.encode(owner, SIGNER));
        vm.etch(VECTOR_CONSUMER, creation);
        (bool ok, bytes memory runtime) = VECTOR_CONSUMER.call("");
        require(ok, "adapter constructor reverted");
        vm.etch(VECTOR_CONSUMER, runtime);
        adapter = OracleAdapter(VECTOR_CONSUMER);
        vm.startPrank(owner);
        adapter.setIntake(IIntake(address(intake)));
        adapter.pinQuestion(1, QUESTION, 1, 5, 4, ISSUED_AT - 1 hours, bytes('{"v":1}'));
        vm.stopPrank();
    }

    function vector() internal pure returns (OracleAttestation.Attestation memory a) {
        bytes32[] memory ids = new bytes32[](1);
        ids[0] = bytes32(uint256(1));
        a = OracleAttestation.Attestation({
            requestId: 0x0000000000004000800000000000000100000000000000000000000000000000,
            chainId: 1,
            questionHash: 0x2117f4362ebfa37aa8a8c0fed548604fe09ac46faf8ae7559cd64780f26a46fb,
            answerType: OracleAttestation.ANSWER_BYTES32_LIST,
            answer: abi.encode(ids),
            figure: 12345,
            fromBlock: 100,
            toBlock: 200,
            blockHash: bytes32(uint256(7)),
            panelJobId: 0x0000000000004000800000000000000200000000000000000000000000000000,
            panelSize: 5,
            quorum: 4,
            agreed: 5,
            issuedAt: ISSUED_AT,
            expiresAt: EXPIRES_AT
        });
    }

    function roundAnswer(uint256 answer) internal pure returns (OracleAttestation.Attestation memory a) {
        a = vector();
        a.requestId = keccak256(abi.encode("round", answer));
        a.questionHash = QUESTION;
        a.answerType = OracleAttestation.ANSWER_UINT256;
        a.answer = abi.encode(answer);
    }

    function sign(OracleAttestation.Attestation memory a) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, adapter.attestationDigest(a));
        return abi.encodePacked(r, s, v);
    }

    // ------------------------------------------------------------------ conformance

    function test_digestMatchesTheProtocol() public view {
        assertEq(adapter.attestationDigest(vector()), VECTOR_DIGEST, "struct, type string or domain differs");
    }

    function test_callbackSelectorIsCanonical() public view {
        assertEq(adapter.onOracleResult.selector, bytes4(keccak256(bytes(CALLBACK))));
    }

    // ------------------------------------------------------------------ manual relay

    function test_manualRelayStoresResultAndEvidence() public {
        OracleAttestation.Attestation memory a = roundAnswer(7);
        adapter.submitAttestation(1, a, sign(a));
        OracleAdapter.Result memory r = adapter.resultOf(1);
        assertTrue(r.settled);
        assertEq(r.answer, 7);
        assertEq(r.panelJobId, a.panelJobId);
        assertEq(r.requestId, a.requestId);
        assertEq(r.toBlock, 200);
        assertTrue(adapter.consumed(a.requestId));
    }

    function test_relayRejectsReplayAndSecondResult() public {
        OracleAttestation.Attestation memory a = roundAnswer(7);
        bytes memory sig = sign(a);
        adapter.submitAttestation(1, a, sig);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.AlreadySettled.selector, 1));
        adapter.submitAttestation(1, a, sig);
        vm.prank(owner);
        adapter.pinQuestion(2, QUESTION, 1, 5, 4, ISSUED_AT - 1 hours, "");
        vm.expectRevert(abi.encodeWithSelector(OracleAttestationConsumerErrors.AlreadyConsumed.selector, a.requestId));
        adapter.submitAttestation(2, a, sig);
    }

    function test_relayRejectsWrongQuestionChainQuorumPanelSignerExpiryAndType() public {
        OracleAttestation.Attestation memory a = roundAnswer(1);
        bytes memory sig;
        a.questionHash = keccak256("other");
        sig = sign(a);
        vm.expectRevert(OracleAdapter.QuestionMismatch.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        a.chainId = 2;
        sig = sign(a);
        vm.expectRevert(OracleAdapter.ChainMismatch.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        a.agreed = 3;
        sig = sign(a);
        vm.expectRevert(OracleAdapter.NotAgreed.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        a.quorum = 3;
        a.agreed = 3;
        sig = sign(a);
        vm.expectRevert(OracleAdapter.QuorumTooSmall.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        a.panelSize = 4;
        sig = sign(a);
        vm.expectRevert(OracleAdapter.PanelTooSmall.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        sig = sign(a);
        a.figure = 1; // tampered after signing
        vm.expectRevert(OracleAttestationConsumerErrors.BadSignature.selector);
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        sig = sign(a);
        vm.warp(EXPIRES_AT + 1);
        vm.expectRevert(abi.encodeWithSelector(OracleAttestationConsumerErrors.AttestationExpired.selector, EXPIRES_AT));
        adapter.submitAttestation(1, a, sig);
        vm.warp(ISSUED_AT);

        a = roundAnswer(1);
        a.answerType = OracleAttestation.ANSWER_BOOL;
        a.answer = abi.encode(true);
        sig = sign(a);
        vm.expectRevert(abi.encodeWithSelector(OracleAttestationConsumerErrors.WrongAnswerType.selector, 3, 0));
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        a.issuedAt = ISSUED_AT - 2 hours; // before the commit boundary minus tolerance
        sig = sign(a);
        vm.expectRevert(
            abi.encodeWithSelector(OracleAdapter.IssuedTooEarly.selector, ISSUED_AT - 2 hours, ISSUED_AT - 1 hours)
        );
        adapter.submitAttestation(1, a, sig);

        a = roundAnswer(1);
        sig = sign(a);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.QuestionNotPinned.selector, 9));
        adapter.submitAttestation(9, a, sig);
    }

    // ------------------------------------------------------------------ paid requests

    function configurePaid() internal {
        vm.startPrank(owner);
        adapter.setAction(bytes32("oracle.request@oracle-1"));
        adapter.setPayment(address(imd), 0.5 ether);
        adapter.setCallbackConfigured(true);
        adapter.setExecutor(executor);
        adapter.setBudget(1 ether);
        vm.stopPrank();
        imd.transfer(address(adapter), 5 ether);
    }

    function test_paidRequestDisabledUntilConfigured() public {
        assertFalse(adapter.paidRequestsEnabled());
        vm.prank(owner);
        adapter.setExecutor(executor);
        vm.prank(executor);
        vm.expectRevert(abi.encodeWithSelector(OracleAdapter.NotConfigured.selector, "paid requests"));
        adapter.request(1);
    }

    function test_paidRequestThenCallbackUnder200kGas() public {
        configurePaid();
        vm.prank(executor);
        bytes32 id = adapter.request(1);
        assertEq(imd.balanceOf(address(intake)), 0.5 ether);
        assertEq(adapter.pendingRound(id), 1);
        OracleAttestation.Attestation memory a = roundAnswer(3);
        bool ok = intake.deliver(abi.encode(id, a, sign(a)));
        assertTrue(ok, "callback must fit the stipend");
        assertEq(adapter.resultOf(1).answer, 3);
        assertEq(adapter.pendingSince(id), 0);
    }

    function test_callbackRefusesWrongSenderAndUnknownId() public {
        configurePaid();
        vm.prank(executor);
        bytes32 id = adapter.request(1);
        OracleAttestation.Attestation memory a = roundAnswer(3);
        bytes memory sig = sign(a);
        vm.expectRevert(OracleAdapter.NotTheIntake.selector);
        adapter.onOracleResult(id, a, sig);
        vm.prank(address(intake));
        vm.expectRevert(OracleAdapter.UnknownRequest.selector);
        adapter.onOracleResult(keccak256("nope"), a, sig);
    }

    function test_budgetAndExecutorEnforced() public {
        configurePaid();
        vm.prank(address(this));
        vm.expectRevert(OracleAdapter.NotExecutor.selector);
        adapter.request(1);
        vm.startPrank(executor);
        adapter.request(1);
        adapter.request(1);
        vm.expectRevert(OracleAdapter.BudgetExceeded.selector);
        adapter.request(1);
        skip(1 days);
        adapter.request(1);
        vm.stopPrank();
    }

    function test_clearStaleAfterTimeout() public {
        configurePaid();
        vm.prank(executor);
        bytes32 id = adapter.request(1);
        vm.expectRevert(OracleAdapter.RequestNotStale.selector);
        adapter.clearStale(id);
        skip(2 days);
        adapter.clearStale(id);
        assertEq(adapter.pendingSince(id), 0);
    }
}

/// @dev The base contract's errors, for `expectRevert` selectors.
interface OracleAttestationConsumerErrors {
    error AlreadyConsumed(bytes32 requestId);
    error AttestationExpired(uint64 expiresAt);
    error BadSignature();
    error WrongAnswerType(uint8 expected, uint8 got);
}
