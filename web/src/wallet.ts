import { useCallback, useEffect, useRef, useState } from "react";
import { createWalletClient, custom, isAddress, type Address, type EIP1193Provider, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...value: any[]) => void) => void;
  removeListener?: (event: string, fn: (...value: any[]) => void) => void;
  providers?: Provider[];
  isMetaMask?: boolean;
};
declare global { interface Window { ethereum?: Provider; } }
interface Choice { id: string; name: string; provider: Provider; }
interface Session { account?: Address; chainId?: number; wallet?: WalletClient; revision: number; }
const storageKey = "prism-wallet-provider";
const savedChoice = () => { try { return localStorage.getItem(storageKey); } catch { return null; } };
export function useWallet() {
  const [session, setSession] = useState<Session>({ revision: 0 });
  const [providers, setProviders] = useState<Choice[]>([]);
  const [selected, setSelected] = useState(savedChoice() || "");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const active = useRef<Provider | undefined>(undefined);
  const enabled = useRef(false);
  const sequence = useRef(0);
  const cleanup = useRef<(() => void) | undefined>(undefined);
  const clear = useCallback(() => setSession(s => ({ revision: s.revision + 1 })), []);

  // Account, client and chain are committed atomically; delayed replies never revive an old session.
  const synchronize = useCallback(async (p: Provider, requestAccess = false) => {
    const id = ++sequence.current;
    clear(); setConnecting(true); setError("");
    try {
      const accounts = await p.request({ method: requestAccess ? "eth_requestAccounts" : "eth_accounts" });
      const chain = Number(await p.request({ method: "eth_chainId" }));
      if (id !== sequence.current || !enabled.current || active.current !== p) return;
      if (!accounts[0] || !isAddress(accounts[0])) throw new Error("Wallet locked or no account shared. Unlock your wallet and reconnect.");
      if (!Number.isSafeInteger(chain) || chain < 1) throw new Error("Wallet network is unavailable. Reconnect your wallet.");
      const guardedProvider = {
        request: async (request: { method: string; params?: unknown }) => {
          // A client captured by an in-flight action cannot outlive its selected session.
          if (id !== sequence.current || !enabled.current || active.current !== p)
            throw new Error("Wallet session changed. Reconnect and review the action again.");
          return p.request(request as never);
        },
      };
      const client = createWalletClient({ account: accounts[0], chain: mainnet, transport: custom(guardedProvider) });
      setSession(s => ({ account: accounts[0], chainId: chain, wallet: client, revision: s.revision + 1 }));
    } catch (e) { if (id === sequence.current) { clear(); setError(message(e)); } }
    finally { if (id === sequence.current) setConnecting(false); }
  }, [clear]);
  const bind = useCallback((p: Provider) => {
    cleanup.current?.(); active.current = p;
    const changed = () => { if (enabled.current) void synchronize(p); };
    const disconnected = () => { ++sequence.current; clear(); setConnecting(false); setError("Wallet connection lost. Unlock your wallet and reconnect."); };
    p.on?.("accountsChanged", changed); p.on?.("chainChanged", changed); p.on?.("disconnect", disconnected);
    cleanup.current = () => { p.removeListener?.("accountsChanged", changed); p.removeListener?.("chainChanged", changed); p.removeListener?.("disconnect", disconnected); };
  }, [clear, synchronize]);
  useEffect(() => {
    const choices: Choice[] = [];
    const add = (c: Choice) => {
      if (choices.some(x => x.provider === c.provider)) return;
      choices.push(c); setProviders([...choices]);
      const saved = savedChoice();
      if ((saved === c.id || (!saved && choices.length === 1)) && !active.current) {
        setSelected(c.id);
        if (saved === c.id) { enabled.current = true; bind(c.provider); void synchronize(c.provider); }
      }
    };
    const announce = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.provider?.request && typeof d.info?.rdns === "string") add({ id: d.info.rdns, name: String(d.info.name || "Ethereum wallet"), provider: d.provider });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    // Discovery also supports older wallets exposing a providers array.
    (window.ethereum?.providers || (window.ethereum ? [window.ethereum] : [])).forEach((p, i) => add({ id: `injected-${i}`, name: p.isMetaMask ? "MetaMask" : `Browser wallet ${i + 1}`, provider: p }));
    return () => { ++sequence.current; cleanup.current?.(); active.current = undefined; window.removeEventListener("eip6963:announceProvider", announce); };
  }, [bind, synchronize]);
  const connect = useCallback(async () => {
    const choice = providers.find(p => p.id === selected) || (providers.length === 1 ? providers[0] : undefined);
    if (!choice) { setError(providers.length ? "Choose a wallet, then connect." : "No wallet found. Open this site in an Ethereum wallet browser, or install an Ethereum browser wallet, then reload."); return; }
    enabled.current = true; bind(choice.provider); setSelected(choice.id);
    try { localStorage.setItem(storageKey, choice.id); } catch {}
    await synchronize(choice.provider, true);
  }, [providers, selected, bind, synchronize]);
  const disconnect = useCallback(() => {
    enabled.current = false; ++sequence.current; cleanup.current?.(); active.current = undefined;
    clear(); setError(""); setConnecting(false);
    try { localStorage.removeItem(storageKey); } catch {}
  }, [clear]);
  const selectProvider = (id: string) => { disconnect(); setSelected(id); };
  const switchNetwork = async () => {
    const p = active.current;
    if (!p) { setError("Wallet client is missing. Reconnect your wallet."); clear(); return; }
    try {
      setError(""); setConnecting(true);
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x1" }] });
      if (active.current !== p || !enabled.current) return;
      if (Number(await p.request({ method: "eth_chainId" })) !== 1) throw new Error("The wallet did not switch to Ethereum. Select Ethereum in your wallet and retry.");
      await synchronize(p);
    } catch (e) { setError(message(e)); }
    finally { if (active.current === p) setConnecting(false); }
  };
  return { ...session, providers, selected, selectProvider, error, setError, connecting, connect, switchNetwork, disconnect };
}
export function message(e: unknown) {
  const x = e as { code?: number; shortMessage?: string; message?: string; details?: string; cause?: { message?: string } };
  const raw = x?.shortMessage || x?.message || "The action could not be completed. Please try again.";
  const detail = `${raw} ${x?.details || ""} ${x?.cause?.message || ""}`;
  if (/wallet session changed/i.test(detail)) return "Wallet session changed. Reconnect and review the action again.";
  if (x?.code === 4001 || /rejected|denied/i.test(detail)) return "This wallet request was declined. Earlier confirmed approvals remain; check transaction history before retrying.";
  if (/insufficient funds|exceeds.*balance/i.test(detail)) return "Insufficient ETH for this amount and gas. Reduce the amount or add ETH, then retry.";
  // Third-party wallet messages can be localized. Keep the site's recovery instructions English.
  if (/[ğĞıİşŞçÇöÖüÜ]/.test(raw)) return "The wallet or RPC could not complete this request. Check your wallet, reconnect, or refresh and retry.";
  return raw.slice(0, 400);
}
