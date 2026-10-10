import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { ABIS, ADDRESSES, approveExact, executeSwap, prepareSwapApproval, quoteSwap, runContractAction, type SwapQuote } from "./chain";
import { estimateSwapGas, permit2Abi, sellApproved } from "./chain/swap";
import { estimateGasBudget, gasFresh } from "./chain/gas";
import { parseAmount } from "./amounts";
import { useClock } from "./project-state";
import { ConnectGate, WalletChoices, TransactionNotice, useAction, type PanelProps } from "./panel-common";
import { AmountShortcuts, GasNote, Prerequisites, gasBlockers, readBlockers, readStaking, readSwap, useEstimate, useFinancialRead, walletBlockers } from "./financial-ui";
import { Badge, ExplorerLink, fmt } from "./ui";
import { message } from "./wallet";

export function SwapPanel(p: PanelProps & { compact?: boolean }) {
  const w = p.wallet, now = useClock();
  const reads = useFinancialRead(readSwap, w), s = reads.data;
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<number>();
  const [slippage, setSlippage] = useState("0.5");
  const [revision, setRevision] = useState(0);
  const [quoted, setQuoted] = useState<{ key: string; value: SwapQuote }>();
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const input = parseAmount(amount);
  const bpsValue = /^\d+(\.\d{1,2})?$/.test(slippage) ? parseAmount(slippage, 2) : undefined;
  const bps = bpsValue && bpsValue <= 500n ? Number(bpsValue) : undefined;
  const identity = `${w.account}:${w.chainId}:${w.revision}:${direction}`;
  const key = `${identity}:${amount}:${bps}:${revision}`;
  const current = useRef(key); current.current = key;
  const quote = quoted?.key === key ? quoted.value : undefined;
  const freshQuote = quote && now * 1000 < quote.expiresAt ? quote : undefined;
  const readReasons = readBlockers(s, reads.error, reads.loading, now);
  const connected = walletBlockers(w).length === 0;
  const user = connected ? s?.account : undefined;
  const balance = direction === "buy" ? user?.eth : user?.prio;
  const approved = direction === "buy" || sellApproved(s, input, now);
  const action = useAction(async () => { await reads.refresh(); await p.refresh(); });
  useEffect(() => { setAmount(""); setSelected(undefined); setQuoted(undefined); setQuoteError(""); }, [identity]);
  useEffect(() => {
    let disposed = false;
    setQuoted(undefined); setQuoteError(""); setQuoting(false);
    if (!input || !bps || readReasons.length || (w.account && !connected)) return;
    setQuoting(true);
    const timer = setTimeout(() => {
      void quoteSwap(direction, input, bps).then(value => {
        if (!disposed && current.current === key) setQuoted({ key, value });
      }).catch(e => { if (!disposed && current.current === key) setQuoteError(message(e)); })
        .finally(() => { if (!disposed && current.current === key) setQuoting(false); });
    }, 450);
    return () => { disposed = true; clearTimeout(timer); };
  }, [key, s?.verified, reads.error, connected]);
  useEffect(() => {
    if (quote && now * 1000 >= quote.expiresAt && !action.busy) setRevision(r => r + 1);
  }, [now, quote, action.busy]);
  const estimateKey = `${key}:${s?.blockNumber}:${freshQuote?.observedAt}:${approved}:${Math.floor(now / 45)}`;
  const canEstimate = connected && !!user && !readReasons.length;
  const gas = useEstimate(estimateKey, canEstimate ? async () => {
    if (direction === "sell") {
      if (!input) throw new Error("Enter a valid PRIO amount to estimate gas.");
      if (user.tokenAllowance !== input) return estimateGasBudget(w.account!, { address: ADDRESSES.token, abi: ABIS.token, functionName: "approve", args: [ADDRESSES.permit2, input] });
      if (!approved) return estimateGasBudget(w.account!, { address: ADDRESSES.permit2, abi: permit2Abi, functionName: "approve", args: [ADDRESSES.token, ADDRESSES.router, input, now + 1200] });
      if (!freshQuote) throw new Error("Prepare a fresh quote to estimate sell gas.");
      return estimateSwapGas(w.account!, freshQuote);
    }
    // A real, read-only router estimate reserves gas even before an amount is entered.
    // The probe never signs or changes wallet balances.
    const probe = user.eth / 2n < 1_000_000_000_000_000n ? user.eth / 2n : 1_000_000_000_000_000n;
    if (probe <= 1n) throw new Error("No spendable ETH. Add ETH to cover a buy and gas.");
    const q = freshQuote || await quoteSwap("buy", probe, bps || 50);
    return estimateSwapGas(w.account!, q);
  } : undefined);
  const invalid = !input ? [amount ? "Invalid amount. Enter a positive amount with up to 18 decimals, without commas." : `Enter the amount of ${direction === "buy" ? "ETH" : "PRIO"} to spend.`] : [];
  const insufficient = input && balance !== undefined && input > balance ? [`Insufficient ${direction === "buy" ? "ETH" : "PRIO"} balance. Reduce the amount or add funds.`] : [];
  const balanceMissing = connected && !user ? ["Wallet balances are loading or unavailable. Refresh to retry."] : [];
  const hard = [...readReasons, ...invalid, ...(!bps ? ["Enter slippage from 0.01% to 5%, with at most 2 decimals."] : []), ...insufficient, ...balanceMissing];
  const gasReasons = gasBlockers(gas, connected && !!input && !hard.length, user?.eth, direction === "buy" ? input || 0n : 0n);
  const quoteReason = input && bps && !freshQuote ? [quoting ? "Preparing a simulated quote. No signature is requested." : quoteError ? `Quote failed: ${quoteError} Use Retry quote.` : "A fresh quote is required. Choose Prepare quote."] : [];
  const reasons = [...walletBlockers(w), ...hard, ...gasReasons, ...quoteReason, ...(!approved && input ? ["Sell approval is missing or does not match this amount. Approve exact PRIO first; Permit2 may request two confirmations."] : []), ...(action.busy ? ["Transaction in progress. Follow the wallet and receipt status below."] : [])];
  const connectStep = !connected;
  const quoteStep = !freshQuote;
  const disabled = action.busy || w.connecting || (!connectStep && (hard.length > 0 || (quoteStep ? quoting : gasReasons.length > 0)));
  const label = action.busy ? "Transaction in progress…" : !w.account ? direction === "buy" ? "Connect to buy PRIO" : "Connect to sell PRIO" : !w.wallet ? "Reconnect wallet" : w.chainId !== 1 ? "Switch to Ethereum" : !input ? "Enter an amount" : quoteStep ? quoting ? "Preparing quote…" : quoteError ? "Retry quote" : "Prepare quote" : !approved ? "Approve exact PRIO" : `Review ${direction} in wallet`;
  const primary = () => {
    if (!w.account || !w.wallet) { void w.connect(); return; }
    if (w.chainId !== 1) { void w.switchNetwork(); return; }
    if (hard.length) return;
    if (!freshQuote) { setRevision(r => r + 1); return; }
    if (gasReasons.length) return;
    if (!approved) void action.run(async update => { await prepareSwapApproval(w.wallet!, w.account!, input!, update); await reads.refresh(); setRevision(r => r + 1); });
    else void action.run(async update => { await executeSwap(w.wallet!, w.account!, freshQuote, update); setAmount(""); setSelected(undefined); setRevision(r => r + 1); });
  };
  const shortcutReason = action.busy ? "Wait for this transaction to finish." : !connected ? "Connect on Ethereum to use balance shortcuts." : readReasons.length ? "Refresh verified balances to use shortcuts." : direction === "buy" && !gasFresh(gas.data) ? "ETH shortcuts need a fresh router gas estimate. Connect, add ETH if needed, and retry gas." : "";
  return <div className={`panel swap-panel ${p.compact ? "compact-swap" : ""}`}>
    <div className="swap-heading"><h2>Buy PRIO</h2><Badge tone="cyan">Ethereum</Badge></div>
    <div className="segmented"><button disabled={action.busy} aria-pressed={direction === "buy"} onClick={() => { setAmount(""); setSelected(undefined); setQuoted(undefined); setDirection("buy"); }}>Buy PRIO</button><button disabled={action.busy} aria-pressed={direction === "sell"} onClick={() => { setAmount(""); setSelected(undefined); setQuoted(undefined); setDirection("sell"); }}>Sell PRIO</button></div>
    <label className="field">You pay<div className="input-row"><input name="swap-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={action.busy} onChange={e => { setAmount(e.target.value); setSelected(undefined); }} aria-invalid={!!amount && !input} aria-describedby="swap-help"/><span>{direction === "buy" ? "ETH" : "PRIO"}</span></div><small>Balance: {fmt(balance, 8)} {direction === "buy" ? "ETH" : "PRIO"}</small></label>
    <AmountShortcuts balance={balance} reserve={direction === "buy" ? gas.data?.reserve : 0n} reason={shortcutReason} selected={selected} onSelect={(text, percent) => { setAmount(text); setSelected(percent); }}/>
    <div className="swap-output"><span>You receive <strong>{fmt(freshQuote?.amountOut, 8)} {direction === "buy" ? "PRIO" : "ETH"}</strong></span><small>Minimum output: {fmt(freshQuote?.minimumOut, 8)} {direction === "buy" ? "PRIO" : "ETH"}</small></div>
    <label className="field slippage-field">Slippage (%)<input name="slippage" inputMode="decimal" value={slippage} disabled={action.busy} onChange={e => setSlippage(e.target.value)} aria-invalid={!bps}/></label>
    <button className="button primary full" disabled={disabled} onClick={primary} aria-describedby="swap-help">{label}<ArrowRight size={17}/></button>
    <Prerequisites id="swap-help" reasons={reasons}/>
    {!connected && <WalletChoices wallet={w}/>}
    {w.error && <p role="alert" className="inline-error">{w.error}</p>}
    <div className="financial-refresh"><button className="text-button" disabled={reads.loading} onClick={() => { void reads.refresh(); gas.retry(); setRevision(r => r + 1); }}><RefreshCw size={14}/>{reads.loading ? "Reading balances…" : "Refresh balances / retry RPC"}</button>{input && <button className="text-button" disabled={quoting || action.busy} onClick={() => setRevision(r => r + 1)}>{quoting ? "Simulating…" : "Refresh quote"}</button>}</div>
    {user && <GasNote estimate={gas} balance={user.eth}/>}
    <details className="rules swap-details"><summary>Fees, price impact and swap protection</summary><dl className="metric-list"><div><dt>LP fee</dt><dd>{quote ? quote.lpFeePpm / 10000 : s ? s.pool.lpFee / 10000 : "—"}%</dd></div><div><dt>Platform protocol fee</dt><dd>{quote ? `${quote.protocolFeePpm / 10000}%` : "Read from quote"}</dd></div><div><dt>Combined pool fee</dt><dd>{quote ? `${quote.combinedPoolFeePpm / 10000}%` : "Read from quote"}</dd></div><div><dt>Immutable treasury hook fee</dt><dd>0.5% of the ETH leg</dd></div><div><dt>Estimated hook fee</dt><dd>{fmt(quote?.hookFeeEth, 9)} ETH</dd></div><div><dt>Estimated price impact</dt><dd>{quote?.priceImpactBps !== undefined ? `${quote.priceImpactBps / 100n}.${(quote.priceImpactBps % 100n).toString().padStart(2, "0")}%` : "Unavailable until quoted"}</dd></div><div><dt>Website fee</dt><dd>0</dd></div></dl><p>Quotes include pool and hook fees. Price impact compares output to the current spot price after estimated fees. Minimum output protects against slippage. Gas is separate, including for reverted transactions. Quotes expire after 60 seconds and refresh automatically.</p><p>{quote ? `Quote block ${quote.blockNumber}; ${freshQuote ? `${Math.max(0, Math.ceil((quote.expiresAt - now * 1000) / 1000))} seconds remaining.` : "expired."}` : "A quote simulates the deployed pool; it does not execute a trade."}</p><p>Sells use exact PRIO approval to Permit2 and an exact router allowance lasting at most 20 minutes. Each transaction requires explicit wallet confirmation. The router returns unused ETH.</p><ExplorerLink address={ADDRESSES.router} label="Verified Universal Router"/>{w.account && <><button className="text-button" disabled={!connected || action.busy} onClick={() => void action.run(update => approveExact(w.wallet!, w.account!, ADDRESSES.permit2, 0n, update))}>Revoke PRIO approval to Permit2</button>{!connected && <p>Reconnect on Ethereum to revoke this approval.</p>}</>}</details>
    <p className="tiny">Fees included in output: 1.25% LP + the quoted platform fee + 0.5% treasury hook. Gas is paid separately.</p>
    <TransactionNotice action={action}/>
  </div>;
}

