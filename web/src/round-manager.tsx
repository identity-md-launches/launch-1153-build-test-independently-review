import { useEffect, useState } from "react";
import { parseEther, stringToHex, type Hex } from "viem";
import { ADDRESSES, sameAddress, readValue, type PinnedQuestion } from "./chain";
import { executeRoundStep, pinMatches, roundRules, rulesHash, validateRoundDraft, type RoundDraft } from "./chain/round-admin";
import { type PanelProps, ActionRequirements, ready, ConnectGate, SnapshotNote, TransactionNotice, useAction } from "./panel-common";
import { type ProjectOperator } from "./project-state";
import { Badge, DownloadButton, fmt } from "./ui";
export function RoundManager(p: PanelProps & {
    operator: ProjectOperator;
}) {
    const s = p.snapshot, w = p.wallet;
    const [fields, setFields] = useState<Record<string, string>>(() => { try {
        const saved = JSON.parse(localStorage.getItem("prism-owner-round-draft-v1") || "null");
        if (saved && typeof saved === "object" && !Array.isArray(saved) && Object.values(saved).every(v => typeof v === "string"))
            return saved;
    }
    catch { } return { mode: "0", source: "owner" }; });
    const [reviewed, setReviewed] = useState(false);
    const [prepared, setPrepared] = useState<RoundDraft>();
    const [pin, setPin] = useState<PinnedQuestion>();
    const action = useAction(p.refresh);
    useEffect(() => { try {
        localStorage.setItem("prism-owner-round-draft-v1", JSON.stringify(fields));
    }
    catch { } }, [fields]);
    const owner = !!w.account && sameAddress(w.account, ADDRESSES.owner);
    const update = (key: string, value: string) => { setFields(f => ({ ...f, [key]: value })); setReviewed(false); setPrepared(undefined); };
    useEffect(() => { let disposed = false; if (s)
        void readValue<PinnedQuestion>("adapter", "pinned", [s.arena.roundCount + 1n]).then(value => { if (!disposed)
            setPin(value); }).catch(() => { if (!disposed)
            setPin(undefined); }); return () => { disposed = true; }; }, [s?.blockNumber]);
    const build = () => {
        if (!s)
            throw new Error("Refresh chain state first.");
        const integer = (key: string) => { if (!/^\d+$/.test(fields[key] || ""))
            throw new Error(`${key}: enter a whole number.`); return Number(fields[key]); };
        const utc = (key: string) => { const value = Date.parse((fields[key] || "") + "Z"); if (!Number.isFinite(value))
            throw new Error("Enter all three UTC deadlines."); return BigInt(Math.floor(value / 1000)); };
        if (!fields.body?.trim())
            throw new Error("Enter the exact operator-reviewed Intake JSON body.");
        const json = JSON.parse(fields.body);
        if (!json || Array.isArray(json) || typeof json !== "object")
            throw new Error("Intake body must be a JSON object");
        const d: RoundDraft = { id: s.arena.roundCount + 1n, mode: integer("mode"), choiceCount: integer("choices"), commitDeadline: utc("commit"), revealDeadline: utc("reveal"), resultDeadline: utc("result"), prize: parseEther(fields.prize || ""), bossThreshold: fields.mode === "2" ? integer("threshold") : 0, questionHash: fields.questionHash as Hex, minPanel: integer("panel"), minQuorum: integer("quorum"), body: stringToHex(fields.body), source: fields.source === "imd" ? "imd" : "owner", proposalId: fields.proposalId || "" };
        validateRoundDraft(d, s);
        return d;
    };
    if (!owner)
        return <div className="panel"><h3>{"Project owner only"}</h3><p>{"Connect the verified owner wallet to manage rounds. Other wallets cannot transact here."}</p><ConnectGate wallet={w}/></div>;
    const pinned = !!prepared && !!pin && !!s && pinMatches(pin, prepared, s);
    const operational = ready(p) && !!s?.operationsReady && !!p.operator.proof?.serviceReady;
    return <div className="panel"><p className="panel-intro">{"A new round requires two signatures: pin the question, then create the round with the same commit deadline. Each transaction is simulated, receipt-checked and read back. Existing rules cannot change."}</p><ConnectGate wallet={w}/>
    <div className="info-box"><strong>{"Next round"}: {s ? (s.arena.roundCount + 1n).toString() : "—"} · {"Available prize"}: {fmt(s?.arena.unallocatedPrizePool)} PRIO</strong><p>{!operational ? "Complete Phase B, fee-funded operating budgets, IMD payment and signed operator readiness first. Without funding, only free practice operates." : "Operating checks passed. Prepare the draft with a reviewed question and available prize budget."}</p><button className="text-button" onClick={p.onReadiness}>{"Go to readiness details"}</button></div>
    <ol className="round-sequence"><li>{"Review the question and immutable scoring"}</li><li>OracleAdapter.pinQuestion</li><li>Arena.createRound</li></ol>
    <div className="panel-grid"><label className="field">{"Game"}<select value={fields.mode} onChange={e => update("mode", e.target.value)}><option value="0">Vault Raid</option><option value="1">Faction Duel</option><option value="2">Prism Colossus</option></select></label><label className="field">{"Content source"}<select value={fields.source} onChange={e => update("source", e.target.value)}><option value="owner">{"Owner-reviewed question"}</option><option value="imd">{"Operator-reviewed IMD proposal"}</option></select></label>
      {[["choices", "Choice count (Duel: 2)"], ["prize", "Funded prize (PRIO)"], ["panel", "Minimum panel (≥ 2)"], ["quorum", "Minimum quorum (≥ 2)"], ...(fields.mode === "2" ? [["threshold", "Correct-player threshold"]] : [])].map(([key, label]) => <label key={key} className="field">{label}<input name={`round-${key}`} inputMode={key === "prize" ? "decimal" : "numeric"} value={fields[key] || ""} onChange={e => update(key, e.target.value)}/></label>)}
      {[["commit", "Commit deadline (UTC)"], ["reveal", "Reveal deadline (UTC)"], ["result", "Result deadline (UTC)"]].map(([key, label]) => <label className="field" key={key}>{label}<input type="datetime-local" name={`round-${key}`} value={fields[key] || ""} onChange={e => update(key, e.target.value)}/></label>)}
    </div>
    <label className="field">{"Reviewed canonical question hash (bytes32)"}<input value={fields.questionHash || ""} name="question-hash" spellCheck={false} onChange={e => update("questionHash", e.target.value)}/><small>{"Obtain from the protocol check/quote review. Never substitute a guessed hash or a body hash."}</small></label>
    <label className="field">{"Exact Intake body to publish (JSON)"}<textarea name="question-body" value={fields.body || ""} rows={6} spellCheck={false} onChange={e => update("body", e.target.value)}/><small>{"Publish the question and option meanings here. pinQuestion makes this content public; do not include secrets or API credentials."}</small></label>
    {fields.source === "imd" && <label className="field">{"Reviewed proposal ID in signed status"}<input name="proposal-id" value={fields.proposalId || ""} onChange={e => update("proposalId", e.target.value)}/><small>{"Question, body and rules hashes must match the operator report. Owner approval applies only to this future round."}</small></label>}
    <button className="button secondary" disabled={action.busy} onClick={() => void action.run(async () => { setPrepared(build()); setReviewed(false); })}>{"Validate and review draft"}</button>
    {prepared && <div className="sub-panel"><Badge tone={pinned ? "cyan" : "yellow"}>{pinned ? "Pinned question matches" : "This draft is not pinned yet"}</Badge><p>{"Entry: 100 escrow + 2 fee; maximum loss 22 PRIO + gas. Correct: 100 + prize share, wrong: 90, missed reveal: 80, cancellation: 102. Boss threshold is immutable."}</p><p className="code">rulesHash: {rulesHash(prepared)}</p><details className="rules"><summary>{"Published immutable rules"}</summary><pre className="code">{JSON.stringify(JSON.parse(roundRules(prepared)), null, 2)}</pre></details><DownloadButton filename={`prism-round-${prepared.id}-rules.json`} data={roundRules(prepared)}>{"Download rules document"}</DownloadButton><label className="check-field"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/>{"I reviewed the question, choices, exact protocol body, scoring, UTC deadlines and actual prize budget. I approve ETH gas and two signatures. Rules lock when this future round opens."}</label><div className="action-row"><button className="button secondary" disabled={!operational || !reviewed || action.busy || pinned} onClick={() => void action.run(async (update) => { await executeRoundStep(w.wallet!, w.account!, prepared, "pin", p.operator.proof, update); setPin(await readValue<PinnedQuestion>("adapter", "pinned", [prepared.id])); })}>{"1. Pin question"}</button><button className="button primary" disabled={!operational || !reviewed || action.busy || !pinned} onClick={() => void action.run(async (update) => { await executeRoundStep(w.wallet!, w.account!, prepared, "create", p.operator.proof, update); setPrepared(undefined); setReviewed(false); })}>{"2. Create funded round"}</button></div></div>}
    <ActionRequirements p={p} busy={action.busy} reasons={[!operational && "Pinning and creation require verified configuration, fee-funded budgets and a signed ready operator. Open game operating diagnostics for each missing requirement.", !!prepared && !reviewed && "Review the prepared rules and select the confirmation checkbox.", !!prepared && !pinned && "Create funded round: first confirm the matching pinned question.", !!prepared && pinned && "Pin question: this draft is already pinned; continue to Create funded round."]}/>
    <TransactionNotice action={action}/><SnapshotNote {...p}/><p className="tiny">{"Existing contracts enforce player deposits, refunds, prize accounting and spend caps. No new contract is deployed."}</p>
  </div>;
}
