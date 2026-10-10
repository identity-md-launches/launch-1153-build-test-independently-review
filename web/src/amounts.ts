import { formatUnits, parseUnits } from "viem";
export function parseAmount(text: string, decimals = 18): bigint | undefined {
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(text)) return;
  try { const n = parseUnits(text, decimals); return n > 0n && n < 1n << 128n ? n : undefined; } catch { return; }
}
export function percentAmount(balance: bigint, percent: number, reserve = 0n): bigint {
  if (![25, 50, 75, 100].includes(percent)) throw new Error("Choose 25%, 50%, 75% or MAX.");
  const available = balance > reserve ? balance - reserve : 0n;
  return available * BigInt(percent) / 100n;
}
export const editableAmount = (value: bigint, decimals = 18) => formatUnits(value, decimals);
