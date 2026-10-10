import {
  encodeAbiParameters,
  parseAbi,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type WalletClient,
  type Hex,
  type Abi,
} from "viem";
import { ADDRESSES, publicClient } from "./config";
import { readSnapshot } from "./read";
import { approveExact, executeCall } from "./write";
import type { PoolKey, StatusListener } from "./types";

export const quoterAbi: Abi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);
export const routerAbi = parseAbi([
  "function execute(bytes commands,bytes[] inputs,uint256 deadline) payable",
]);
export const permit2Abi = parseAbi([
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function allowance(address owner,address token,address spender) view returns(uint160 amount,uint48 expiration,uint48 nonce)",
]);
const swapParameter = parseAbiParameters(
  "((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,bytes hookData)",
);
export interface SwapQuote {
  direction: "buy" | "sell";
  amountIn: bigint;
  amountOut: bigint;
  minimumOut: bigint;
  slippageBps: number;
  blockNumber: bigint;
  observedAt: number;
  expiresAt: number;
  poolKey: PoolKey;
  gasEstimate: bigint;
  lpFeePpm: number;
  protocolFeePpm: number;
  combinedPoolFeePpm: number;
  hookFeeEth: bigint;
  hookFeeIsEstimate: boolean;
}
export function minimumOutput(output: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 500)
    throw new Error("Slippage must be between 0.01% and 5%");
  const minimum = (output * BigInt(10000 - slippageBps)) / 10000n;
  if (minimum < 1n)
    throw new Error("Output is too small to protect with a nonzero minimum");
  return minimum;
}
export async function quoteSwap(
  direction: "buy" | "sell",
  amountIn: bigint,
  slippageBps: number,
): Promise<SwapQuote> {
  if (amountIn <= 0n || amountIn >= 1n << 128n)
    throw new Error("Enter a positive amount within the router limit");
  if (direction !== "buy" && direction !== "sell")
    throw new Error("Unsupported swap direction");
  minimumOutput(10000n, slippageBps);
  const s = await readSnapshot();
  if (!s.verified) throw new Error(s.verificationErrors.join("; "));
  const zeroForOne = direction === "buy";
  const result = await publicClient.simulateContract({
    address: ADDRESSES.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: s.hook.poolKey,
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
    blockNumber: s.blockNumber,
  });
  const [amountOut, gasEstimate] = result.result as [bigint, bigint];
  if (amountOut === 0n)
    throw new Error("No executable output is available from this pool");
  const protocolFeePpm = zeroForOne
    ? s.pool.protocolFee & 0xfff
    : s.pool.protocolFee >> 12;
  const lpFeePpm = s.pool.lpFee;
  const combinedPoolFeePpm =
    protocolFeePpm +
    lpFeePpm -
    Math.floor((protocolFeePpm * lpFeePpm) / 1_000_000);
  const observedAt = Date.now();
  return {
    direction,
    amountIn,
    amountOut,
    minimumOut: minimumOutput(amountOut, slippageBps),
    slippageBps,
    blockNumber: s.blockNumber,
    observedAt,
    expiresAt: observedAt + 60000,
    poolKey: s.hook.poolKey,
    gasEstimate,
    lpFeePpm,
    protocolFeePpm,
    combinedPoolFeePpm,
    hookFeeEth: zeroForOne
      ? (amountIn * 50n + 10049n) / 10050n
      : (amountOut * 50n + 9949n) / 9950n,
    hookFeeIsEstimate: true,
  };
}

/** Codec for the deployed 0x66a9… Universal Router (its verified IV4Router has five fields).
 * V4_SWAP: SWAP_EXACT_IN_SINGLE → SETTLE_ALL → TAKE_ALL. SWEEP returns any unused native ETH.
 * No allow-revert flags, no unlimited amounts, no additional frontend fee. */
export function encodeSwap(
  quote: SwapQuote,
  account: Address,
  deadline: bigint,
): { commands: Hex; inputs: Hex[]; deadline: bigint; value: bigint } {
  const buy = quote.direction === "buy";
  const inputCurrency = buy ? zeroAddress : ADDRESSES.token;
  const outputCurrency = buy ? ADDRESSES.token : zeroAddress;
  const params = [
    encodeAbiParameters(swapParameter, [
      {
        poolKey: quote.poolKey,
        zeroForOne: buy,
        amountIn: quote.amountIn,
        amountOutMinimum: quote.minimumOut,
        hookData: "0x",
      },
    ]),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [inputCurrency, quote.amountIn],
    ),
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [outputCurrency, quote.minimumOut],
    ),
  ];
  const v4 = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    ["0x060c0f", params],
  );
  const sweep = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [zeroAddress, account, 0n],
  );
  return {
    commands: "0x1004",
    inputs: [v4, sweep],
    deadline,
    value: buy ? quote.amountIn : 0n,
  };
}
/** A sell uses two bounded allowances: ERC20→Permit2, then Permit2→Router for at most 20 minutes. */
export async function prepareSwapApproval(
  wallet: WalletClient,
  account: Address,
  amountIn: bigint,
  onStatus?: StatusListener,
) {
  if (amountIn <= 0n || amountIn >= 1n << 128n)
    throw new Error("Invalid approval amount");
  await approveExact(wallet, account, ADDRESSES.permit2, amountIn, onStatus);
  const [amount, expiration] = await publicClient.readContract({
    address: ADDRESSES.permit2,
    abi: permit2Abi,
    functionName: "allowance",
    args: [account, ADDRESSES.token, ADDRESSES.router],
  });
  const now = Number((await publicClient.getBlock()).timestamp);
  if (amount === amountIn && expiration > now + 60 && expiration <= now + 1200)
    return;
  await executeCall(
    wallet,
    account,
    {
      address: ADDRESSES.permit2,
      abi: permit2Abi,
      functionName: "approve",
      args: [ADDRESSES.token, ADDRESSES.router, amountIn, now + 1200],
    },
    "Permit2: approve exact PRIO for 20 minutes",
    onStatus,
  );
}
export async function executeSwap(
  wallet: WalletClient,
  account: Address,
  quote: SwapQuote,
  onStatus?: StatusListener,
) {
  if (Date.now() > quote.expiresAt)
    throw new Error(
      "Quote expired. Simulate a fresh quote and review the new minimum output.",
    );
  const s = await readSnapshot(account);
  if (!s.verified) throw new Error(s.verificationErrors.join("; "));
  if (quote.direction === "sell") {
    const [amount, expiration] = await publicClient.readContract({
      address: ADDRESSES.permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [account, ADDRESSES.token, ADDRESSES.router],
    });
    if (amount < quote.amountIn || expiration <= s.timestamp + 60)
      throw new Error(
        "Approve the exact sell amount first, then obtain a fresh quote.",
      );
  }
  if (Date.now() > quote.expiresAt)
    throw new Error("Quote expired during verification. Refresh the quote.");
  // The owner-reviewed minimum remains unchanged: a worse fresh state must fail simulation.
  const encoded = encodeSwap(quote, account, BigInt(s.timestamp + 120));
  return executeCall(
    wallet,
    account,
    {
      address: ADDRESSES.router,
      abi: routerAbi,
      functionName: "execute",
      args: [encoded.commands, encoded.inputs, encoded.deadline],
      value: encoded.value,
    },
    "ETH / PRIO swap",
    onStatus,
  );
}
