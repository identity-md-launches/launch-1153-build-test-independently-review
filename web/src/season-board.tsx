import { useEffect, useRef, useState } from "react";
import { Trophy, Award, ArrowUpRight } from "lucide-react";
import { hexToString } from "viem";
import type { Snapshot, RoundSnapshot } from "./chain";
import { rankClaims, readSeason, type SeasonResult } from "./chain/seasons";
import { localPractice, GAMES } from "./practice";
import { Badge, ExplorerLink, fmt } from "./ui";
import { message } from "./wallet";
export function SeasonBoard({ snapshot: s, stale, rounds, onLive }: {
    snapshot?: Snapshot;
    stale: boolean;
    rounds: RoundSnapshot[];
    onLive: () => void;
}) {
    const [season, setSeason] = useState(new Date().toISOString().slice(0, 7));
    const [data, setData] = useState<SeasonResult>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [practice, setPractice] = useState(localPractice);
    const abort = useRef<AbortController | undefined>(undefined);
    useEffect(() => { const onPractice = () => setPractice(localPractice()); window.addEventListener("prism-practice", onPractice); return () => { window.removeEventListener("prism-practice", onPractice); abort.current?.abort(); }; }, []);
    const ranks = rankClaims(data?.claims || []);
    const load = async () => {
        abort.current?.abort();
        const controller = new AbortController();
        abort.current = controller;
        setBusy(true);
        setError("");
        setData(undefined);
        try {
            const result = await readSeason(season, controller.signal);
            if (!controller.signal.aborted)
                setData(result);
        }
        catch (e) {
            if (!controller.signal.aborted)
                setError(message(e));
        }
        finally {
            if (!controller.signal.aborted)
                setBusy(false);
        }
    };
    return <section className="section" id="seasons"><div className="section-heading"><div><p className="eyebrow">03 / {"SEASONS & CHALLENGES"}</p><h2>{"REAL RESULTS."} <em>{"OPEN RECORD."}</em></h2></div><Trophy size={32}/></div>
    <div className="season-layout"><div className="sub-panel"><h3>{"PRIO seasonal leaderboard"}</h3><p>{"UTC calendar months. Rank by verified Arena Claimed prize shares = max(payout − 100 PRIO, 0). Returned escrow and practice scores are excluded."}</p><label className="field">{"Season (UTC)"}<input type="month" name="season" min="2026-10" max={new Date().toISOString().slice(0, 7)} value={season} onChange={e => { abort.current?.abort(); setBusy(false); setSeason(e.target.value); setData(undefined); setError(""); }}/></label><button className="button secondary" disabled={busy || !s?.verified || stale} onClick={() => void load()}>{busy ? "Verifying finalized records…" : "Verify season"}</button>
      {(!s?.verified || stale) && <p className="action-help">Season verification needs current, verified Ethereum reads. Use Refresh status in game operating diagnostics below, then retry.</p>}
      {error && <p className="inline-error" role="alert">{"History unavailable; no ranking was generated. Retry. "}{error}</p>}
      {!data && <div className="empty-state"><Trophy size={28}/><h4>{s?.arena.roundCount === 0n && !stale ? "No real rounds or prizes yet." : "Verify season records."}</h4><p>{"No invented players, scores or prizes."}</p></div>}
      {data && <><p className="tiny">{data.start.slice(0, 10)} ≤ UTC &lt; {data.end.slice(0, 10)} · {"Finalized blocks"}: {data.fromBlock.toString()}–{data.throughBlock.toString()}</p>{ranks.length ? <div className="table-wrap"><table><thead><tr><th>#</th><th>{"Player / badge"}</th><th>{"Prize PRIO"}</th><th>{"Evidence"}</th></tr></thead><tbody>{ranks.map((r, i) => <tr key={r.player}><td>{i + 1}</td><td><ExplorerLink address={r.player}/><br /><Badge tone="cyan">{r.prize > 0n ? "Funded prize claimed" : "First real claim"}</Badge></td><td>{fmt(r.prize, 6)}</td><td><ExplorerLink tx address={r.receipts[0]} label={"Receipt"}/></td></tr>)}</tbody></table></div> : <div className="empty-state">{"No verified claims in this season. The leaderboard is empty."}</div>}</>}
      <details className="rules"><summary>{"Scoring and badge evidence"}</summary><p>{"Only finalized blocks are scanned. Each event is checked against its contract, successful receipt, canonical block hash and Arena payout. Ties use address order. Refund events earn no points. Incomplete reads never publish a partial ranking."}</p><p>{"Badges are informational; they have no token value or new reward rights."}</p></details>
    </div><div className="challenge-column"><div className="sub-panel"><h3>{"New challenges"}</h3><p>{"Paid challenges come only from published on-chain questions and locked rules. IMD proposals require real operator review and owner approval for a future round."}</p>{rounds.length ? rounds.slice(0, 3).map(r => <div className="challenge" key={r.id.toString()}><strong>{GAMES[r.round.mode]?.name} · #{r.id.toString()}</strong><p>{(() => { try {
        return r.pinned ? hexToString(r.pinned.body).slice(0, 240) : "Question data unavailable.";
    }
    catch {
        return "Inspect the binary question body in round details.";
    } })()}</p><button className="text-button" onClick={onLive}>{"View rules and deadlines"}<ArrowUpRight size={16}/></button></div>) : <div className="empty-state"><p>{"No published round. Next: owner setup, operator readiness and prize funding."}</p></div>}</div>
      <div className="sub-panel"><h3><Award size={20}/> {"Local practice badge"}</h3><p>{"Challenge: complete one practice in each game. You do not need a correct result. This is only a learning record on your device."}</p><div className="local-badges">{GAMES.map(g => <Badge key={g.id} tone={practice.includes(g.id) ? "cyan" : "muted"}>{g.name} · {practice.includes(g.id) ? "Completed" : "Not tried"}</Badge>)}</div><p className="tiny">{"Local records never enter verified rankings. Badges confer no tokens or reward rights."}</p><a className="text-button" href="#arcade">{"Start the free challenge →"}</a></div>
    </div></div>
  </section>;
}
