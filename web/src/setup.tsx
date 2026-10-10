import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  encodeFunctionData,
  isAddress,
  parseEther,
  zeroAddress,
  type Address,
} from "viem";
import {
  ABIS,
  ADDRESSES,
  executePhaseAStep,
  executePhaseBCall,
  ORACLE_ACTION,
  phaseAPlan,
  readPhaseBProtocol,
  sameAddress,
  VERIFIED_INTAKE,
  type PhaseBProtocol,
} from "./chain";
import { Badge, DownloadButton, ExplorerLink, fmt } from "./ui";
import {
  ConnectGate,
  ready,
  SnapshotNote,
  TransactionNotice,
  useAction,
  type PanelProps,
} from "./panel-common";
const B_OPTIONS = [
  ["treasury", "setReserveTarget", "Reserve target (ETH)"],
  ["treasury", "setMaxSpendPerSwap", "Maximum spend per swap (ETH)"],
  ["treasury", "setSpendPerWindow", "Purchase budget per window (ETH)"],
  ["treasury", "setReservePerWindow", "Executor gas draw per window (ETH)"],
  ["treasury", "setPriceFloors", "Minimum token output per ETH"],
  ["treasury", "setImd", "IMD asset binding"],
  ["treasury", "setImdPool", "ETH / IMD pool key"],
  ["adapter", "setIntake", "Intake contract"],
  ["adapter", "setAction", "Oracle action"],
  ["adapter", "setPayment", "Oracle payment price (IMD)"],
  ["adapter", "setCallbackConfigured", "Callback enabled"],
  ["adapter", "setBudget", "Oracle budget per window (IMD)"],
  ["treasury", "setExecutor", "Treasury executor wallet"],
  ["adapter", "setExecutor", "Adapter executor wallet"],
] as const;
export function OwnerPanel(p: PanelProps) {
  const { snapshot: s, wallet: w } = p;
  const [tab, setTab] = useState<"a" | "b">("a");
  const [ack, setAck] = useState<Record<number, boolean>>({});
  const [protocol, setProtocol] = useState<PhaseBProtocol>();
  const [option, setOption] = useState(0);
  const [fields, setFields] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const action = useAction(p.refresh);
  const owner = !!w.account && sameAddress(w.account, ADDRESSES.owner);
  const plan = s ? phaseAPlan(s) : [];
  const [target, method, label] = B_OPTIONS[option];
  const setField = (index: number, value: string) => {
    setFields((old) => {
      const a = [...old];
      a[index] = value;
      return a;
    });
    setReviewed(false);
  };
  const changeOption = (n: number) => {
    setOption(n);
    setFields([]);
    setReviewed(false);
  };
  const args = (): readonly unknown[] => {
    const positive = (v: string) => {
      const n = parseEther(v);
      if (n < 0n) throw new Error("Enter a nonnegative amount.");
      return n;
    };
    const address = (v: string) => {
      if (!isAddress(v) || v === zeroAddress)
        throw new Error(
          "Enter the actual deployed address or operator wallet.",
        );
      return v;
    };
    switch (method) {
      case "setPriceFloors":
        return [positive(fields[0] || ""), positive(fields[1] || "")];
      case "setImd":
        return [ADDRESSES.imd];
      case "setImdPool": {
        if (
          !/^\d+$/.test(fields[0] || "") ||
          !/^\d+$/.test(fields[1] || "") ||
          !isAddress(fields[2] || "")
        )
          throw new Error(
            "Enter a reviewed pool fee, tick spacing and hook address (zero only for a verified hookless pool).",
          );
        return [Number(fields[0]), Number(fields[1]), fields[2]];
      }
      case "setIntake":
        return [address(fields[0] || "")];
      case "setAction":
        return [ORACLE_ACTION];
      case "setPayment":
        return [ADDRESSES.imd, positive(fields[0] || "")];
      case "setCallbackConfigured": {
        if (fields[0] !== "true" && fields[0] !== "false")
          throw new Error("Select whether the callback is enabled.");
        return [fields[0] === "true"];
      }
      case "setExecutor":
        return [address(fields[0] || "")];
      default:
        return [positive(fields[0] || "")];
    }
  };
  let prepared: string | undefined;
  try {
    prepared = encodeFunctionData({
      abi: ABIS[target],
      functionName: method,
      args: args(),
    });
  } catch {}
  return (
    <div className="panel">
      <p className="panel-intro">
        Setup uses the existing contracts only. Each step is simulated, shown to
        the owner’s wallet, and checked after its receipt. Prepared calldata
        does not mean a transaction has executed.
      </p>
      <div className="info-box">
        <strong>Project owner</strong>
        <p>
          <ExplorerLink address={ADDRESSES.owner} label={ADDRESSES.owner} />
        </p>
        <p>
          {owner
            ? "Connected owner wallet. Review each transaction separately."
            : "Read-only view. Connect the project owner wallet to configure contracts."}
        </p>
      </div>
      <ConnectGate wallet={w} />
      <div className="segmented">
        <button aria-pressed={tab === "a"} onClick={() => setTab("a")}>
          Phase A · bindings
        </button>
        <button aria-pressed={tab === "b"} onClick={() => setTab("b")}>
          Phase B · operations
        </button>
      </div>
      {tab === "a" ? (
        <>
          <div className="action-row">
            <Badge tone={s?.phaseAComplete ? "cyan" : "yellow"}>
              {s?.phaseAComplete
                ? "All bindings correct"
                : "Bindings incomplete"}
            </Badge>
            <button className="text-button" onClick={() => void p.refresh()}>
              <RefreshCw size={15} />
              Read current state
            </button>
          </div>
          {s && !s.verified && (
            <div className="inline-error">
              Verification failed: {s.verificationErrors.join("; ")}
            </div>
          )}
          <p className="tiny" style={{ marginTop: 15 }}>
            A1 → A7 is the required order. Correct settings are skipped. Any
            conflicting binding stops the plan. A4 can become permanent
            immediately when pending fees are delivered; A7 is one-shot.
          </p>
          {plan.map((step) => (
            <div className="setup-step" key={step.id}>
              <span className="step-number">
                {step.state === "correct" ? <Check size={16} /> : step.id}
              </span>
              <div className="step-content">
                <h4>{step.label}</h4>
                <Badge
                  tone={
                    step.state === "correct"
                      ? "cyan"
                      : step.state === "conflict"
                        ? "pink"
                        : "muted"
                  }
                >
                  {step.state === "correct"
                    ? "Already correct · skipped"
                    : step.state === "ready"
                      ? "Ready for owner review"
                      : step.state === "conflict"
                        ? "Conflict · stop"
                        : "Waiting for previous step"}
                </Badge>
                <p>{step.warning}</p>
                <p>
                  Target:{" "}
                  <ExplorerLink address={step.target} label={step.target} />
                </p>
                <details className="round-details">
                  <summary>Exact calldata & destinations</summary>
                  <p className="code">{step.calldata}</p>
                  <pre className="code">
                    {JSON.stringify(step.args, null, 2)}
                  </pre>
                </details>
                {(step.index === 3 || step.index === 6) &&
                  step.state !== "correct" && (
                    <label className="check-field">
                      <input
                        type="checkbox"
                        checked={!!ack[step.index]}
                        disabled={!owner}
                        onChange={(e) =>
                          setAck({ ...ack, [step.index]: e.target.checked })
                        }
                      />
                      {step.index === 3
                        ? "I checked the exact FeeTreasury address, matching runtime, owner and hook binding."
                        : "I checked the exact Arena address, matching runtime, owner and PRIO binding."}
                    </label>
                  )}
              </div>
              <button
                className="button secondary"
                disabled={
                  !owner ||
                  !ready(p) ||
                  action.busy ||
                  step.state !== "ready" ||
                  ([3, 6].includes(step.index) && !ack[step.index])
                }
                onClick={() =>
                  void action.run((update) =>
                    executePhaseAStep(
                      w.wallet!,
                      w.account!,
                      step.index,
                      update,
                    ),
                  )
                }
              >
                Simulate & confirm
              </button>
            </div>
          ))}
          {s && (
            <div className="action-row">
              <DownloadButton
                filename="prism-riot-phase-a-plan.json"
                data={JSON.stringify(
                  {
                    chainId: 1,
                    readAtBlock: s.blockNumber.toString(),
                    owner: ADDRESSES.owner,
                    preparedOnly: true,
                    steps: plan,
                  },
                  (_, v) => (typeof v === "bigint" ? v.toString() : v),
                  2,
                )}
              >
                <Download size={16} />
                Export prepared plan
              </DownloadButton>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="panel-intro">
            Configure operating limits only after reviewing current pool data
            and the real server operator. No stale suggested values are
            prefilled for signing. Neither a prepared plan nor Phase A enables
            paid play.
          </p>
          <div className="panel-grid">
            <div className="sub-panel">
              <h3>Actual treasury limits</h3>
              <dl className="metric-list">
                <div>
                  <dt>Reserve target</dt>
                  <dd>{fmt(s?.treasury.reserveTarget)} ETH</dd>
                </div>
                <div>
                  <dt>Maximum spend / swap</dt>
                  <dd>{fmt(s?.treasury.maxSpendPerSwap)} ETH</dd>
                </div>
                <div>
                  <dt>Purchase budget / window</dt>
                  <dd>{fmt(s?.treasury.spendPerWindow)} ETH</dd>
                </div>
                <div>
                  <dt>Spent this window</dt>
                  <dd>{fmt(s?.treasury.spentInWindow)} ETH</dd>
                </div>
                <div>
                  <dt>Executor gas draw / window</dt>
                  <dd>{fmt(s?.treasury.reservePerWindow)} ETH</dd>
                </div>
                <div>
                  <dt>Minimum PRIO / ETH</dt>
                  <dd>{fmt(s?.treasury.minPrioPerEth)}</dd>
                </div>
                <div>
                  <dt>Minimum IMD / ETH</dt>
                  <dd>{fmt(s?.treasury.minImdPerEth)}</dd>
                </div>
                <div>
                  <dt>IMD pool configured</dt>
                  <dd>{s ? (s.treasury.imdPoolSet ? "Yes" : "No") : "—"}</dd>
                </div>
                <div>
                  <dt>Executor</dt>
                  <dd>
                    {s && s.treasury.executor !== zeroAddress ? (
                      <ExplorerLink address={s.treasury.executor} />
                    ) : (
                      "Unset"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="sub-panel">
              <h3>Actual oracle limits</h3>
              <dl className="metric-list">
                <div>
                  <dt>Paid requests enabled</dt>
                  <dd>
                    {s ? (s.adapter.paidRequestsEnabled ? "Yes" : "No") : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Payment price</dt>
                  <dd>{fmt(s?.adapter.price)} IMD</dd>
                </div>
                <div>
                  <dt>Funded balance</dt>
                  <dd>{fmt(s?.adapter.imdBalance)} IMD</dd>
                </div>
                <div>
                  <dt>Budget / window</dt>
                  <dd>{fmt(s?.adapter.budgetPerWindow)} IMD</dd>
                </div>
                <div>
                  <dt>Spent this window</dt>
                  <dd>{fmt(s?.adapter.spentInWindow)} IMD</dd>
                </div>
                <div>
                  <dt>Callback configured</dt>
                  <dd>
                    {s ? (s.adapter.callbackConfigured ? "Yes" : "No") : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Intake</dt>
                  <dd>
                    {s && s.adapter.intake !== zeroAddress ? (
                      <ExplorerLink address={s.adapter.intake} />
                    ) : (
                      "Unset"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Executor</dt>
                  <dd>
                    {s && s.adapter.executor !== zeroAddress ? (
                      <ExplorerLink address={s.adapter.executor} />
                    ) : (
                      "Unset"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="info-box">
            <strong>Fixed budget windows need conservative limits.</strong>
            <p>
              Contract windows are fixed buckets, so up to twice a bucket limit
              can be spent across a rolling 24-hour boundary. Set independent
              server request, IMD and gas caps. Assign both executors last,
              after every reviewed limit and protocol setting.
            </p>
          </div>
          <button
            className="button secondary"
            disabled={action.busy || !s?.verified}
            onClick={() =>
              void action.run(async () =>
                setProtocol(await readPhaseBProtocol()),
              )
            }
          >
            Read fresh protocol & IMD pool data
            <RadioIcon />
          </button>
          {protocol && (
            <div className="sub-panel" style={{ marginTop: 18 }}>
              <Badge tone="cyan">
                Ethereum block {protocol.blockNumber.toString()}
              </Badge>
              <p>
                Pool source: {protocol.poolSource}. This read does not approve
                or configure that pool.
              </p>
              <dl className="metric-list">
                <div>
                  <dt>Live Intake request price</dt>
                  <dd>{fmt(protocol.price)} IMD</dd>
                </div>
                <div>
                  <dt>Pool LP fee / tick spacing</dt>
                  <dd>
                    {protocol.lpFee / 10000}% / {protocol.poolKey.tickSpacing}
                  </dd>
                </div>
                <div>
                  <dt>Current in-range liquidity</dt>
                  <dd>{protocol.liquidity.toString()}</dd>
                </div>
                <div>
                  <dt>Simulated IMD for {fmt(protocol.quoteInputEth)} ETH</dt>
                  <dd>
                    {protocol.quoteOutputImd !== undefined
                      ? fmt(protocol.quoteOutputImd)
                      : "Quote failed"}
                  </dd>
                </div>
              </dl>
              <p>
                Intake: <ExplorerLink address={protocol.intake} />
              </p>
              <p className="code">Pool ID: {protocol.poolId}</p>
              {protocol.quoteError && (
                <p className="inline-error">
                  {protocol.quoteError.slice(0, 250)}
                </p>
              )}
            </div>
          )}
          <h4>Prepare one owner-reviewed setting</h4>
          <label className="field">
            Setting
            <select
              value={option}
              onChange={(e) => changeOption(Number(e.target.value))}
            >
              {B_OPTIONS.map(([contract, fn, label], i) => (
                <option key={`${contract}-${fn}`} value={i}>
                  {label} · {contract}
                </option>
              ))}
            </select>
          </label>
          <PhaseBFields method={method} fields={fields} setField={setField} />
          {prepared && (
            <details className="rules">
              <summary>
                Prepared transaction · {target}.{method}
              </summary>
              <p>
                Target:{" "}
                <ExplorerLink
                  address={ADDRESSES[target]}
                  label={ADDRESSES[target]}
                />
              </p>
              <p className="code">{prepared}</p>
            </details>
          )}
          <label className="check-field">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            I reviewed this value against current protocol/pool data and the
            separately operated server’s budget.
          </label>
          <button
            className="button primary"
            disabled={
              !owner ||
              !ready(p) ||
              !s?.phaseAComplete ||
              action.busy ||
              !prepared ||
              !reviewed
            }
            onClick={() =>
              void action.run((update) =>
                executePhaseBCall(
                  w.wallet!,
                  w.account!,
                  target,
                  method,
                  args(),
                  update,
                ),
              )
            }
          >
            Simulate & confirm setting
          </button>
          <p className="tiny" style={{ marginTop: 15 }}>
            Server keys and paid API calls stay outside this static website.
            Price floors use token units per 1 ETH. A zero floor keeps purchases
            refused. Funded prizes, available fee-funded budgets and fresh
            signed operator readiness are still required before new paid
            entries.
          </p>
        </>
      )}
      <TransactionNotice action={action} />
      <SnapshotNote {...p} />
      <details className="rules">
        <summary>Contract verification and source references</summary>
        <p>
          Bindings follow the accepted{" "}
          <a
            href="https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment/blob/0345ffa67225afed469453250362e74b7f00ff42/docs/DEPLOYMENT.md"
            target="_blank"
            rel="noreferrer"
          >
            deployment guide
          </a>{" "}
          and ConfigPlan. Every write rechecks mainnet, deployed runtime hashes,
          owner addresses and the PoolKey.
        </p>
        {s &&
          Object.entries(s.codeHashes).map(([name, hash]) => (
            <p key={name}>
              {name} runtime hash <span className="code">{hash}</span>
            </p>
          ))}
      </details>
    </div>
  );
}
function RadioIcon() {
  return <RefreshCw size={15} />;
}
function PhaseBFields({
  method,
  fields,
  setField,
}: {
  method: string;
  fields: string[];
  setField: (i: number, v: string) => void;
}) {
  const field = (
    label: string,
    i: number,
    mode: "decimal" | "text" = "decimal",
  ) => (
    <label className="field" key={i}>
      {label}
      <input
        name={`phase-b-${i}`}
        inputMode={mode}
        value={fields[i] || ""}
        onChange={(e) => setField(i, e.target.value)}
        autoComplete="off"
      />
    </label>
  );
  if (method === "setImd")
    return (
      <div className="info-box">
        Verified IMD token:{" "}
        <ExplorerLink address={ADDRESSES.imd} label={ADDRESSES.imd} />
      </div>
    );
  if (method === "setAction")
    return (
      <div className="info-box">
        Verified action: oracle.request@oracle-1{" "}
        <p className="code">{ORACLE_ACTION}</p>
      </div>
    );
  if (method === "setPriceFloors")
    return (
      <div className="panel-grid">
        {field("Minimum PRIO per ETH", 0)}
        {field("Minimum IMD per ETH", 1)}
      </div>
    );
  if (method === "setImdPool")
    return (
      <>
        {field("LP fee in millionths", 0)}
        {field("Tick spacing", 1)}
        {field("Pool hook address (verified zero for hookless)", 2, "text")}
      </>
    );
  if (method === "setIntake")
    return (
      <>
        {field("Verified deployed Intake address", 0, "text")}
        <p className="tiny">
          Accepted deployment record:{" "}
          <ExplorerLink address={VERIFIED_INTAKE} label={VERIFIED_INTAKE} />.
          Enter the address only after review.
        </p>
      </>
    );
  if (method === "setExecutor")
    return (
      <>
        {field("Actual server operator wallet", 0, "text")}
        <p className="tiny">
          Use the real operator’s public address. Both contracts must use the
          same executor. No guessed address or private key.
        </p>
      </>
    );
  if (method === "setCallbackConfigured")
    return (
      <label className="field">
        Callback enabled
        <select
          value={fields[0] || ""}
          onChange={(e) => setField(0, e.target.value)}
        >
          <option value="">Choose after review</option>
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </label>
    );
  return field(
    method === "setPayment"
      ? "Current Intake price in IMD"
      : method === "setBudget"
        ? "Oracle budget per window in IMD"
        : "Reviewed amount in ETH",
    0,
  );
}
