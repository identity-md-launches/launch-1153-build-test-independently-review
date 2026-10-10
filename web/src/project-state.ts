import { useCallback, useEffect, useState } from "react";
import { fetchOperatorStatus, type OperatorProof, type Snapshot } from "./chain";
import { message } from "./wallet";

export interface ProjectOperator {
  endpoint?: string;
  proof?: OperatorProof;
  error: string;
  loading: boolean;
  configured: boolean;
  refresh: () => void;
}
/** One published project endpoint. Player input and browser credentials are never used. */
export function useProjectOperator(snapshot?: Snapshot, stale = false): ProjectOperator {
  const [endpoint, setEndpoint] = useState<string>();
  const [configError, setConfigError] = useState("");
  const [proof, setProof] = useState<OperatorProof>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let disposed = false;
    fetch(`${import.meta.env.BASE_URL}project.json`, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(8000) })
      .then(async response => {
        if (!response.ok) throw new Error(`Project configuration: HTTP ${response.status}`);
        const config = await response.json();
        if (config.version !== 1 || (config.operatorStatusUrl !== null && typeof config.operatorStatusUrl !== "string")) throw new Error("Invalid project configuration");
        if (config.operatorStatusUrl) {
          const url = new URL(config.operatorStatusUrl);
          if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Operator endpoint must be public HTTPS without credentials");
        }
        if (!disposed) { setEndpoint(config.operatorStatusUrl || undefined); setConfigError(""); }
      }).catch(e => { if (!disposed) setConfigError(message(e)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [revision]);
  useEffect(() => {
    setProof(undefined);
    if (!endpoint || !snapshot || stale) return;
    let disposed = false;
    setLoading(true); setError("");
    void fetchOperatorStatus(endpoint, snapshot).then(result => { if (!disposed) setProof(result); })
      .catch(e => { if (!disposed) setError(message(e)); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [endpoint, snapshot?.blockNumber, stale, revision]);
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(() => { setProof(undefined); setError("Operator report expired. Refresh status."); }, Math.max(0, proof.signed.payload.expiresAt * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [proof]);
  return { endpoint, proof: stale ? undefined : proof, error: configError || error, loading, configured: !!endpoint, refresh };
}
export function useClock() {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setNow(Math.floor(Date.now() / 1000)); }, 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
export function timeLeft(deadline: bigint | undefined, now: number) {
  if (deadline === undefined) return "—";
  const seconds = Math.max(0, Number(deadline) - now);
  const days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
  return `${days ? days + "d " : ""}${hours.toString().padStart(2,"0")}:${minutes.toString().padStart(2,"0")}:${(seconds % 60).toString().padStart(2,"0")}`;
}