export function StakePanel(p: PanelProps) {
  const w = p.wallet, now = useClock();
  const reads = useFinancialRead(readStaking, w), s = reads.data;
  const [tab, setTab] = useState<"stake" | "withdraw">("stake");
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState<number>();
  const identity = `${w.account}:${w.chainId}:${w.revision}:${tab}`;
  useEffect(() => { setAmount(""); setSelected(undefined); }, [identity]);
  const action = useAction(async () => { await reads.refresh(); await p.refresh(); });
  const input = parseAmount(amount);
  const connected = walletBlockers(w).length === 0;
  const user = connected ? s?.account : undefined;
  const readReasons = readBlockers(s, reads.error, reads.loading, now);
  const known = !!s && !readReasons.length;
  const streaming = known && s.vault.rewardReserve > 0n && s.vault.rewardRate > 0n && Number(s.vault.periodFinish) > now;
  const balance = tab === "stake" ? user?.prio : user?.staked;
  const approved = !!input && !!user && user.vaultAllowance >= input;
  const call = tab === "stake" && !approved ? { address: ADDRESSES.token, abi: ABIS.token, functionName: "approve", args: [ADDRESSES.vault, input] } : { address: ADDRESSES.vault, abi: ABIS.vault, functionName: tab === "stake" ? "stake" : "withdraw", args: [input] };
  const canEstimate = connected && known && !!input && balance !== undefined && input <= balance;
  const gas = useEstimate(`${identity}:${amount}:${approved}:${s?.blockNumber}:${Math.floor(now / 45)}`, canEstimate ? () => estimateGasBudget(w.account!, call) : undefined);
  const base = [...walletBlockers(w), ...readReasons, ...(!input ? [amount ? "Invalid amount. Enter a positive PRIO amount with up to 18 decimals, without commas." : `Enter the PRIO amount to ${tab}.`] : []), ...(connected && balance === undefined ? ["Wallet balance is unavailable. Refresh to retry."] : []), ...(input && balance !== undefined && input > balance ? [`Insufficient ${tab === "stake" ? "available" : "withdrawable staked"} PRIO. Reduce the amount.`] : [])];
  const gasReasons = gasBlockers(gas, canEstimate, user?.eth);
  const reasons = [...base, ...gasReasons, ...(tab === "stake" && input && !approved ? ["Vault approval is required. Approve only the entered PRIO amount, then review the deposit."] : []), ...(action.busy ? ["Transaction in progress. Follow the wallet and receipt status below."] : [])];
  const claimGas = useEstimate(`claim:${w.revision}:${s?.blockNumber}:${user?.earned}:${Math.floor(now / 45)}`, connected && known && !!user?.earned ? () => estimateGasBudget(w.account!, { address: ADDRESSES.vault, abi: ABIS.vault, functionName: "claim" }) : undefined);
  const claimReasons = [...walletBlockers(w), ...readReasons, ...(user?.earned === 0n ? ["Your claimable reward is 0 PRIO. There is nothing to claim."] : user?.earned === undefined ? ["Connect and refresh to read your claimable rewards."] : []), ...gasBlockers(claimGas, connected && known && !!user?.earned, user?.eth), ...(action.busy ? ["Wait for the current transaction receipt."] : [])];
  const primary = () => {
    if (!w.account || !w.wallet) { void w.connect(); return; }
    if (w.chainId !== 1) { void w.switchNetwork(); return; }
    if (base.length || gasReasons.length) return;
    void action.run(async update => {
      if (tab === "stake" && !approved) await approveExact(w.wallet!, w.account!, ADDRESSES.vault, input!, update);
      else { await runContractAction(w.wallet!, w.account!, "vault", tab === "stake" ? "stake" : "withdraw", [input!], update); setAmount(""); setSelected(undefined); }
    });
  };
  return <div className="panel stake-panel"><p className="panel-intro">Deposit PRIO into the existing StakingVault. Principal stays separate from operating budgets. Withdrawals and claims do not depend on game or operator readiness.</p>
    <div className="info-box staking-funding"><strong>{!known ? "Reward stream status is unverified. Refresh chain data." : streaming ? "A funded reward stream is active." : "No reward stream is currently active"}</strong><p>Depositing does not create income. Only actually funded rewards are distributed. No promised APY or yield.</p></div>
    <dl className="metric-list stake-metrics"><div><dt>Your staked principal</dt><dd>{fmt(known ? user?.staked : undefined, 8)} PRIO</dd></div><div><dt>Your claimable rewards</dt><dd>{fmt(known ? user?.earned : undefined, 8)} PRIO</dd></div><div><dt>Reward reserve</dt><dd>{fmt(known ? s.vault.rewardReserve : undefined, 8)} PRIO</dd></div><div><dt>Stream status</dt><dd>{!known ? "Unverified" : streaming ? "Active" : "No active stream"}</dd></div></dl>
    <div className="segmented"><button disabled={action.busy} aria-pressed={tab === "stake"} onClick={() => { setAmount(""); setSelected(undefined); setTab("stake"); }}>Stake PRIO</button><button disabled={action.busy} aria-pressed={tab === "withdraw"} onClick={() => { setAmount(""); setSelected(undefined); setTab("withdraw"); }}>Withdraw PRIO</button></div>
    <label className="field">Amount to {tab}<input name="staking-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={action.busy} onChange={e => { setAmount(e.target.value); setSelected(undefined); }} aria-invalid={!!amount && !input} aria-describedby="stake-help"/><small>{tab === "stake" ? "Available wallet balance" : "Your withdrawable principal"}: {fmt(known ? balance : undefined, 8)} PRIO</small></label>
    <AmountShortcuts balance={balance} reason={action.busy ? "Wait for this transaction to finish." : !connected ? "Connect on Ethereum to read your balance." : !known ? "Refresh verified balances to use shortcuts." : ""} selected={selected} onSelect={(text, percent) => { setAmount(text); setSelected(percent); }}/>
    <button className="button primary full" aria-describedby="stake-help" disabled={action.busy || w.connecting || (connected && (base.length > 0 || gasReasons.length > 0))} onClick={primary}>{action.busy ? "Transaction in progress…" : !w.account ? "Connect wallet" : !w.wallet ? "Reconnect wallet" : w.chainId !== 1 ? "Switch to Ethereum" : !input ? "Enter an amount" : tab === "stake" ? approved ? "Review deposit in wallet" : "Approve exact PRIO for staking" : "Review withdrawal in wallet"}<ArrowRight size={17}/></button>
    <Prerequisites id="stake-help" reasons={reasons}/><ConnectGate wallet={w}/><GasNote estimate={gas} balance={user?.eth}/>
    <button className="text-button" disabled={reads.loading} onClick={() => { void reads.refresh(); gas.retry(); claimGas.retry(); }}><RefreshCw size={14}/>{reads.loading ? "Reading balances…" : "Refresh balances / retry RPC"}</button>
    <div className="claim-section"><h3>Funded rewards</h3><button className="button secondary full" disabled={!!claimReasons.length} aria-describedby="claim-help" onClick={() => void action.run(update => runContractAction(w.wallet!, w.account!, "vault", "claim", [], update))}>Claim funded rewards</button><Prerequisites id="claim-help" reasons={claimReasons}/>{!!user?.earned && <GasNote estimate={claimGas} balance={user.eth}/>}</div>
    <TransactionNotice action={action}/>
    <details className="rules"><summary>Reserve, withdrawal and approval details</summary><p>Withdrawable principal is read from your account's staked PRIO, never the global total. Percentages round down in token base units and only fill the editable field. Allowance and balances are read again after each confirmed receipt.</p><p>Reserved reward liabilities: {fmt(known ? s.vault.rewardsOwed : undefined, 8)} PRIO. Reward rate: {fmt(known ? s.vault.rewardRate : undefined, 9, 36)} PRIO / second. An expired stream creates no new rewards.</p><ExplorerLink address={ADDRESSES.vault} label="Existing StakingVault"/><button className="text-button" disabled={!connected || action.busy} onClick={() => void action.run(update => approveExact(w.wallet!, w.account!, ADDRESSES.vault, 0n, update))}>Revoke vault approval</button>{!connected && <p>Connect on Ethereum to revoke the vault approval.</p>}</details>
    <p className="tiny">{s ? `Ethereum block ${s.blockNumber}. Reads verify the vault and PRIO independently of paid games.` : "Waiting for verified vault data."}</p>
  </div>;
}
