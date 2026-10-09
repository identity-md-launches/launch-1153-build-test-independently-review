// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/// @title The reasoning oracle's attestation, as a contract reads it
/// @notice Copied verbatim from the IdentityMD protocol's `OracleAttestation.sol` (oracle-consumer skill,
/// 2026-10-07). The struct, type string and domain are the protocol's; do not edit.
library OracleAttestation {
    struct Attestation {
        bytes32 requestId;
        uint256 chainId;
        bytes32 questionHash;
        uint8 answerType;
        bytes answer;
        uint256 figure;
        uint64 fromBlock;
        uint64 toBlock;
        bytes32 blockHash;
        bytes32 panelJobId;
        uint16 panelSize;
        uint16 quorum;
        uint16 agreed;
        uint64 issuedAt;
        uint64 expiresAt;
    }

    uint8 internal constant ANSWER_BOOL = 0;
    uint8 internal constant ANSWER_ADDRESS = 1;
    uint8 internal constant ANSWER_BYTES32 = 2;
    uint8 internal constant ANSWER_UINT256 = 3;
    uint8 internal constant ANSWER_ADDRESS_LIST = 4;
    uint8 internal constant ANSWER_BYTES32_LIST = 5;

    string internal constant DOMAIN_NAME = "IdentityMD Oracle";
    string internal constant DOMAIN_VERSION = "2";

    bytes32 internal constant TYPEHASH = keccak256(
        "OracleAttestation(bytes32 requestId,uint256 chainId,bytes32 questionHash,uint8 answerType,bytes answer,uint256 figure,uint64 fromBlock,uint64 toBlock,bytes32 blockHash,bytes32 panelJobId,uint16 panelSize,uint16 quorum,uint16 agreed,uint64 issuedAt,uint64 expiresAt)"
    );

    function hashStruct(Attestation calldata a) internal pure returns (bytes32) {
        return keccak256(
            bytes.concat(
                abi.encode(
                    TYPEHASH,
                    a.requestId,
                    a.chainId,
                    a.questionHash,
                    a.answerType,
                    keccak256(a.answer),
                    a.figure,
                    a.fromBlock
                ),
                abi.encode(
                    a.toBlock, a.blockHash, a.panelJobId, a.panelSize, a.quorum, a.agreed, a.issuedAt, a.expiresAt
                )
            )
        );
    }
}

/// @title What a contract inherits to accept oracle attestations
abstract contract OracleAttestationConsumer is EIP712 {
    using OracleAttestation for OracleAttestation.Attestation;

    error AttestationExpired(uint64 expiresAt);
    error AttestationNotYetValid(uint64 issuedAt);
    error BadSignature();
    error AlreadyConsumed(bytes32 requestId);
    error WrongAnswerType(uint8 expected, uint8 got);
    error ZeroSigner();

    event OracleSignerSet(address indexed signer);

    uint64 public constant ISSUED_AT_TOLERANCE = 5 minutes;

    address public oracleSigner;

    mapping(bytes32 => bool) public consumed;

    constructor(address signer) EIP712(OracleAttestation.DOMAIN_NAME, OracleAttestation.DOMAIN_VERSION) {
        _setOracleSigner(signer);
    }

    function attestationDigest(OracleAttestation.Attestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(a.hashStruct());
    }

    function _verifyAttestation(OracleAttestation.Attestation calldata a, bytes calldata signature) internal view {
        // forge-lint: disable-next-line(block-timestamp)
        if (block.timestamp > a.expiresAt) revert AttestationExpired(a.expiresAt);
        // forge-lint: disable-next-line(block-timestamp)
        if (a.issuedAt > block.timestamp + ISSUED_AT_TOLERANCE) revert AttestationNotYetValid(a.issuedAt);
        if (!SignatureChecker.isValidSignatureNow(oracleSigner, attestationDigest(a), signature)) {
            revert BadSignature();
        }
    }

    function _consume(bytes32 requestId) internal {
        if (consumed[requestId]) revert AlreadyConsumed(requestId);
        consumed[requestId] = true;
    }

    function _setOracleSigner(address signer) internal {
        if (signer == address(0)) revert ZeroSigner();
        oracleSigner = signer;
        emit OracleSignerSet(signer);
    }

    function decodeBool(OracleAttestation.Attestation calldata a) internal pure returns (bool) {
        _expectType(a, OracleAttestation.ANSWER_BOOL);
        return abi.decode(a.answer, (bool));
    }

    function decodeUint256(OracleAttestation.Attestation calldata a) internal pure returns (uint256) {
        _expectType(a, OracleAttestation.ANSWER_UINT256);
        return abi.decode(a.answer, (uint256));
    }

    function _expectType(OracleAttestation.Attestation calldata a, uint8 expected) private pure {
        if (a.answerType != expected) revert WrongAnswerType(expected, a.answerType);
    }
}
