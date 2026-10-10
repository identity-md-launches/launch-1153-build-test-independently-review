import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { readStaking, readSwap, type VerifiedRead } from "./chain/financial-read";
import { editableAmount, percentAmount } from "./amounts";
import { type GasBudget, gasFresh } from "./chain/gas";
import { message, type useWallet } from "./wallet";
import { fmt } from "./ui";
type Wallet = ReturnType<typeof useWallet>;
export function useFinancialRead<T extends VerifiedRead>(reader: (account?: Address) => Promise<T>, wallet: Wallet) {
  const key = `${wallet.account || "public"}:${wallet.chainId}:${wallet.revision}`;
  const current = useRef(key); current.current = key;
  const sequence = useRef(0);
  const [state, setState] = useState<{ key: string; data?: T; error: string; loading: boolean }>({ key, error: "", loading: true });
  const refresh = useCallback(async () => {
    if (key !== current.current) return;
    const id = ++sequence.current;
    setState(s => ({ key, data: s.key === key ? s.data : undefined, error: s.key === key ? s.error : "", loading: true }));
    try {
      const data = await reader(wallet.chainId === 1 ? wallet.account : undefined);
      if (id === sequence.current && key === current.current) setState({ key, data, error: "", loading: false });
    } catch (e) { if (id === sequence.current && key === current.current) setState(s => ({ ...s, error: message(e), loading: false })); }
  }, [key, reader, wallet.account, wallet.chainId]);
  useEffect(() => { void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000); return () => { ++sequence.current; clearInterval(timer); }; }, [refresh]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : "", loading: state.key !== key || state.loading, refresh };
}
export { readStaking, readSwap };
export function walletBlockers(w: Wallet) {
  if (w.connecting) return ["Waiting for your wallet. Unlock it and complete or decline the request."];
  if (!w.account) return ["Wallet not connected. Connect your wallet to continue."];
  const reasons: string[] = [];
  if (!w.wallet) reasons.push("Wallet signing client is missing. Reconnect your wallet.");
  if (w.chainId !== 1) reasons.push("Wrong network. Switch your wallet to Ethereum.");
  return reasons;
}
export function readBlockers(s: VerifiedRead | undefined, error: string, loading: boolean, now: number) {
  const reasons: string[] = [];
  if (error) reasons.push(`RPC read failed; previous data is stale. ${error} Refresh to retry both RPC providers.`);
  if (!s && !error) reasons.push(loading ? "Loading verified Ethereum data. Wait for the read to finish." : "Verified Ethereum data is missing. Refresh to retry.");
  if (s && !s.verified) reasons.push(...s.verificationErrors.map(e => `Verification failed: ${e}`));
  if (s && now * 1000 - s.observedAt > 90_000) reasons.push("The Ethereum read is stale. Refresh before continuing.");
  return reasons;
}
export function Prerequisites({ reasons, id }: { reasons: string[]; id: string }) {
  return <div className="action-help" id={id} aria-live="polite">{reasons.length ? <ul>{[...new Set(reasons)].map(r => <li key={r}>{r}</li>)}</ul> : <p>Ready for your review. Your wallet will ask you to confirm.</p>}</div>;
}
export function AmountShortcuts({ balance, reserve = 0n, reason, selected, onSelect }: { balance?: bigint; reserve?: bigint; reason: string; selected?: number; onSelect: (text: string, percent: number) => void }) {
  const unavailable = reason || (balance === undefined ? "Balance is unavailable. Refresh to read it." : balance <= reserve ? "No spendable balance is available." : "");
  return <div className="amount-shortcuts"><div role="group" aria-label="Amount shortcuts">{[25, 50, 75, 100].map(p => <button type="button" key={p} disabled={!!unavailable} aria-pressed={selected === p} onClick={() => onSelect(editableAmount(percentAmount(balance!, p, reserve)), p)}>{p === 100 ? "MAX" : `${p}%`}</button>)}</div>{unavailable && <small>{unavailable}</small>}</div>;
}
export function useEstimate(key: string, task: (() => Promise<GasBudget>) | undefined) {
  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<{ key: string; data?: GasBudget; error: string; loading: boolean }>({ key: "", error: "", loading: false });
  const latest = useRef(key); latest.current = key;
  useEffect(() => {
    let disposed = false;
    setState({ key, error: "", loading: !!task });
    if (task) {
      const timer = setTimeout(() => { void task().then(data => { if (!disposed && key === latest.current) setState({ key, data, error: "", loading: false }); }).catch(e => { if (!disposed && key === latest.current) setState({ key, error: message(e), loading: false }); }); }, 300);
      return () => { disposed = true; clearTimeout(timer); };
    }
  // Every caller includes all transaction inputs and the read block in key.
  }, [key, nonce]);
  return { data: state.key === key ? state.data : undefined, error: state.key === key ? state.error : "", loading: state.key === key && state.loading, retry: () => setNonce(n => n + 1) };
}
export function GasNote({ estimate, balance }: { estimate: ReturnType<typeof useEstimate>; balance?: bigint }) {
  const { data, error, loading } = estimate;
  return <div className="gas-note"><p>{data ? <>Gas reserve: <strong>{fmt(data.reserve, 9)} ETH</strong>. Includes a 25% gas-limit buffer and 20% fee buffer. Actual gas is separate and may be lower.</> : loading ? "Estimating gas for the next transaction…" : error ? `Gas estimate unavailable: ${error}` : balance !== undefined ? "Enter a valid amount to estimate gas." : "Enter an amount and connect on Ethereum to estimate gas."}</p>{data && balance !== undefined && balance < data.reserve && <p className="inline-error">Insufficient ETH for gas. Add ETH and refresh.</p>}{(error || (data && !gasFresh(data))) && <button className="text-button" onClick={estimate.retry}>Retry gas estimate</button>}</div>;
}
export function gasBlockers(estimate: ReturnType<typeof useEstimate>, needed: boolean, balance?: bigint, value = 0n) {
  if (!needed) return [];
  if (estimate.error) return [`Gas estimation failed. ${estimate.error} Retry the gas estimate.`];
  if (!gasFresh(estimate.data)) return [estimate.loading ? "Loading a fresh gas estimate. Wait before confirming." : "A fresh gas estimate is required. Retry the gas estimate."];
  if (balance === undefined) return ["ETH balance is unavailable. Refresh before confirming."];
  if (balance < value + estimate.data!.reserve) return ["Insufficient ETH for this amount plus buffered gas. Reduce the amount or add ETH, then refresh."];
  return [];
}
