import { useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Wallet } from "lucide-react";
import { type Snapshot, type TransactionStatus } from "./chain";
import { useWallet, message } from "./wallet";
import { ExplorerLink } from "./ui";
export interface PanelProps {
    snapshot?: Snapshot;
    refresh: () => Promise<void>;
    wallet: ReturnType<typeof useWallet>;
    stale: boolean;
    onReadiness?: () => void;
}
export function WalletChoices({ wallet: w }: Pick<PanelProps, "wallet">) {
  return w.providers.length > 1 ? <label className="field">Wallet provider<select value={w.selected} onChange={e => w.selectProvider(e.target.value)}>{w.providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : null;
}
export function ConnectGate({ wallet: w }: Pick<PanelProps, "wallet">) {
    return !w.account || !w.wallet ? (<div className="info-box">
      <p>{w.account ? "Wallet client is missing. Reconnect to continue." : "Connecting requests account access only. It never requests a payment or approval."}</p><WalletChoices wallet={w}/>
      <button className="button secondary" onClick={() => void w.connect()} disabled={w.connecting}>
        <Wallet size={17}/>
        {w.connecting ? "Waiting for wallet…" : "Connect wallet"}
      </button>
      {w.error && (<p role="alert" className="inline-error">
          {w.error}
        </p>)}
    </div>) : w.chainId !== 1 ? (<div className="info-box">
      <p>{'Your wallet is on a different network.'}</p>
      <button className="button secondary" onClick={() => void w.switchNetwork()}>{"Switch to Ethereum"}</button>
      {w.error && (<p role="alert" className="inline-error">
          {w.error}
        </p>)}
    </div>) : null;
}
export function useAction(refresh?: () => Promise<void>) {
    const [status, setStatus] = useState<TransactionStatus>();
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const run = async (task: (update: (s: TransactionStatus) => void) => Promise<unknown>) => {
        if (inFlight.current)
            return undefined;
        inFlight.current = true;
        setError("");
        setStatus(undefined);
        setBusy(true);
        try {
            const r = await task(setStatus);
            await refresh?.();
            return r;
        }
        catch (e) {
            setError(message(e));
            setStatus((previous) => (previous?.hash ? previous : undefined));
            return undefined;
        }
        finally {
            inFlight.current = false;
            setBusy(false);
        }
    };
    return { status, error, busy, run, setError, setStatus };
}
export function TransactionNotice({ action, }: {
    action: ReturnType<typeof useAction>;
}) {
    const labels = {
        simulating: "Checking this transaction on Ethereum",
        wallet: "Review and confirm in your wallet",
        pending: "Submitted · waiting for a receipt",
        confirmed: "Transaction confirmed",
    };
    return (<>
      {action.status && (<div className="status-box" role="status">
          <div>
            {action.status.stage === "confirmed" ? (<CheckCircle2 size={17}/>) : action.busy ? (<LoaderCircle className="spin" size={17}/>) : null}
            <strong>
              {action.error && action.status.stage !== "confirmed"
                ? "Confirmation unavailable · inspect the receipt"
                : labels[action.status.stage]}
            </strong>
          </div>
          <span>{action.status.label}</span>
          {action.status.hash && (<div>
              <ExplorerLink address={action.status.hash} tx label={"View transaction receipt"}/>
            </div>)}
        </div>)}
      {action.error && (<div className="inline-error" role="alert">
          {"Action could not be completed. Details: "}{action.error}
        </div>)}
    </>);
}
export const ready = (p: PanelProps) => !!p.wallet.account &&
    !!p.wallet.wallet &&
    p.wallet.chainId === 1 &&
    !!p.snapshot?.verified &&
    !p.stale;
export function SnapshotNote({ snapshot, stale, }: Pick<PanelProps, "snapshot" | "stale">) {
    return (<p className="tiny">
      {snapshot
            ? `Ethereum · ${"block"} ${snapshot.blockNumber} · ${new Date(snapshot.timestamp * 1000).toISOString()}`
            : "Waiting for verified Ethereum state."}
      {stale ? " · Refresh required: the last read failed." : ""}
      {snapshot && !snapshot.verified
            ? " · Verification failed. New paid actions are disabled; recovery actions verify their own target."
            : ""}
    </p>);
}
/** Recovery calls verify their own target at execution and stay reachable during unrelated setup failures. */
export const recoveryReady = (p: PanelProps) => !!p.wallet.account && !!p.wallet.wallet && p.wallet.chainId === 1;

/** All shared prerequisites remain visible beside their action, with a retry path. */
export function panelBlockers(p: PanelProps, recovery = false) {
  const reasons: string[] = [];
  if (!p.wallet.account) reasons.push("Connect your wallet to continue.");
  else {
    if (!p.wallet.wallet) reasons.push("The wallet client is missing. Reconnect your wallet.");
    if (p.wallet.chainId !== 1) reasons.push("Switch your wallet to Ethereum.");
  }
  if (!recovery) {
    if (!p.snapshot) reasons.push("Loading verified Ethereum data. Refresh if this does not finish.");
    if (p.stale) reasons.push("The last RPC read failed; previous values are stale. Refresh to retry both providers.");
    if (p.snapshot && !p.snapshot.verified) reasons.push(...p.snapshot.verificationErrors.map(e => `Verification failed: ${e}`));
  }
  return reasons;
}
export function ActionRequirements({ p, reasons = [], busy = false, recovery = false }: { p: PanelProps; reasons?: (string | false | undefined)[]; busy?: boolean; recovery?: boolean }) {
  const all = [...panelBlockers(p, recovery), ...reasons, busy && "An action is in progress. Follow its status and wait for it to finish."].filter(Boolean) as string[];
  return all.length ? <div className="action-help"><ul>{[...new Set(all)].map(reason => <li key={reason}>{reason}</li>)}</ul>{!recovery && (!p.snapshot || p.stale || !p.snapshot.verified) && <button className="text-button" onClick={() => void p.refresh()}>Refresh verified state</button>}</div> : null;
}
