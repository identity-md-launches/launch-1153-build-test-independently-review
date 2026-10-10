import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { ADDRESSES, readActivity, runContractAction, type ActivityEvent } from "./chain";
import { ExplorerLink, fmt } from "./ui";
import { ActionRequirements, ConnectGate, ready, SnapshotNote, TransactionNotice, useAction, type PanelProps } from "./panel-common";
export { SwapPanel, StakePanel } from "./financial-panels";

export function EconomyPanel(p: PanelProps) {
    const s = p.snapshot;
    const [events, setEvents] = useState<ActivityEvent[]>();
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const action = useAction(p.refresh);
    useEffect(() => {
        if (s && !to) {
            setTo(s.blockNumber.toString());
            setFrom((s.blockNumber > 26154915n
                ? s.blockNumber - 26154915n > 50000n
                    ? s.blockNumber - 50000n
                    : 26154915n
                : 26154915n).toString());
        }
    }, [s, to]);
    return (<div className="panel">
      <p className="panel-intro">{"Follow the fee-funded economy directly from deployed state and events. Figures are on-chain balances and allocations, not projected earnings."}</p>
      <div className="panel-grid">
        <div className="sub-panel">
          <h3>{"Where swap fees go"}</h3>
          <p>{"The immutable hook collects 0.5% of the ETH leg. Treasury allocation first fills the gas reserve, capped at 10% of income and the owner-set reserve target (maximum 2 ETH). Remaining funds split:"}</p>
          <dl className="metric-list">
            <div>
              <dt>{"IMD for oracle work"}</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>{"PRIO purchases"}</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>{"Owner allocation"}</dt>
              <dd>40%</dd>
            </div>
          </dl>
          <p>{"Purchased PRIO splits equally between staking and games. Until purchases and funding happen, rewards remain unfunded."}</p>
        </div>
        <div className="sub-panel">
          <h3>{"Live treasury"}</h3>
          <dl className="metric-list">
            <div>
              <dt>{"Total fee income"}</dt>
              <dd>{fmt(s?.treasury.totalIncome, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"Unallocated income"}</dt>
              <dd>{fmt(s?.treasury.unallocated, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"Gas reserve"}</dt>
              <dd>{fmt(s?.treasury.reserve, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"IMD purchase budget"}</dt>
              <dd>{fmt(s?.treasury.imdBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"PRIO purchase budget"}</dt>
              <dd>{fmt(s?.treasury.prioBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"Owner budget"}</dt>
              <dd>{fmt(s?.treasury.ownerBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"Hook ETH awaiting delivery"}</dt>
              <dd>{fmt(s?.hook.pendingEth, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{"Hook ETH claims"}</dt>
              <dd>{fmt(s?.hook.pendingClaims, 8)}{" ETH "}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="info-box">
        <strong>{"Agent activity requires a real operator feed."}</strong>
        <p>{"This static website does not host the server operator or make paid IMD API calls. The project uses one public endpoint for fresh, executor-signed status reports, configured when the separate server is available. No activity is invented when that feed is absent."}</p>
      </div>
      <h3>{"On-chain activity"}</h3>
      <p className="tiny" style={{ marginTop: 10 }}>{"Choose an Ethereum block window (maximum 50,000 blocks). Seasonal prize rankings are available in the lobby; these event records are not a profit ranking."}</p>
      <div className="panel-grid">
        <label className="field">{"From block"}<input name="from-block" inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value)}/>
        </label>
        <label className="field">{"Through block"}<input name="to-block" inputMode="numeric" value={to} onChange={(e) => setTo(e.target.value)}/>
        </label>
      </div>
      <button className="button secondary" disabled={action.busy || !s?.verified || p.stale} onClick={() => void action.run(async () => {
            if (!/^\d+$/.test(from) || !/^\d+$/.test(to))
                throw new Error("Enter whole block numbers.");
            setEvents(await readActivity(BigInt(from), BigInt(to)));
        })}>
        {action.busy ? "Reading event logs…" : "Load real activity"}
        <Radio size={16}/>
      </button>
      {(!s?.verified || p.stale) && <p className="action-help">Activity reads need verified, current Ethereum data. Refresh below to retry.</p>}
      <TransactionNotice action={action}/>
      {events && (<>
          <h4>{"Contract events ·"}{events.length}</h4>
          {events.length ? (<ul className="event-list">
              {[...events]
                    .reverse()
                    .slice(0, 100)
                    .map((e) => (<li key={`${e.transactionHash}-${e.logIndex}`}>
                    <span>
                      <strong>{e.name}</strong> · {e.contract}{"· block"}{" "}
                      {e.blockNumber.toString()}
                    </span>
                    <ExplorerLink address={e.transactionHash} tx label={"Receipt"}/>
                    <details>
                      <summary>{"Event data"}</summary>
                      <pre className="code">
                        {JSON.stringify(e.args, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2)}
                      </pre>
                    </details>
                  </li>))}
            </ul>) : (<p className="tiny">{"No events were returned in the selected window. Try a wider window within the 50,000-block limit."}</p>)}
        </>)}
      <h4>{"Fee delivery · permissionless maintenance"}</h4>
      <p className="tiny">{"These calls move already-collected hook fees into the treasury and allocate received income. They do not create rewards by themselves."}</p>
      <ConnectGate wallet={p.wallet}/>
      <div className="action-row">
        <button className="button secondary" disabled={!ready(p) ||
            action.busy ||
            !s?.phaseAComplete ||
            !s?.hook.pendingEth} onClick={() => void action.run((update) => runContractAction(p.wallet.wallet!, p.wallet.account!, "hook", "flush", [], update))}>{"Flush pending ETH"}</button>
        <button className="button secondary" disabled={!ready(p) ||
            action.busy ||
            !s?.phaseAComplete ||
            !s?.treasury.unallocated} onClick={() => void action.run((update) => runContractAction(p.wallet.wallet!, p.wallet.account!, "treasury", "allocate", [], update))}>{"Allocate received fees"}</button>
      </div>
      <ActionRequirements p={p} busy={action.busy} reasons={[!s?.phaseAComplete && "Fee delivery needs the existing Phase A bindings. The owner can review them in Founder / Admin.", s?.hook.pendingEth === 0n && "Flush pending ETH: there is no pending ETH to flush.", s?.treasury.unallocated === 0n && "Allocate received fees: there is no unallocated fee income."]}/>
      <SnapshotNote {...p}/>
    </div>);
}
