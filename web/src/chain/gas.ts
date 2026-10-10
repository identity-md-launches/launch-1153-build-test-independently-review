import { type Abi, type Address } from "viem";
import { publicClient } from "./config";
export interface ContractCall { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint; }
export interface GasBudget { gas: bigint; gasLimit: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; reserve: bigint; observedAt: number; }
export const gasFresh = (budget?: GasBudget) => !!budget && Date.now() - budget.observedAt < 60_000;
export async function estimateGasBudget(account: Address, call: ContractCall): Promise<GasBudget> {
  const [gas, fees] = await Promise.all([
    publicClient.estimateContractGas({ ...call, account }),
    publicClient.estimateFeesPerGas(),
  ]);
  if (!fees.maxFeePerGas || fees.maxPriorityFeePerGas === undefined) throw new Error("A fresh Ethereum gas price is unavailable. Refresh gas estimates before continuing.");
  const gasLimit = (gas * 125n + 99n) / 100n;
  const maxFeePerGas = (fees.maxFeePerGas * 120n + 99n) / 100n;
  return { gas, gasLimit, maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, reserve: gasLimit * maxFeePerGas, observedAt: Date.now() };
}
export async function requireGas(account: Address, call: ContractCall) {
  const [budget, balance] = await Promise.all([estimateGasBudget(account, call), publicClient.getBalance({ address: account })]);
  if (balance < (call.value || 0n) + budget.reserve) throw new Error("Insufficient ETH for this amount plus the buffered gas reserve. Reduce the amount or add ETH, then refresh.");
  return budget;
}
