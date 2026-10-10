import {
  bytesToHex,
  encodeAbiParameters,
  isAddress,
  isHex,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { ADDRESSES, sameAddress } from "./config";

export interface RevealSecret {
  version: 1;
  chainId: 1;
  arena: Address;
  account: Address;
  roundId: string;
  choice: number;
  salt: Hex;
  commitment: Hex;
  createdAt: string;
}
const PREFIX = `prism-riot:reveal:1:${ADDRESSES.arena}:`;
const keyOf = (account: Address, roundId: bigint) =>
  `${PREFIX}${account.toLowerCase()}:${roundId}`;
export function commitmentOf(
  roundId: bigint,
  account: Address,
  choice: number,
  salt: Hex,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "address" },
        { type: "uint8" },
        { type: "bytes32" },
      ],
      [roundId, account, choice, salt],
    ),
  );
}
export function validateSecret(input: unknown): RevealSecret {
  const s = input as RevealSecret;
  if (
    !s ||
    s.version !== 1 ||
    s.chainId !== 1 ||
    !isAddress(s.arena || "") ||
    !sameAddress(s.arena, ADDRESSES.arena) ||
    !isAddress(s.account || "") ||
    !/^\d+$/.test(s.roundId || "") ||
    BigInt(s.roundId) < 1n ||
    !Number.isInteger(s.choice) ||
    s.choice < 1 ||
    s.choice > 255 ||
    !isHex(s.salt) ||
    s.salt.length !== 66 ||
    !isHex(s.commitment) ||
    s.commitment.length !== 66
  )
    throw new Error(
      "Invalid PRISM RIOT reveal backup. No secrets were imported.",
    );
  if (
    commitmentOf(BigInt(s.roundId), s.account, s.choice, s.salt) !==
    s.commitment
  )
    throw new Error("The backup commitment does not match its reveal secret.");
  return s;
}
export function loadRevealSecret(
  account: Address,
  roundId: bigint,
): RevealSecret | undefined {
  const text = localStorage.getItem(keyOf(account, roundId));
  if (!text) return undefined;
  const secret = validateSecret(JSON.parse(text));
  if (
    !sameAddress(secret.account, account) ||
    BigInt(secret.roundId) !== roundId
  )
    throw new Error(
      "Stored reveal secret does not match this wallet and round. Restore a matching backup before continuing.",
    );
  return secret;
}
export function requireSavedCommitment(
  account: Address,
  roundId: bigint,
  commitment: Hex,
): RevealSecret {
  const secret = loadRevealSecret(account, roundId);
  if (!secret || secret.commitment !== commitment)
    throw new Error(
      "No matching local reveal backup exists for this wallet, Arena and round. Save and export the correct secret before entering.",
    );
  return secret;
}
/** Store BEFORE an approval or entry. Failure to persist is fatal; losing a salt can cost 22 PRIO. */
export function createRevealSecret(
  account: Address,
  roundId: bigint,
  choice: number,
): RevealSecret {
  if (roundId < 1n || !Number.isInteger(choice) || choice < 1 || choice > 255)
    throw new Error("Invalid round or choice");
  const existing = loadRevealSecret(account, roundId);
  if (existing) {
    if (existing.choice !== choice)
      throw new Error(
        "A saved choice already exists for this round. Restore and use that choice; an existing reveal secret is never overwritten.",
      );
    return existing;
  }
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const secret: RevealSecret = {
    version: 1,
    chainId: 1,
    arena: ADDRESSES.arena,
    account,
    roundId: roundId.toString(),
    choice,
    salt,
    commitment: commitmentOf(roundId, account, choice, salt),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(keyOf(account, roundId), JSON.stringify(secret));
  if (loadRevealSecret(account, roundId)?.commitment !== secret.commitment)
    throw new Error(
      "Local reveal backup could not be verified. Entry has not been sent.",
    );
  return secret;
}
export function listSecrets(account?: Address): RevealSecret[] {
  const values: RevealSecret[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      const s = validateSecret(JSON.parse(localStorage.getItem(key)!));
      if (!account || sameAddress(s.account, account)) values.push(s);
    }
  }
  return values.sort((a, b) =>
    BigInt(a.roundId) < BigInt(b.roundId) ? -1 : 1,
  );
}
export function exportSecrets(account?: Address): string {
  return JSON.stringify(
    {
      format: "prism-riot-reveal-backup",
      version: 1,
      warning:
        "Private reveal secrets. Keep offline and never share before the reveal window.",
      secrets: listSecrets(account),
    },
    null,
    2,
  );
}
/** Explicit local import only. Validate the entire file before mutating browser storage. */
export function importSecrets(text: string, account?: Address): number {
  if (text.length > 1024 * 1024) throw new Error("Backup exceeds 1 MiB");
  const bundle = JSON.parse(text);
  if (
    bundle.format !== "prism-riot-reveal-backup" ||
    bundle.version !== 1 ||
    !Array.isArray(bundle.secrets) ||
    bundle.secrets.length > 1000
  )
    throw new Error("Unrecognized reveal backup format");
  const secrets = bundle.secrets.map(validateSecret) as RevealSecret[];
  const seen = new Map<string, Hex>();
  for (const s of secrets) {
    if (account && !sameAddress(account, s.account))
      throw new Error(
        "This backup contains a different wallet. Connect its wallet before importing.",
      );
    const key = keyOf(s.account, BigInt(s.roundId));
    const existing = loadRevealSecret(s.account, BigInt(s.roundId));
    if (
      (existing && existing.commitment !== s.commitment) ||
      (seen.has(key) && seen.get(key) !== s.commitment)
    )
      throw new Error(
        "Conflicting reveal secret. Existing backups were preserved.",
      );
    seen.set(key, s.commitment);
  }
  for (const s of secrets)
    localStorage.setItem(
      keyOf(s.account, BigInt(s.roundId)),
      JSON.stringify(s),
    );
  return secrets.length;
}
