import { t, tx } from "./i18n";
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
export function ConnectGate({ wallet: w }: Pick<PanelProps, "wallet">) {
  return !w.account ? (
    <div className="info-box">
      <p>{tx('Connect your wallet to use this action.')}</p>
      <button
        className="button secondary"
        onClick={() => void w.connect()}
        disabled={w.connecting}
      >
        <Wallet size={17} />
        {w.connecting ? tx("Waiting for wallet…") : tx("Connect wallet")}
      </button>
      {w.error && (
        <p role="alert" className="inline-error">
          {w.error}
        </p>
      )}
    </div>
  ) : w.chainId !== 1 ? (
    <div className="info-box">
      <p>{tx('Your wallet is on a different network.')}</p>
      <button
        className="button secondary"
        onClick={() => void w.switchNetwork()}
      >{tx("Switch to Ethereum")}</button>
      {w.error && (
        <p role="alert" className="inline-error">
          {w.error}
        </p>
      )}
    </div>
  ) : null;
}
export function useAction(refresh?: () => Promise<void>) {
  const [status, setStatus] = useState<TransactionStatus>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const run = async (
    task: (update: (s: TransactionStatus) => void) => Promise<unknown>,
  ) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setError("");
    setStatus(undefined);
    setBusy(true);
    try {
      const r = await task(setStatus);
      await refresh?.();
      return r;
    } catch (e) {
      setError(message(e));
      setStatus((previous) => (previous?.hash ? previous : undefined));
      return undefined;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { status, error, busy, run, setError, setStatus };
}
export function TransactionNotice({
  action,
}: {
  action: ReturnType<typeof useAction>;
}) {
  const labels = {
    simulating: "Checking this transaction on Ethereum",
    wallet: "Review and confirm in your wallet",
    pending: "Submitted · waiting for a receipt",
    confirmed: "Transaction confirmed",
  };
  return (
    <>
      {action.status && (
        <div className="status-box" role="status">
          <div>
            {action.status.stage === "confirmed" ? (
              <CheckCircle2 size={17} />
            ) : action.busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : null}
            <strong>
              {action.error && action.status.stage !== "confirmed"
                ? tx("Confirmation unavailable · inspect the receipt")
                : tx(labels[action.status.stage])}
            </strong>
          </div>
          <span>{action.status.label}</span>
          {action.status.hash && (
            <div>
              <ExplorerLink
                address={action.status.hash}
                tx
                label={tx("View transaction receipt")}
              />
            </div>
          )}
        </div>
      )}
      {action.error && (
        <div className="inline-error" role="alert">
          {t("İşlem tamamlanamadı. Ayrıntı: ", "Action could not be completed. Details: ")}{tx(action.error)}
        </div>
      )}
    </>
  );
}
export const ready = (p: PanelProps) =>
  !!p.wallet.account &&
  !!p.wallet.wallet &&
  p.wallet.chainId === 1 &&
  !!p.snapshot?.verified &&
  !p.stale;
export function SnapshotNote({
  snapshot,
  stale,
}: Pick<PanelProps, "snapshot" | "stale">) {
  return (
    <p className="tiny">
      {snapshot
        ? `Ethereum · ${t("blok", "block")} ${snapshot.blockNumber} · ${new Date(snapshot.timestamp * 1000).toISOString()}`
        : t("Doğrulanmış Ethereum verisi bekleniyor.", "Waiting for verified Ethereum state.")}
      {stale ? t(" · Son okuma başarısız; yenile.", " · Refresh required: the last read failed.") : ""}
      {snapshot && !snapshot.verified
        ? t(" · Doğrulama başarısız. Yeni ücretli işlemler kapalı; kurtarma işlemleri kendi hedefini doğrular.", " · Verification failed. New paid actions are disabled; recovery actions verify their own target.")
        : ""}
    </p>
  );
}

/** Recovery calls verify their own target at execution and stay reachable during unrelated setup failures. */
export const recoveryReady = (p: PanelProps) =>
  !!p.wallet.account && !!p.wallet.wallet && p.wallet.chainId === 1;
