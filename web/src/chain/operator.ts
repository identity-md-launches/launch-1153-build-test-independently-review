import {
  isAddress,
  isHex,
  recoverMessageAddress,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { ADDRESSES, sameAddress } from "./config";
import type { Snapshot } from "./types";

export interface OperatorActivity {
  id: string;
  kind: "request" | "purchase" | "attestation" | "heartbeat";
  time: number;
  summary: string;
  transactionHash?: Hex;
}
export interface OperatorPayload {
  version: 1;
  chainId: 1;
  arena: Address;
  generatedAt: number;
  expiresAt: number;
  observedBlock: string;
  paidOperationsEnabled: boolean;
  budget: {
    requestsRemaining: number;
    gasEthRemainingWei: string;
    imdRemainingWei: string;
  };
  activity: OperatorActivity[];
}
export interface SignedOperatorStatus {
  payload: OperatorPayload;
  signature: Hex;
}
export interface OperatorProof {
  signed: SignedOperatorStatus;
  signer: Address;
  verifiedAt: number;
  ready: boolean;
  reasons: string[];
}
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
        )
      : value;
export function operatorStatusMessage(payload: OperatorPayload): string {
  return `PRISM RIOT operator status v1\n${JSON.stringify(canonical(payload))}`;
}
function parseStatus(input: unknown): SignedOperatorStatus {
  const status = input as SignedOperatorStatus,
    p = status?.payload;
  if (
    !p ||
    p.version !== 1 ||
    p.chainId !== 1 ||
    !isAddress(p.arena || "") ||
    !sameAddress(p.arena, ADDRESSES.arena) ||
    !Number.isSafeInteger(p.generatedAt) ||
    !Number.isSafeInteger(p.expiresAt) ||
    typeof p.observedBlock !== "string" ||
    !/^\d{1,20}$/.test(p.observedBlock) ||
    typeof p.paidOperationsEnabled !== "boolean" ||
    !isHex(status.signature) ||
    status.signature.length !== 132
  )
    throw new Error(
      "Operator status has an invalid chain, Arena, timestamp or signature format",
    );
  const b = p.budget;
  if (
    !b ||
    !Number.isSafeInteger(b.requestsRemaining) ||
    b.requestsRemaining < 0 ||
    typeof b.gasEthRemainingWei !== "string" ||
    !/^\d{1,78}$/.test(b.gasEthRemainingWei) ||
    typeof b.imdRemainingWei !== "string" ||
    !/^\d{1,78}$/.test(b.imdRemainingWei)
  )
    throw new Error("Invalid operator budget report");
  if (
    !Array.isArray(p.activity) ||
    p.activity.length > 30 ||
    p.activity.some(
      (a) =>
        !a ||
        typeof a.id !== "string" ||
        a.id.length > 100 ||
        !["request", "purchase", "attestation", "heartbeat"].includes(a.kind) ||
        !Number.isSafeInteger(a.time) ||
        a.time > p.generatedAt ||
        typeof a.summary !== "string" ||
        a.summary.length > 240 ||
        (a.transactionHash !== undefined &&
          (!isHex(a.transactionHash) || a.transactionHash.length !== 66)),
    )
  )
    throw new Error("Invalid operator activity report");
  return status;
}
/** Verify a short-lived public report with the CURRENT on-chain executor. Rechecked before entry. */
export async function verifyOperatorStatus(
  input: unknown,
  snapshot: Snapshot,
  now = Math.floor(Date.now() / 1000),
): Promise<OperatorProof> {
  const signed = parseStatus(input),
    p = signed.payload;
  if (
    p.generatedAt > now + 30 ||
    p.generatedAt < now - 300 ||
    p.expiresAt <= now ||
    p.expiresAt <= p.generatedAt ||
    p.expiresAt - p.generatedAt > 300
  )
    throw new Error(
      "Operator report is stale, future-dated, expired or valid for more than five minutes",
    );
  const observedBlock = BigInt(p.observedBlock);
  if (
    observedBlock > snapshot.blockNumber ||
    snapshot.blockNumber - observedBlock > 32n
  )
    throw new Error(
      "Operator report does not match a recent observed mainnet block",
    );
  if (
    snapshot.adapter.executor === zeroAddress ||
    !sameAddress(snapshot.adapter.executor, snapshot.treasury.executor)
  )
    throw new Error("Matching on-chain operator executors are not configured");
  const signer = await recoverMessageAddress({
    message: operatorStatusMessage(p),
    signature: signed.signature,
  });
  if (!sameAddress(signer, snapshot.adapter.executor))
    throw new Error(
      "Operator signature does not match the configured executor",
    );
  const reasons = snapshot.readinessReasons.filter(
    (r) => !r.startsWith("Separate server operator readiness"),
  );
  if (!snapshot.verified)
    reasons.push(
      "On-chain deployment verification failed",
      ...snapshot.verificationErrors,
    );
  if (!snapshot.corePaidReady && reasons.length === 0)
    reasons.push("On-chain readiness is incomplete");
  if (!p.paidOperationsEnabled)
    reasons.push("The server operator has disabled paid operations");
  if (
    p.budget.requestsRemaining < 1 ||
    BigInt(p.budget.gasEthRemainingWei) === 0n ||
    BigInt(p.budget.imdRemainingWei) < snapshot.adapter.price
  )
    reasons.push(
      "The server operator has insufficient remaining request / gas / IMD budget",
    );
  return {
    signed,
    signer,
    verifiedAt: now,
    ready: snapshot.verified && snapshot.corePaidReady && reasons.length === 0,
    reasons,
  };
}
export async function fetchOperatorStatus(
  endpoint: string,
  snapshot: Snapshot,
): Promise<OperatorProof> {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error(
      "Use a public HTTPS status URL without credentials or a fragment",
    );
  const response = await fetch(url, {
    method: "GET",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      `Operator status endpoint returned HTTP ${response.status}`,
    );
  const text = await response.text();
  if (text.length > 65536) throw new Error("Operator report is too large");
  return verifyOperatorStatus(JSON.parse(text), snapshot);
}
