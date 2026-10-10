import { ActionRequirements } from "./panel-common";
import { OperatorDetails } from "./readiness";
import { useClock, timeLeft, type ProjectOperator } from "./project-state";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Download, FileUp, LockKeyhole, Radio, ShieldCheck, Swords, Trophy, } from "lucide-react";
import { decodeEventLog, hexToString, zeroHash } from "viem";
import { ABIS, ADDRESSES, approveExact, createRevealSecret, exportSecrets, fetchOperatorStatus, importSecrets, loadRevealSecret, readRound, runContractAction, type OperatorProof, type RevealSecret, type RoundSnapshot, } from "./chain";
import { art, Badge, DownloadButton, ExplorerLink, fmt, playTone } from "./ui";
import { GAMES } from "./practice";
import { message } from "./wallet";
import { ConnectGate, ready, recoveryReady, SnapshotNote, TransactionNotice, useAction, type PanelProps, } from "./panel-common";
const deadline = (time: bigint) => new Date(Number(time) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
}) + " UTC";
export function LiveGames(p: PanelProps & {
    sound: boolean;
    motion: boolean;
    projectOperator: ProjectOperator;
    mode?: number;
}) {
    const s = p.snapshot, w = p.wallet;
    const [rounds, setRounds] = useState<RoundSnapshot[]>([]);
    const [roundId, setRoundId] = useState("");
    const [mode, setMode] = useState(p.mode);
    const [foundIds, setFoundIds] = useState<bigint[]>([]);
    const operator = p.projectOperator.proof;
    const [recoveryMessage, setRecoveryMessage] = useState("");
    const [recoveryText, setRecoveryText] = useState("");
    const [clock, setClock] = useState(Date.now());
    const action = useAction();
    useEffect(() => {
        const i = setInterval(() => setClock(Date.now()), 10000);
        return () => clearInterval(i);
    }, []);
    useEffect(() => {
        if (!s || s.arena.roundCount === 0n)
            return;
        let cancelled = false;
        const recent = Array.from({ length: Number(s.arena.roundCount > 24n ? 24n : s.arena.roundCount) }, (_, i) => s.arena.roundCount - BigInt(i));
        const ids = [...new Set([...recent, ...rounds.map((r) => r.id)])];
        void action.run(async () => {
            const refreshed = await Promise.all(ids.map((id) => readRound(id, w.account)));
            if (!cancelled)
                setRounds(refreshed);
        });
        return () => {
            cancelled = true;
        };
    }, [s?.blockNumber, w.account]);
    useEffect(() => {
        setRounds([]);
    }, [w.account]);
    const freshOperator = operator && operator.signed.payload.expiresAt > Math.floor(clock / 1000)
        ? operator
        : undefined;
    const refreshRounds = async () => {
        await p.refresh();
        setRounds(await Promise.all(rounds.map((r) => readRound(r.id, w.account))));
    };
    return (<div className="panel">
      {mode !== undefined && <div className="action-row"><Badge tone="violet">{GAMES[mode]?.name}</Badge><button className="text-button" onClick={() => setMode(undefined)}>{"Show all games"}</button></div>}
      <p className="panel-intro">{"Paid rounds use the deployed Arena’s commit → reveal → claim sequence. A choice is private until you reveal it. Practice games never spend tokens or appear in these results."}</p>
      <div className="info-box">
        <strong>
          {s?.corePaidReady && freshOperator?.ready
            ? "Paid entry checks are ready."
            : "Paid entry is currently unavailable. Review the specific blockers below."}
        </strong>
        <ul className="readiness-list">
          {(freshOperator
            ? freshOperator.reasons
            : s?.readinessReasons || ["Waiting for verified live configuration"]).map((reason) => (<li key={reason}>
              <LockKeyhole size={14}/>
              {reason}
            </li>))}
        </ul>
        <p>{"Withdrawals, eligible reveals, claims and cancellation refunds remain available independently of new-entry readiness."}</p>
      </div>
      <div className="balance-row">
        <span>{"Recorded rounds"}<strong>{(p.stale ? undefined : s?.arena.roundCount.toString()) ?? "—"}</strong>
        </span>
        <span>{"Funded locked prizes"}<strong>{fmt(p.stale ? undefined : s?.arena.lockedPrizes)}{" PRIO "}</strong>
        </span>
        <span>{"Maximum entry loss"}<strong>{"22 PRIO + gas"}</strong>
        </span>
      </div>
      <div className="info-box"><strong>{"Entry: 100 PRIO escrow + 2 PRIO fee"}</strong><p>{"Maximum loss: 22 PRIO + gas. Approve exactly 102 PRIO; save and back up your secret, enter, reveal before the deadline, then claim or refund. Prizes come only from a funded round."}</p></div>
      <button className="text-button" onClick={p.onReadiness}>{"View readiness details for these blockers"}</button>
      {p.stale && <p className="inline-error" role="alert">{"RPC read failed. New entry is blocked; independent recovery actions verify their own target."}</p>}
      {!p.projectOperator.configured && <p>{"Operator endpoint is not configured; players never need to enter a URL."}</p>}
      {p.projectOperator.error && <p className="inline-error">{p.projectOperator.error}</p>}
      <details className="rules"><summary>{"Read the rules before connecting"}</summary><p>{"Correct: 100 PRIO + equal prize share; wrong: 90; missed reveal: 80; cancellation: 102. Winner = (oracle answer mod choice count) + 1. Boss prizes require the correct-player threshold."}</p></details>
      <ConnectGate wallet={w}/>
      {s?.arena.roundCount === 0n ? (<div className="empty-state">
          <Swords size={34}/>
          <h3>{"The on-chain arena is quiet."}</h3>
          <p>{"No rounds have been created. Paid play needs owner configuration, fee-funded budgets, a funded prize and a ready server operator. Explore free practice from the arcade while setup is pending."}</p>
        </div>) : null}
      {s && s.arena.roundCount > 24n && <p className="tiny">{"The latest 24 rounds are loaded. Look up older rounds by ID below; reveal, claim and refund eligibility is unchanged."}</p>}
      {mode !== undefined && !action.busy && rounds.length > 0 && !rounds.some(r => r.round.mode === mode || foundIds.includes(r.id)) && <div className="empty-state"><p>{"No round for this game appears in the loaded history. Show all games or look up a round ID below."}</p><button className="button secondary" onClick={() => setMode(undefined)}>{"Show all games"}</button></div>}
      {rounds.filter(r => mode === undefined || r.round.mode === mode || foundIds.includes(r.id)).map((r) => (<RoundCard key={`${r.id}-${w.account ?? ""}`} data={r} {...p} refresh={refreshRounds} operator={freshOperator}/>))}
      <div className="panel-grid">
        <label className="field">{"Find any round by ID"}<input name="round-id" inputMode="numeric" value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder={"Round number"}/>
        </label>
        <div className="action-row" style={{ alignItems: "center" }}>
          <button className="button secondary" disabled={action.busy} onClick={() => void action.run(async () => {
            if (!/^[1-9]\d*$/.test(roundId))
                throw new Error("Enter a round ID of 1 or higher.");
            const r = await readRound(BigInt(roundId), w.account);
            if (r.round.state === 0)
                throw new Error("That round does not exist. Check the recorded round count.");
            setFoundIds(old => [...new Set([...old, r.id])]);
            setRounds((old) => [r, ...old.filter((x) => x.id !== r.id)]);
        })}>{"Load round"}<ArrowRight size={16}/>
          </button>
        </div>
      </div>
      <TransactionNotice action={action}/>
      <details className="rules">
        <summary>{"Reveal recovery · export and import"}</summary>
        <p>{"Before entering, save a backup of your private choice and random salt. Keep the file offline until the reveal window. It is specific to this Ethereum Arena, wallet and round. This site never sends unrevealed choices or salts to a server."}</p>
        <p>{"IPFS gateway origins have separate browser storage. When moving to another URL, import your saved backup. Losing every copy can mean a missed reveal and a 22 PRIO loss."}</p>
        <div className="action-row">
          <button className="button secondary" onClick={() => {
            try {
                const data = exportSecrets(w.account);
                downloadBackup(data);
                setRecoveryMessage("Reveal backup exported. Keep it private and offline.");
            }
            catch (e) {
                setRecoveryMessage(message(e));
            }
        }}>
            <Download size={16}/>{"Export reveal backups"}</button>
          <label className="button secondary" style={{ cursor: "pointer" }}>
            <FileUp size={16}/>{"Import backup file"}<input type="file" accept="application/json,.json" style={{ maxWidth: 180 }} onChange={async (e) => {
            try {
                const f = e.target.files?.[0];
                if (!f)
                    return;
                const count = importSecrets(await f.text(), w.account);
                setRecoveryMessage(`Imported ${count} valid secret(s) locally.`);
                await refreshRounds();
            }
            catch (error) {
                setRecoveryMessage(message(error));
            }
        }}/>
          </label>
        </div>
        <label className="field">{"Or paste a private backup locally"}<textarea value={recoveryText} onChange={(e) => setRecoveryText(e.target.value)} name="reveal-backup" autoComplete="off" spellCheck={false}/>
        </label>
        <button className="button secondary" onClick={() => {
            try {
                const n = importSecrets(recoveryText, w.account);
                setRecoveryText("");
                setRecoveryMessage(`Imported ${n} valid secret(s) locally.`);
                void refreshRounds();
            }
            catch (e) {
                setRecoveryMessage(message(e));
            }
        }}>{"Import pasted backup"}</button>
        <p role="status">{recoveryMessage}</p>
      </details>
      <details className="rules"><summary>{"Operator status and real activity"}</summary><OperatorDetails operator={p.projectOperator}/></details>
      <SnapshotNote {...p}/>
    </div>);
}
function downloadBackup(text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "prism-riot-private-reveal-backup.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function RoundCard(p: PanelProps & {
    data: RoundSnapshot;
    operator?: OperatorProof;
    sound: boolean;
    motion: boolean;
}) {
    const { data: d, wallet: w } = p;
    const r = d.round;
    const [choice, setChoice] = useState(1);
    const [secret, setSecret] = useState<RevealSecret>();
    const [backedUp, setBackedUp] = useState(false);
    const [confirmedPayout, setConfirmedPayout] = useState<{
        amount: bigint;
        kind: "claim" | "refund";
    }>();
    const action = useAction(p.refresh);
    useEffect(() => {
        try {
            const value = w.account ? loadRevealSecret(w.account, d.id) : undefined;
            setSecret(value);
            if (value)
                setChoice(value.choice);
        }
        catch (e) {
            action.setError(message(e));
        }
    }, [w.account, d.id, d.entry?.commitment]);
    const entered = !!d.entry && d.entry.commitment !== zeroHash;
    const clock = useClock();
    const now = BigInt(clock);
    const canCommit = r.state === 1 && now < r.commitDeadline && !entered;
    const canReveal = r.state === 1 &&
        now >= r.commitDeadline &&
        now < r.revealDeadline &&
        entered &&
        !d.entry?.choice;
    const canClaim = r.state === 2 && entered && !d.entry?.claimed;
    const canRefund = r.state === 3 && entered && !d.entry?.claimed;
    const claimOrRefund = async (kind: "claim" | "refund") => action.run(async (update) => {
        setConfirmedPayout(undefined);
        const receipt = await runContractAction(w.wallet!, w.account!, "arena", kind, [d.id], update);
        for (const log of receipt.logs) {
            try {
                if (log.address.toLowerCase() !== ADDRESSES.arena)
                    continue;
                const event = decodeEventLog({
                    abi: ABIS.arena,
                    data: log.data,
                    topics: log.topics,
                });
                const args = event.args as {
                    player?: string;
                    amount?: bigint;
                    roundId?: bigint;
                };
                if (event.eventName === (kind === "claim" ? "Claimed" : "Refunded") &&
                    args.roundId === d.id &&
                    args.player?.toLowerCase() === w.account?.toLowerCase()) {
                    setConfirmedPayout({ amount: args.amount!, kind });
                    if (kind === "claim" && args.amount! > 100n * 10n ** 18n)
                        playTone(p.sound, true);
                }
            }
            catch { }
        }
    });
    const game = GAMES[r.mode] || GAMES[0];
    let body = "";
    try {
        if (d.pinned)
            body = hexToString(d.pinned.body);
    }
    catch {
        body = "Question body is binary; inspect the oracle contract.";
    }
    return (<article className={`round-card tx-${action.status?.stage || "idle"}`}>
      <div className="round-head">
        <h3>
          {game.name}{"· Round"}{d.id.toString()}
        </h3>
        <Badge tone={r.state === 2 ? "cyan" : r.state === 3 ? "yellow" : "violet"}>
          {["Unknown", "Open", "Settled", "Cancelled"][r.state]}
        </Badge>
      </div>
      <img className="round-art" src={art(`${game.id}.webp`)} alt={`${game.boss} game arena`} loading="lazy"/>
      <dl className="metric-list">
        <div>
          <dt>{"Funded prize"}</dt>
          <dd>{fmt(r.prize)}{" PRIO "}</dd>
        </div>
        <div>
          <dt>{"Entry"}</dt>
          <dd>{"102 PRIO · maximum loss 22 + gas"}</dd>
        </div>
        <div>
          <dt>{"Commit deadline"}</dt>
          <dd>{deadline(r.commitDeadline)} · {timeLeft(r.commitDeadline, clock)}</dd>
        </div>
        <div>
          <dt>{"Reveal deadline"}</dt>
          <dd>{deadline(r.revealDeadline)} · {timeLeft(r.revealDeadline, clock)}</dd>
        </div>
        <div>
          <dt>{"Result deadline"}</dt>
          <dd>{deadline(r.resultDeadline)}</dd>
        </div>
        <div>
          <dt>{"Entries / correct choices"}</dt>
          <dd>
            {r.entries.toString()} / {r.correct.toString()}
          </dd>
        </div>
        {r.mode === 2 && (<div>
            <dt>{"Boss threshold"}</dt>
            <dd>{r.bossThreshold}{"correct players"}</dd>
          </div>)}
        {r.state === 2 && (<div>
            <dt>{"Winning choice / prize share"}</dt>
            <dd>
              {r.winningChoice} / {fmt(r.prizePerWinner)}{" PRIO "}</dd>
          </div>)}
        <div>
          <dt>{"Your available payout"}</dt>
          <dd>{fmt(d.entry?.claimed ? 0n : d.payout)}{" PRIO "}</dd>
        </div>
      </dl>
      {body && (<div className="info-box">
          <strong>{"Pinned oracle question"}</strong>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {body}
          </p>
        </div>)}
      {entered ? (<p className="tiny">{"Your entry is recorded."}{" "}
          {d.entry?.choice
                ? `Revealed choice: ${d.entry.choice}.`
                : "Your choice has not been revealed."}{" "}
          {d.entry?.claimed ? "Payout already claimed." : ""}
        </p>) : canCommit ? (<>
          <div className="info-box"><strong>{"Before entering"}</strong><p>{"100 PRIO escrow + 2 PRIO fee; maximum loss 22 PRIO + gas. Export your secret backup. Do not miss the reveal deadline: "}{deadline(r.revealDeadline)}.</p></div>
          <h4>{"Choose your move"}</h4>
          <div className="round-choices">
            {Array.from({ length: r.choiceCount }, (_, i) => i + 1).map((n) => (<button key={n} aria-pressed={choice === n} disabled={!!secret} onClick={() => setChoice(n)}>{"Choice "}{n}
              </button>))}
          </div>
          <div className="action-row">
            <button className="button secondary" disabled={!w.account || !!secret} onClick={() => {
                try {
                    setSecret(createRevealSecret(w.account!, d.id, choice));
                    setBackedUp(false);
                }
                catch (e) {
                    action.setError(message(e));
                }
            }}>{"1. Save choice locally"}</button>
            {secret && (<button className="button secondary" onClick={() => downloadBackup(exportSecrets(w.account))}>
                <Download size={16}/>{"2. Export private backup"}</button>)}
          </div>
          {secret && (<label className="check-field">
              <input type="checkbox" checked={backedUp} onChange={(e) => setBackedUp(e.target.checked)}/>{"I saved the backup offline and understand that I must reveal before the deadline."}</label>)}
          <div className="action-row">
            <button className="button secondary" disabled={!ready(p) ||
                action.busy ||
                !secret ||
                !backedUp ||
                !p.operator?.ready} onClick={() => void action.run((update) => approveExact(w.wallet!, w.account!, ADDRESSES.arena, 102n * 10n ** 18n, update))}>{"3. Approve 102 PRIO"}</button>
            <button className="button primary" disabled={!ready(p) ||
                action.busy ||
                !secret ||
                !backedUp ||
                !p.operator?.ready ||
                (p.snapshot?.account?.arenaAllowance ?? 0n) < 102n * 10n ** 18n} onClick={() => void action.run((update) => {
                if (!secret)
                    throw new Error("Save and export a reveal backup first.");
                return runContractAction(w.wallet!, w.account!, "arena", "enter", [d.id, secret.commitment], update, { operatorProof: p.operator });
            })}>{"4. Enter paid round"}</button>
          </div>
        </>) : (<p className="tiny">{"The entry window is closed."}</p>)}
      {canCommit && !entered && <ActionRequirements p={p} busy={action.busy} reasons={[!secret && "Save a choice locally before approving or entering.", !!secret && "Choice controls are locked to the saved secret. Export the backup before entry.", !backedUp && "Export your private backup and select the backup confirmation checkbox.", !p.operator?.ready && "Paid entry and its approval need fresh signed operator readiness and funded game budgets.", (p.snapshot?.account?.arenaAllowance ?? 0n) < 102n * 10n ** 18n && "Enter paid round: approve exactly 102 PRIO first."]}/>}
      {canReveal && (<div className="info-box">
          <strong>{"It’s time to reveal."}</strong>
          <p>
            {secret
                ? "Your local backup is ready. Revealing publishes your choice and salt on-chain."
                : "Import your private backup below to recover your choice and salt."}
          </p>
          <button className="button primary" disabled={!recoveryReady(p) || !secret || action.busy} onClick={() => void action.run((update) => {
                if (!secret || secret.commitment !== d.entry?.commitment)
                    throw new Error("The local backup does not match your on-chain entry. Import the correct backup.");
                return runContractAction(w.wallet!, w.account!, "arena", "reveal", [d.id, secret.choice, secret.salt], update);
            })}>{"Reveal saved choice"}</button>
        </div>)}
      <div className="action-row">
        {canClaim && (<button className="button primary" disabled={!recoveryReady(p) || action.busy} onClick={() => void claimOrRefund("claim")}>{"Claim "}{fmt(d.entry?.claimed ? 0n : d.payout)}{" PRIO "}</button>)}
        {canRefund && (<button className="button primary" disabled={!recoveryReady(p) || action.busy} onClick={() => void claimOrRefund("refund")}>{"Refund 102 PRIO"}</button>)}
        {r.state === 1 && now >= r.revealDeadline && (<button className="button secondary" disabled={!recoveryReady(p) || action.busy || !d.result?.settled} onClick={() => void action.run((update) => runContractAction(w.wallet!, w.account!, "arena", "settle", [d.id], update))}>{"Settle oracle result"}</button>)}
        {r.state === 1 && now >= r.resultDeadline + 259200n && (<button className="button secondary" disabled={!recoveryReady(p) || action.busy || d.result?.settled} onClick={() => void action.run((update) => runContractAction(w.wallet!, w.account!, "arena", "cancel", [d.id], update))}>{"Cancel unresolved round"}</button>)}
      </div>
      <ActionRequirements p={p} busy={action.busy} recovery reasons={[canReveal && !secret && "Import the matching private reveal backup before revealing.", r.state === 1 && now >= r.revealDeadline && !d.result?.settled && "Settle oracle result: no settled oracle result is available. Refresh or check cancellation after the result deadline plus 3 days.", r.state === 1 && now >= r.resultDeadline + 259200n && !!d.result?.settled && "Cancellation is unavailable because a valid result is recorded. Settle and claim instead."]}/>
      <TransactionNotice action={action}/>
      {confirmedPayout && (<div className={confirmedPayout.kind === "claim" &&
                confirmedPayout.amount > 100n * 10n ** 18n
                ? "confirmed-prize"
                : "status-box"} role="status">
          {confirmedPayout.kind === "claim"
                ? "Claim confirmed"
                : "Cancellation refund confirmed"}
          : {fmt(confirmedPayout.amount)}{"PRIO. Verified in the transaction receipt."}</div>)}
      <details className="round-details">
        <summary>{"Scoring, refunds & oracle evidence"}</summary>
        <p>{"Correct: 100 PRIO returned plus an equal prize share. Wrong: 90 PRIO returned. Missed reveal: 80 PRIO returned. If the boss threshold is missed, correct players keep their 100 PRIO but no prize is paid. Ethereum gas is always separate."}</p>
        <p>{"An unresolved round can be cancelled only after"}{" "}
          {deadline(r.resultDeadline + 259200n)}{"and only if no valid result is on file. Cancellation unlocks a full 102 PRIO refund per entry. Claims and refunds remain round-indexed."}</p>
        <p>{"Rules hash:"}<span className="code">{r.rulesHash}</span>
        </p>
        <p>{"Question hash:"}<span className="code">{r.questionHash}</span>
        </p>
        <p>{"Frozen oracle:"}<ExplorerLink address={r.oracle}/>
        </p>
        {d.result?.settled ? (<>
            <p>{"Oracle answer:"}{d.result.answer.toString()}{"· agreeing panel:"}{" "}
              {d.result.agreed}
            </p>
            <p>{"Evidence block window:"}{d.result.fromBlock.toString()}–
              {d.result.toBlock.toString()}
            </p>
            <p>{"Request ID:"}<span className="code">{d.result.requestId}</span>
            </p>
            <p>{"Panel job ID:"}<span className="code">{d.result.panelJobId}</span>
            </p>
            <p>{"Evidence block hash:"}{" "}
              <span className="code">{d.result.blockHash}</span>
            </p>
          </>) : (<p>
            {d.evidenceError
                ? `Oracle evidence read failed: ${d.evidenceError}. Claims and refunds still use the Arena state.`
                : "No accepted oracle result is recorded for this round."}
          </p>)}
        <p>{"Round read at Ethereum block"}{d.blockNumber.toString()}.</p>
      </details>
    </article>);
}
