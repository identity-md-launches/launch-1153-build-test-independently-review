import { useCallback, useEffect, useState } from "react";
import {
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
  type WalletClient,
} from "viem";
import { mainnet } from "viem/chains";
type Provider = EIP1193Provider & {
  on?: (event: string, fn: (value: any) => void) => void;
  removeListener?: (event: string, fn: (value: any) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function useWallet() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [wallet, setWallet] = useState<WalletClient>();
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const connect = useCallback(async () => {
    setError("");
    setConnecting(true);
    try {
      const p = window.ethereum;
      if (!p)
        throw new Error(
          "No wallet found. Open this site in an Ethereum wallet browser, or install an Ethereum browser wallet, then try again.",
        );
      const accounts = await p.request({ method: "eth_requestAccounts" });
      if (!accounts[0])
        throw new Error(
          "No account selected. Unlock your wallet and try again.",
        );
      setAccount(accounts[0]);
      setChainId(Number(await p.request({ method: "eth_chainId" })));
      setWallet(createWalletClient({ chain: mainnet, transport: custom(p) }));
    } catch (e) {
      setError(message(e));
    } finally {
      setConnecting(false);
    }
  }, []);
  const switchNetwork = async () => {
    try {
      await window.ethereum?.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x1" }],
      });
      setChainId(1);
      setError("");
    } catch (e) {
      setError(message(e));
    }
  };
  useEffect(() => {
    const p = window.ethereum;
    if (!p) return;
    const accounts = (a: Address[]) => {
      setAccount(a[0]);
      setError("");
    };
    const chain = (id: string) => setChainId(Number(id));
    p.on?.("accountsChanged", accounts);
    p.on?.("chainChanged", chain);
    return () => {
      p.removeListener?.("accountsChanged", accounts);
      p.removeListener?.("chainChanged", chain);
    };
  }, []);
  return {
    account,
    chainId,
    wallet,
    error,
    setError,
    connecting,
    connect,
    switchNetwork,
    disconnect: () => {
      setAccount(undefined);
      setWallet(undefined);
    },
  };
}
export function message(e: unknown) {
  const x = e as { shortMessage?: string; message?: string };
  const raw =
    x.shortMessage ||
    x.message ||
    "The action could not be completed. Please try again.";
  if (/rejected|denied/i.test(raw))
    return "This wallet request was declined. Any earlier confirmed approvals remain; inspect the transaction history before retrying.";
  return raw.slice(0, 400);
}
