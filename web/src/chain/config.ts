import {
  createPublicClient,
  fallback,
  http,
  type Abi,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import token from "./abi/PrismRiotToken.json";
import hook from "./abi/TreasuryFeeHook.json";
import treasury from "./abi/FeeTreasury.json";
import vault from "./abi/StakingVault.json";
import arena from "./abi/Arena.json";
import adapter from "./abi/OracleAdapter.json";

// Addresses are from the task's verified deployment record and pinned network.json.
export const ADDRESSES = {
  token: "0xfd1c234972768c23bb21d655966e0b122dd67a2c",
  hook: "0x65a783cc6725a02ce349dc4d72577994df1760cc",
  treasury: "0xb68b1ba47734ba91f3fc37164bb39d408908ff7c",
  vault: "0x10373c4afc7851b8ab5d94dce7ec1688624cec33",
  arena: "0xe31277d4e9fbf9fc35239dc7d2280e97d5c817c1",
  adapter: "0x002021b4aeb4125ff25e0353b004f6fdec5f93ed",
  owner: "0x13afb9b5780cd9ae79c61503adb69c57845d8eac",
  poolManager: "0x000000000004444c5dc75cb358380d2e3de08a90",
  router: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
  stateView: "0x7ffe42c4a5deea5b0fec41c94c136cf115597227",
  permit2: "0x000000000022d473030f116ddee9f6b43ac78ba3",
  imd: "0xd34a99bc0f67ae1bbd63c660e6d0b0dd03e263b7",
} as const satisfies Record<string, Address>;
export const ABIS = { token, hook, treasury, vault, arena, adapter } as Record<
  "token" | "hook" | "treasury" | "vault" | "arena" | "adapter",
  Abi
>;
export type ContractName = keyof typeof ABIS;
export const TOKEN_DEPLOYMENT_TX =
  "0x545df1adb27c4a2ad6de57dd3d4d28005306f1471c0002381d5518fbc1c6dd7d" as const;
export const APP_DEPLOYMENT_TX =
  "0x6f4d5e54bf0e9faa57a2163f7b484678233a0e0fd4498c198366e453c0151f4a" as const;
export const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback([
    http("https://ethereum-rpc.publicnode.com", {
      timeout: 15000,
      retryCount: 1,
    }),
    http("https://eth.drpc.org", { timeout: 15000, retryCount: 1 }),
  ]),
  batch: { multicall: true },
});
export const sameAddress = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();
