import { CheckCircle2, CircleAlert, RefreshCw, Server } from "lucide-react";
import { zeroAddress } from "viem";
import { type Snapshot, ADDRESSES, sameAddress, type RoundSnapshot } from "./chain";
import { Badge, ExplorerLink, fmt } from "./ui";
import type { ProjectOperator } from "./project-state";
export function entryBlocker(s: Snapshot | undefined, rpcError: string, operator: ProjectOperator, round?: RoundSnapshot) {
    if (rpcError)
        return "RPC unavailable. Balances and rounds cannot be verified; retry.";
    if (!s)
        return "Reading Ethereum; paid entry is not verified yet.";
    if (!s.verified)
        return "Contract verification failed. New entry is blocked.";
    if (!s.phaseAComplete)
        return "Owner bindings are incomplete";
    if (!s.operationsReady)
        return s.readinessReasons.find(r => !r.startsWith("Separate") && r !== "No funded active prizes") || "On-chain readiness is incomplete";
    if (!operator.configured)
        return "The operator's public status endpoint is not configured.";
    if (operator.error)
        return "Operator status could not be verified: " + operator.error;
    if (!operator.proof?.serviceReady)
        return "Fresh signed operator readiness is unavailable.";
    if (!round)
        return "No funded round is open for entry in this game.";
    if (!round.round.prize)
        return "This round's prize is not funded.";
    return "";
}
export function Readiness({ s, rpcError, loading, operator, rounds, roundError, roundLoading, refresh, onOwner, isOwner }: {
    s?: Snapshot;
    rpcError: string;
    loading: boolean;
    operator: ProjectOperator;
    rounds: RoundSnapshot[];
    roundError: string;
    roundLoading: boolean;
    refresh: () => Promise<void>;
    onOwner: () => void;
    isOwner: boolean;
}) {
    const bindingRows = s ? [
        ["Treasury → Hook", s.treasury.hook, ADDRESSES.hook], ["Treasury → PRIO", s.treasury.prio, ADDRESSES.token],
        ["Treasury → StakingVault", s.treasury.stakingVault, ADDRESSES.vault], ["Treasury → Arena", s.treasury.arena, ADDRESSES.arena],
        ["Treasury → OracleAdapter", s.treasury.oracleAdapter, ADDRESSES.adapter], ["Hook → Treasury", s.hook.treasury, ADDRESSES.treasury],
        ["StakingVault → Funder", s.vault.rewardFunder, ADDRESSES.treasury], ["Arena → Oracle", s.arena.oracle, ADDRESSES.adapter], ["Adapter → Arena", s.adapter.arena, ADDRESSES.arena],
    ] : [];
    const known = !!s && !rpcError;
    const open = rounds.filter(r => r.round.state === 1 && r.round.commitDeadline > BigInt(Math.floor(Date.now() / 1000)) && r.round.prize > 0n);
    const cards = [
        { id: "bindings", title: "Contract bindings", ok: known && s.verified && s.phaseAComplete, label: !known ? "Unverified" : s.phaseAComplete ? "9 / 9 match" : "Missing / conflicting binding" },
        { id: "operations", title: "Operating configuration", ok: known && !!s.configurationReady, label: !known ? "Unverified" : s.configurationReady ? "Phase B configured" : "Phase B incomplete" },
        { id: "operator", title: "Operator connection", ok: known && !!operator.proof?.serviceReady, label: operator.error ? "Offline / unverified" : !operator.configured ? "Endpoint not configured" : operator.proof?.serviceReady ? "Signed status verified" : "Readiness unverified" },
        { id: "prizes", title: "Funded prizes", ok: known && (s.arena.lockedPrizes + s.arena.unallocatedPrizePool > 0n), label: known ? `${fmt(s.arena.lockedPrizes)} PRIO ${"locked"}` : "—" },
        { id: "rounds", title: "Open rounds", ok: known && !roundError && !roundLoading && open.length > 0, label: roundLoading && known ? "Reading rounds" : roundError ? "Round read failed" : known ? `${open.length} ${"open for entry"}` : "—" },
    ];
    return <section id="readiness" className="readiness-section" aria-labelledby="readiness-title">
    <div className="section-heading"><div><p className="eyebrow">ETHEREUM · {"LIVE CHECK"}</p><h2 id="readiness-title">{"Game operating diagnostics"}</h2></div>
      <button className="button secondary" disabled={loading} onClick={() => { void refresh(); operator.refresh(); }}><RefreshCw size={16}/>{loading ? "Reading…" : "Refresh status"}</button></div>
    <p className="readiness-lead">{rpcError ? "RPC connection failed. This is not a configuration result. Previous values are stale." : s?.treasury.totalIncome === 0n ? "Paid games need fee-funded operating budgets, owner configuration and a verified operator. Buying and staking use independent checks." : "Each check is verified separately. Connecting a wallet or choosing a faction does not enable paid play."}</p>
    <div className="readiness-grid">{cards.map(c => <a key={c.id} className={`readiness-tile ${c.ok ? "is-ready" : ""}`} href={`#readiness-${c.id}`} onClick={() => { const el = document.getElementById(`readiness-${c.id}`) as HTMLDetailsElement; if (el)
        el.open = true; }}>{c.ok ? <CheckCircle2 size={19}/> : <CircleAlert size={19}/>}<strong>{c.title}</strong><span>{c.label}</span></a>)}</div>
    <p className="tiny">{s ? `${"Last read block"} ${s.blockNumber} · ${new Date(s.timestamp * 1000).toISOString().replace("T", " ").replace(".000Z", " UTC")}` : "Waiting for Ethereum."}{s && s.arena.roundCount > 24n ? " · Latest 24 rounds scanned; find older rounds by ID." : ""}</p>
    {rpcError && <p role="alert" className="inline-error">{rpcError}</p>}
    <div className="readiness-details">
      <details id="readiness-bindings"><summary>{"Phase A · all 9 bindings"}</summary><p>{"Correct bindings are preserved and skipped. Any conflict stops execution."}</p>{bindingRows.map(([label, actual, expected]) => <div className="binding-row" key={label}><span>{label}</span><ExplorerLink address={actual}/><Badge tone={sameAddress(actual, expected) ? "cyan" : "yellow"}>{sameAddress(actual, expected) ? "Matches" : actual === zeroAddress ? "Unset" : "Conflict"}</Badge></div>)}{s?.verificationErrors.map(e => <p className="inline-error" key={e}>{e}</p>)}</details>
      <details id="readiness-operations"><summary>{"Phase B · settings and budgets"}</summary><ul>{s?.readinessReasons.filter(r => r !== "No funded active prizes" && !r.startsWith("Separate")).map(r => <li key={r}>{r}</li>)}</ul><p>{"Settings require wallet signatures and ETH gas; they do not create a round or reward funding. The owner must review price floors and spend limits."}</p>{isOwner && <button className="button secondary" onClick={onOwner}>{"Open owner setup"}</button>}</details>
      <details id="readiness-operator"><summary>{"Operator · signed status and connection"}</summary><OperatorDetails operator={operator}/></details>
      <details id="readiness-prizes"><summary>{"Prizes · actual funding"}</summary><p>{"Available for new rounds"}: {known ? fmt(s.arena.unallocatedPrizePool) : "—"} PRIO · {"Locked in existing rounds"}: {known ? fmt(s.arena.lockedPrizes) : "—"} PRIO.</p><p>{"Player deposits are not a prize budget. Only prizes funded on-chain can be used."}</p></details>
      <details id="readiness-rounds"><summary>{"Rounds · next action"}</summary><p>{roundError || (s?.arena.roundCount === 0n ? "No rounds exist. Next: Phase B, operator readiness and funding; then the owner approves pinQuestion → createRound." : "Reveal, claim and refund for closed entries remain available in PRIO Games.")}</p></details>
    </div>
  </section>;
}
export function OperatorDetails({ operator: o }: {
    operator: ProjectOperator;
}) {
    return <><p><Server size={16}/> {"This site is statically hosted. The operator must run on a separate server."}</p><p>{!o.configured ? "No public project operator endpoint has been supplied. Players never need to enter a URL; the owner publishes one project endpoint when the server is ready." : o.endpoint}</p>{o.error && <p className="inline-error" role="alert">{"Operator unverified: "}{o.error}</p>}{o.proof && <><p>{"Signing executor"}: <ExplorerLink address={o.proof.signer}/> · {"Expires"}: {new Date(o.proof.signed.payload.expiresAt * 1000).toISOString()}</p><ul>{o.proof.reasons.map(r => <li key={r}>{r}</li>)}</ul>{o.proof.signed.payload.activity.length ? <ul>{o.proof.signed.payload.activity.map(a => <li key={a.id}>{new Date(a.time * 1000).toISOString()} · {a.summary} {a.transactionHash && <ExplorerLink tx address={a.transactionHash} label={"Receipt"}/>}</li>)}</ul> : <p>{"No activity in the operator report."}</p>}</>}<button className="button secondary" onClick={o.refresh} disabled={o.loading}>{"Refresh operator status"}</button></>;
}
