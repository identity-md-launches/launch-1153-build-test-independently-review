import { t, tx } from "./i18n";
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
  let preparationError = "";
  try {
    prepared = encodeFunctionData({
      abi: ABIS[target],
      functionName: method,
      args: args(),
    });
  } catch (error) { preparationError = error instanceof Error ? tx(error.message) : t("Alanları incele.", "Review the fields."); }
  return (
    <div className="panel">
      <p className="panel-intro">{tx("Setup uses the existing contracts only. Each step is simulated, shown to the owner’s wallet, and checked after its receipt. Prepared calldata does not mean a transaction has executed.")}</p>
      <div className="info-box">
        <strong>{tx("Project owner")}</strong>
        <p>
          <ExplorerLink address={ADDRESSES.owner} label={ADDRESSES.owner} />
        </p>
        <p>
          {owner
            ? tx("Connected owner wallet. Review each transaction separately.")
            : tx("Read-only view. Connect the project owner wallet to configure contracts.")}
        </p>
      </div>
      <ConnectGate wallet={w} />
      <div className="segmented">
        <button aria-pressed={tab === "a"} onClick={() => setTab("a")}>{tx("Phase A · bindings")}</button>
        <button aria-pressed={tab === "b"} onClick={() => setTab("b")}>{tx("Phase B · operations")}</button>
      </div>
      {tab === "a" ? (
        <>
          <div className="action-row">
            <Badge tone={s?.phaseAComplete ? "cyan" : "yellow"}>
              {s?.phaseAComplete
                ? tx("All bindings correct")
                : tx("Bindings incomplete")}
            </Badge>
            <button className="text-button" onClick={() => void p.refresh()}>
              <RefreshCw size={15} />{tx("Read current state")}</button>
          </div>
          {s && !s.verified && (
            <div className="inline-error">{tx("Verification failed:")}{s.verificationErrors.join("; ")}
            </div>
          )}
          <p className="tiny" style={{ marginTop: 15 }}>{tx("A1 → A7 is the required order. Correct settings are skipped. Any conflicting binding stops the plan. A4 can become permanent immediately when pending fees are delivered; A7 is one-shot.")}</p>
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
                    ? tx("Already correct · skipped")
                    : step.state === "ready"
                      ? tx("Ready for owner review")
                      : step.state === "conflict"
                        ? tx("Conflict · stop")
                        : tx("Waiting for previous step")}
                </Badge>
                <p>{tx(step.warning)}</p>
                <p>{tx("Target:")}{" "}
                  <ExplorerLink address={step.target} label={step.target} />
                </p>
                <details className="round-details">
                  <summary>{tx("Exact calldata & destinations")}</summary>
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
                  plan.some(item => item.state === "conflict") ||
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
              >{tx("Simulate & confirm")}</button>
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
                <Download size={16} />{tx("Export prepared plan")}</DownloadButton>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="panel-intro">{tx("Configure operating limits only after reviewing current pool data and the real server operator. No stale suggested values are prefilled for signing. Neither a prepared plan nor Phase A enables paid play.")}</p>
          <div className="panel-grid">
            <div className="sub-panel">
              <h3>{tx("Actual treasury limits")}</h3>
              <dl className="metric-list">
                <div>
                  <dt>{tx("Reserve target")}</dt>
                  <dd>{fmt(s?.treasury.reserveTarget)}{" ETH "}</dd>
                </div>
                <div>
                  <dt>{tx("Maximum spend / swap")}</dt>
                  <dd>{fmt(s?.treasury.maxSpendPerSwap)}{" ETH "}</dd>
                </div>
                <div>
                  <dt>{tx("Purchase budget / window")}</dt>
                  <dd>{fmt(s?.treasury.spendPerWindow)}{" ETH "}</dd>
                </div>
                <div>
                  <dt>{tx("Spent this window")}</dt>
                  <dd>{fmt(s?.treasury.spentInWindow)}{" ETH "}</dd>
                </div>
                <div>
                  <dt>{tx("Executor gas draw / window")}</dt>
                  <dd>{fmt(s?.treasury.reservePerWindow)}{" ETH "}</dd>
                </div>
                <div>
                  <dt>{tx("Minimum PRIO / ETH")}</dt>
                  <dd>{fmt(s?.treasury.minPrioPerEth)}</dd>
                </div>
                <div>
                  <dt>{tx("Minimum IMD / ETH")}</dt>
                  <dd>{fmt(s?.treasury.minImdPerEth)}</dd>
                </div>
                <div>
                  <dt>{tx("IMD pool configured")}</dt>
                  <dd>{s ? (s.treasury.imdPoolSet ? tx("Yes") : tx("No")) : "—"}</dd>
                </div>
                <div>
                  <dt>{tx("Executor")}</dt>
                  <dd>
                    {s && s.treasury.executor !== zeroAddress ? (
                      <ExplorerLink address={s.treasury.executor} />
                    ) : (
                      tx("Unset")
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <div className="sub-panel">
              <h3>{tx("Actual oracle limits")}</h3>
              <dl className="metric-list">
                <div>
                  <dt>{tx("Paid requests enabled")}</dt>
                  <dd>
                    {s ? (s.adapter.paidRequestsEnabled ? tx("Yes") : tx("No")) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{tx("Payment price")}</dt>
                  <dd>{fmt(s?.adapter.price)}{" IMD "}</dd>
                </div>
                <div>
                  <dt>{tx("Funded balance")}</dt>
                  <dd>{fmt(s?.adapter.imdBalance)}{" IMD "}</dd>
                </div>
                <div>
                  <dt>{tx("Budget / window")}</dt>
                  <dd>{fmt(s?.adapter.budgetPerWindow)}{" IMD "}</dd>
                </div>
                <div>
                  <dt>{tx("Spent this window")}</dt>
                  <dd>{fmt(s?.adapter.spentInWindow)}{" IMD "}</dd>
                </div>
                <div>
                  <dt>{tx("Callback configured")}</dt>
                  <dd>
                    {s ? (s.adapter.callbackConfigured ? tx("Yes") : tx("No")) : "—"}
                  </dd>
                </div>
                <div>
                  <dt>{tx("Intake")}</dt>
                  <dd>
                    {s && s.adapter.intake !== zeroAddress ? (
                      <ExplorerLink address={s.adapter.intake} />
                    ) : (
                      tx("Unset")
                    )}
                  </dd>
                </div>
                <div>
                  <dt>{tx("Executor")}</dt>
                  <dd>
                    {s && s.adapter.executor !== zeroAddress ? (
                      <ExplorerLink address={s.adapter.executor} />
                    ) : (
                      tx("Unset")
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="info-box">
            <strong>{tx("Fixed budget windows need conservative limits.")}</strong>
            <p>{tx("Contract windows are fixed buckets, so up to twice a bucket limit can be spent across a rolling 24-hour boundary. Set independent server request, IMD and gas caps. Assign both executors last, after every reviewed limit and protocol setting.")}</p>
          </div>
          <button
            className="button secondary"
            disabled={action.busy || !s?.verified}
            onClick={() =>
              void action.run(async () =>
                setProtocol(await readPhaseBProtocol()),
              )
            }
          >{tx("Read fresh protocol & IMD pool data")}<RadioIcon />
          </button>
          {protocol && (
            <div className="sub-panel" style={{ marginTop: 18 }}>
              <Badge tone="cyan">{tx("Ethereum block")}{protocol.blockNumber.toString()}
              </Badge>
              <p>{tx("Pool source:")}{protocol.poolSource}{tx(". This read does not approve or configure that pool.")}</p>
              <dl className="metric-list">
                <div>
                  <dt>{tx("Live Intake request price")}</dt>
                  <dd>{fmt(protocol.price)}{" IMD "}</dd>
                </div>
                <div>
                  <dt>{tx("Pool LP fee / tick spacing")}</dt>
                  <dd>
                    {protocol.lpFee / 10000}% / {protocol.poolKey.tickSpacing}
                  </dd>
                </div>
                <div>
                  <dt>{tx("Current in-range liquidity")}</dt>
                  <dd>{protocol.liquidity.toString()}</dd>
                </div>
                <div>
                  <dt>{tx("Simulated IMD for")}{fmt(protocol.quoteInputEth)}{" ETH "}</dt>
                  <dd>
                    {protocol.quoteOutputImd !== undefined
                      ? fmt(protocol.quoteOutputImd)
                      : tx("Quote failed")}
                  </dd>
                </div>
              </dl>
              <p>{tx("Intake:")}<ExplorerLink address={protocol.intake} />
              </p>
              <p className="code">{tx("Pool ID:")}{protocol.poolId}</p>
              {protocol.quoteError && (
                <p className="inline-error">
                  {protocol.quoteError.slice(0, 250)}
                </p>
              )}
            </div>
          )}
          <h4>{tx("Prepare one owner-reviewed setting")}</h4>
          <label className="field">{tx("Setting")}<select
              value={option}
              onChange={(e) => changeOption(Number(e.target.value))}
            >
              {B_OPTIONS.map(([contract, fn, label], i) => (
                <option key={`${contract}-${fn}`} value={i}>
                  {tx(label)} · {contract}
                </option>
              ))}
            </select>
          </label>
          <p className="info-box">{phaseBHelp(method)}</p>
          <PhaseBFields method={method} fields={fields} setField={setField} />
          {preparationError && fields.some(Boolean) && <p role="alert" className="inline-error">{preparationError}</p>}
          {prepared && (
            <details className="rules">
              <summary>{tx("Prepared transaction ·")}{target}.{method}
              </summary>
              <p>{tx("Target:")}{" "}
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
            />{tx("I reviewed this value against current protocol/pool data and the separately operated server’s budget.")}</label>
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
          >{tx("Simulate & confirm setting")}</button>
          <p className="tiny" style={{ marginTop: 15 }}>{tx("Server keys and paid API calls stay outside this static website. Price floors use token units per 1 ETH. A zero floor keeps purchases refused. Funded prizes, available fee-funded budgets and fresh signed operator readiness are still required before new paid entries.")}</p>
        </>
      )}
      <TransactionNotice action={action} />
      <SnapshotNote {...p} />
      <details className="rules">
        <summary>{tx("Contract verification and source references")}</summary>
        <p>{tx("Bindings follow the accepted")}{" "}
          <a
            href="https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment/blob/0345ffa67225afed469453250362e74b7f00ff42/docs/DEPLOYMENT.md"
            target="_blank"
            rel="noreferrer"
          >{tx("deployment guide")}</a>{" "}{tx("and ConfigPlan. Every write rechecks mainnet, deployed runtime hashes, owner addresses and the PoolKey.")}</p>
        {s &&
          Object.entries(s.codeHashes).map(([name, hash]) => (
            <p key={name}>
              {name}{tx("runtime hash")}<span className="code">{hash}</span>
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
      <div className="info-box">{tx("Verified IMD token:")}{" "}
        <ExplorerLink address={ADDRESSES.imd} label={ADDRESSES.imd} />
      </div>
    );
  if (method === "setAction")
    return (
      <div className="info-box">{tx("Verified action: oracle.request@oracle-1")}{" "}
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
        <p className="tiny">{tx("Accepted deployment record:")}{" "}
          <ExplorerLink address={VERIFIED_INTAKE} label={VERIFIED_INTAKE} />{tx(". Enter the address only after review.")}</p>
      </>
    );
  if (method === "setExecutor")
    return (
      <>
        {field("Actual server operator wallet", 0, "text")}
        <p className="tiny">{tx("Use the real operator’s public address. Both contracts must use the same executor. No guessed address or private key.")}</p>
      </>
    );
  if (method === "setCallbackConfigured")
    return (
      <label className="field">{tx("Callback enabled")}<select
          value={fields[0] || ""}
          onChange={(e) => setField(0, e.target.value)}
        >
          <option value="">{tx("Choose after review")}</option>
          <option value="true">{tx("Enabled")}</option>
          <option value="false">{tx("Disabled")}</option>
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

function phaseBHelp(method:string) {
  const help:Record<string,[string,string]>={
    setReserveTarget:["Ücret gelirinden ayrılacak gas rezervinin hedefi; en fazla 2 ETH. Bu ayar kasaya ETH göndermez.","Target gas reserve allocated from fee income, at most 2 ETH. This setting does not transfer ETH."],
    setMaxSpendPerSwap:["Yürütücünün tek bir PRIO veya IMD alımında harcayabileceği en fazla ETH.","Maximum ETH the executor may spend on one PRIO or IMD purchase."],
    setSpendPerWindow:["Sabit 24 saatlik dönem içinde toplam alım limiti. Sıfır, alımları kapatır.","Total purchase cap in a fixed 24-hour window. Zero disables purchases."],
    setReservePerWindow:["Yürütücünün gas için rezervden kendi adresine çekebileceği dönem limiti.","Per-window limit the executor may draw from the reserve to its own address for gas."],
    setPriceFloors:["1 ETH karşılığında kabul edilen minimum PRIO ve IMD. Güncel, yürütülebilir teklifleri incele; sıfır alımları engeller, fazla yüksek değer işlemi geri çevirir.","Minimum PRIO and IMD accepted per ETH. Review current executable quotes; zero blocks purchases and an excessive floor causes a revert."],
    setImd:["Hazineyi doğrulanmış IMD tokenına bağlar. İlk IMD alımından sonra değiştirilemez.","Binds the treasury to the verified IMD token. It freezes after the first IMD purchase."],
    setImdPool:["Gerçek ETH/IMD havuzunun fee, tickSpacing ve hook değerlerini incele. Site işlem öncesi kullanılabilir teklif arar.","Review the actual ETH/IMD pool fee, tick spacing and hook. The site checks an executable quote before signing."],
    setIntake:["Mevcut, doğrulanmış Intake ödeme sözleşmesi. Adresi dağıtım kaydıyla karşılaştır.","Existing verified Intake payment contract. Compare its address with the deployment record."],
    setAction:["Mevcut oracle.request@oracle-1 eylemini seçer; ücretli API çağrısı yapmaz.","Selects the existing oracle.request@oracle-1 action; this makes no paid API call."],
    setPayment:["Güncel Intake.priceOf değerini IMD olarak gir. Site imza öncesi fiyatı yeniden karşılaştırır.","Enter the current Intake.priceOf value in IMD. The site compares the price again before signing."],
    setCallbackConfigured:["Geri çağrı ayarının operatörce doğrulandığını belirtir. Bu düğme bir sunucu başlatmaz.","Acknowledges reviewed callback setup. This switch does not start a server."],
    setBudget:["Adapter'ın sabit 24 saatlik dönemde harcayabileceği IMD. Bakiye ayrı olarak fee-funded alımlarla gelmelidir.","IMD the adapter may spend per fixed 24-hour window. Its balance must separately come from fee-funded purchases."],
    setExecutor:["Gerçek sunucunun halka açık cüzdan adresi. Bütçelerden sonra, iki sözleşmeye de aynı yürütücüyü ata; özel anahtar girme.","Public wallet address of the real server. Set the same executor on both contracts after budgets; never enter a private key."],
  };const pair=help[method];return pair?t(...pair):"";
}
