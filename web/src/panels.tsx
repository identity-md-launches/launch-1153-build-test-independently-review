import { t, tx } from "./i18n";
import { useClock } from "./project-state";
import { useEffect, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  CheckCircle2,
  Coins,
  Download,
  ExternalLink,
  Flame,
  Radio,
  Shield,
  ShieldCheck,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import { decodeEventLog, parseEther, type Address } from "viem";
import {
  ABIS,
  ADDRESSES,
  approveExact,
  executeSwap,
  prepareSwapApproval,
  quoteSwap,
  readActivity,
  runContractAction,
  type ActivityEvent,
  type SwapQuote,
} from "./chain";
import { art, Badge, Busy, ExplorerLink, fmt } from "./ui";
import {
  ConnectGate,
  ready,
  recoveryReady,
  SnapshotNote,
  TransactionNotice,
  useAction,
  type PanelProps,
} from "./panel-common";


export function SwapPanel(p: PanelProps) {
  const { wallet: w, snapshot: s } = p;
  const [direction, setDirection] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [quote, setQuote] = useState<SwapQuote>();
  const [now, setNow] = useState(Date.now());
  const action = useAction(p.refresh);
  const [approval, setApproval] = useState(false);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => {
    setQuote(undefined);
    setApproval(false);
  }, [amount, slippage, direction, w.account, w.chainId]);
  const inputToken = direction === "buy" ? "ETH" : "PRIO",
    outputToken = direction === "buy" ? "PRIO" : "ETH";
  const getQuote = () =>
    action.run(async () => {
      setQuote(undefined);
      const q = await quoteSwap(
        direction,
        parseEther(amount),
        Math.round(Number(slippage) * 100),
      );
      setQuote(q);
    });
  return (
    <div className="panel">
      <p className="panel-intro">{tx("Trade in the original ETH/PRIO Uniswap v4 pool. Every quote simulates the deployed hook and pool. Review the minimum you will receive before signing.")}</p>
      <div className="segmented">
        <button
          disabled={action.busy}
          aria-pressed={direction === "buy"}
          onClick={() => setDirection("buy")}
        >{tx("Buy PRIO")}</button>
        <button
          disabled={action.busy}
          aria-pressed={direction === "sell"}
          onClick={() => setDirection("sell")}
        >{tx("Sell PRIO")}</button>
      </div>
      <label className="field">{tx("You pay")}<div className="input-row">
          <input
            name="swap-amount"
            disabled={action.busy}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
          />
          <span>{inputToken}</span>
        </div>
        <small>{tx("Wallet balance:")}{" "}
          {fmt(direction === "buy" ? s?.account?.eth : s?.account?.prio)}{" "}
          {inputToken}
        </small>
      </label>
      <label className="field">{tx("Slippage tolerance (%)")}<input
          name="slippage"
          disabled={action.busy}
          inputMode="decimal"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
        />
        <small>{tx("0.01%–5%. Ethereum gas is paid separately, including on a reverted transaction.")}</small>
      </label>
      <button
        className="button secondary full"
        onClick={() => void getQuote()}
        disabled={action.busy || !s?.verified || p.stale}
      >
        {action.busy ? tx("Checking transaction…") : tx("Simulate quote")}
        <ArrowDownUp size={16} />
      </button>
      {quote && (
        <div className="sub-panel" style={{ marginTop: 20 }}>
          <Badge tone={now < quote.expiresAt ? "cyan" : "yellow"}>
            {now < quote.expiresAt
              ? `Quote expires in ${Math.ceil((quote.expiresAt - now) / 1000)}s`
              : tx("Quote expired · refresh required")}
          </Badge>
          <dl className="metric-list">
            <div>
              <dt>{tx("Expected output")}</dt>
              <dd>
                {fmt(quote.amountOut, 8)} {outputToken}
              </dd>
            </div>
            <div>
              <dt>{tx("Minimum received")}</dt>
              <dd>
                <strong>
                  {fmt(quote.minimumOut, 8)} {outputToken}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{tx("LP fee")}</dt>
              <dd>{quote.lpFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>{tx("Platform protocol fee")}</dt>
              <dd>{quote.protocolFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>{tx("Combined pool fee")}</dt>
              <dd>{quote.combinedPoolFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>{tx("Extra treasury hook fee")}</dt>
              <dd>{tx("0.5% of the ETH leg")}</dd>
            </div>
            <div>
              <dt>{tx("Estimated hook fee")}</dt>
              <dd>{fmt(quote.hookFeeEth, 9)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Website fee")}</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>{tx("Quote block")}</dt>
              <dd>{quote.blockNumber.toString()}</dd>
            </div>
          </dl>
          <p className="tiny">{tx("Hook fee is rounded up to the next wei and already included in this simulated output. Its ETH estimate assumes a full fill; partial fills charge on the ETH actually exchanged. The router returns unused ETH. Pool fees use Uniswap’s combined fee formula.")}</p>
        </div>
      )}
      <ConnectGate wallet={w} />
      {direction === "sell" && (
        <>
          <button
            className="button secondary full"
            disabled={!ready(p) || action.busy || !amount}
            onClick={() =>
              void action.run(async (update) => {
                await prepareSwapApproval(
                  w.wallet!,
                  w.account!,
                  parseEther(amount),
                  update,
                );
                setApproval(true);
                setQuote(undefined);
              })
            }
          >{tx("Approve exact sell amount")}</button>
          <p className="tiny" style={{ marginTop: 10 }}>{tx("Two possible wallet confirmations: exact PRIO approval to Permit2, then exact router allowance expiring within 20 minutes. Obtain a fresh quote after approval.")}</p>
        </>
      )}
      <button
        className="button primary full"
        style={{ marginTop: 18 }}
        disabled={
          !ready(p) ||
          action.busy ||
          !quote ||
          now >= quote.expiresAt ||
          (direction === "sell" && !approval)
        }
        onClick={() =>
          void action.run(async (update) => {
            if (!quote) throw new Error(tx("Simulate a fresh quote first."));
            await executeSwap(w.wallet!, w.account!, quote, update);
            setQuote(undefined);
          })
        }
      >{tx("Review swap in wallet")}<ArrowRight size={16} />
      </button>
      <TransactionNotice action={action} />
      <details className="rules">
        <summary>{tx("Pool, risks & allowances")}</summary>
        <p>{tx("Maximum swap input is the amount above, plus gas. Slippage limits the minimum output; it does not guarantee profit or a fill. Simulation can fail when the pool has no usable liquidity in the requested direction. A failed quote never creates a transaction.")}</p>
        <ExplorerLink address={ADDRESSES.router} label={tx("Universal Router")} />
        <p>{tx("Pool key: native ETH /")}{" "}
          <ExplorerLink address={ADDRESSES.token} label={" PRIO "} />{tx(", fee 12500, tick spacing 60,")}{" "}
          <ExplorerLink address={ADDRESSES.hook} label={tx("TreasuryFeeHook")} />.
        </p>
        {w.account && (
          <button
            className="button secondary"
            disabled={!recoveryReady(p) || action.busy}
            onClick={() =>
              void action.run((update) =>
                approveExact(
                  w.wallet!,
                  w.account!,
                  ADDRESSES.permit2,
                  0n,
                  update,
                ),
              )
            }
          >{tx("Revoke PRIO approval to Permit2")}</button>
        )}
      </details>
      <SnapshotNote {...p} />
    </div>
  );
}
export function StakePanel(p: PanelProps) {
  const {wallet:w,snapshot:s}=p;
  const [tab,setTab]=useState<"stake"|"withdraw">("stake");
  const [amount,setAmount]=useState("");
  const [claimed,setClaimed]=useState<bigint>();
  const action=useAction(p.refresh);
  const now=useClock();
  const streaming=!!s&&s.vault.rewardReserve>0n&&s.vault.rewardRate>0n&&Number(s.vault.periodFinish)>now;
  const known=!!s&&s.verified&&!p.stale;
  const value=()=>{if(!/^\d+(\.\d{1,18})?$/.test(amount))throw new Error(t("En fazla 18 ondalıklı pozitif PRIO miktarı gir.","Enter a positive PRIO amount with up to 18 decimals."));const n=parseEther(amount);if(n<=0n)throw new Error(t("Sıfırdan büyük PRIO miktarı gir.",tx("Enter a positive PRIO amount.")));return n;};
  return <div className="panel"><p className="panel-intro">{t("PRIO, mevcut StakingVault sözleşmesinde tutulur. Yatırmak gelir yaratmaz; sadece gerçekten fonlanan ödüller dağıtılır. Çekim ve talep operatörden bağımsızdır.","PRIO is held by the existing StakingVault. Depositing does not create income; only actually funded rewards are distributed. Withdrawals and claims are independent of the operator.")}</p>
    <div className="info-box staking-funding"><strong>{!known?t("Ödül durumu doğrulanamadı; zincir verisini yenile.","Reward status is unverified; refresh chain data."):streaming?t("Fonlanmış ödül akışı etkin.","A funded reward stream is active."):t("Yatırma çalışıyor; ödüller şu anda fonlanmıyor veya akmıyor.","Deposits work; rewards are not currently funded or streaming")}</strong><p>{t("Sabit APY veya getiri sözü yok. Rezerv, geçmişten kalan yükümlülükleri içerebilir; yeni ödül akışıyla aynı şey değildir.","No fixed APY or promised yield. A reserve may include past liabilities; it is not the same as a new reward stream.")}</p></div>
    <dl className="metric-list stake-metrics"><div><dt>{t("Gerçek ödül rezervi","Actual reward reserve")}</dt><dd>{fmt(known?s.vault.rewardReserve:undefined,8)}{" PRIO "}</dd></div><div><dt>{t("Ayrılmış ödül yükümlülüğü","Reserved reward liabilities")}</dt><dd>{fmt(known?s.vault.rewardsOwed:undefined,8)}{" PRIO "}</dd></div><div><dt>{t("Akış durumu","Stream status")}</dt><dd>{!known?"—":streaming?t("Etkin","Active"):t("Etkin akış yok","No active stream")}</dd></div><div><dt>{t("Ödül hızı","Reward rate")}</dt><dd>{fmt(known?s.vault.rewardRate:undefined,9,36)}{" PRIO / s "}</dd></div><div><dt>{t("Akış bitişi","Stream ends")}</dt><dd>{known&&s.vault.periodFinish>0n?new Date(Number(s.vault.periodFinish)*1000).toISOString():t("Akış yok","No stream")}</dd></div><div><dt>{t("Talep edilebilir ödülün","Your claimable reward")}</dt><dd>{w.account?`${fmt(known?s.account?.earned:undefined,8)} PRIO`:t("Görmek için cüzdan bağla","Connect to read")}</dd></div><div><dt>{t("Yatırdığın PRIO","Your staked PRIO")}</dt><dd>{fmt(s?.account?.staked,8)}</dd></div></dl>
    <div className="segmented"><button disabled={action.busy} aria-pressed={tab==="stake"} onClick={()=>setTab("stake")}>{t("PRIO yatır","Stake PRIO")}</button><button disabled={action.busy} aria-pressed={tab==="withdraw"} onClick={()=>setTab("withdraw")}>{t("PRIO çek","Withdraw PRIO")}</button></div>
    <label className="field">{tab==="stake"?t("Yatırılacak miktar","Amount to stake"):t("Çekilecek miktar","Amount to withdraw")}<input name="staking-amount" inputMode="decimal" value={amount} disabled={action.busy} onChange={e=>setAmount(e.target.value)} placeholder="0.00" autoComplete="off" aria-describedby="stake-amount-help"/><small id="stake-amount-help">{t("Kullanılabilir","Available")}: {fmt(tab==="stake"?s?.account?.prio:s?.account?.staked,8)}{" PRIO. "}{t("Onay yalnızca girdiğin miktar içindir; ETH gas ayrıca ödenir.","Approval is only for the entered amount; ETH gas is separate.")}</small></label>
    <ConnectGate wallet={w}/><div className="action-row">{tab==="stake"&&<button className="button secondary" disabled={!ready(p)||action.busy} onClick={()=>void action.run(update=>approveExact(w.wallet!,w.account!,ADDRESSES.vault,value(),update))}>{t("Tam miktarı onayla","Approve exact amount")}</button>}<button className="button primary" disabled={!(tab==="withdraw"?recoveryReady(p):ready(p))||action.busy} onClick={()=>void action.run(update=>{const n=value();if(tab==="stake"&&(s?.account?.vaultAllowance??0n)<n)throw new Error(t("Önce tam yatırma miktarını onayla.","Approve the exact deposit amount first."));return runContractAction(w.wallet!,w.account!,"vault",tab==="stake"?"stake":"withdraw",[n],update);})}>{tab==="stake"?t("PRIO yatırmayı onayla","Confirm PRIO deposit"):t("PRIO çek","Withdraw PRIO")}<ArrowRight size={16}/></button></div>
    <div className="action-row"><button className="button secondary" disabled={!recoveryReady(p)||action.busy||s?.account?.earned===0n} onClick={()=>void action.run(async update=>{setClaimed(undefined);const receipt=await runContractAction(w.wallet!,w.account!,"vault","claim",[],update);for(const log of receipt.logs){try{if(log.address.toLowerCase()!==ADDRESSES.vault)continue;const e=decodeEventLog({abi:ABIS.vault,data:log.data,topics:log.topics});const a=e.args as {user?:string;amount?:bigint};if(e.eventName==="Claimed"&&a.user?.toLowerCase()===w.account?.toLowerCase()&&a.amount&&a.amount>0n)setClaimed(a.amount);}catch{}}})}>{t("Fonlanmış ödülü talep et","Claim funded rewards")}</button><button className="text-button" disabled={!recoveryReady(p)||action.busy} onClick={()=>void action.run(update=>approveExact(w.wallet!,w.account!,ADDRESSES.vault,0n,update))}>{t("Kasa onayını kaldır","Revoke vault approval")}</button></div>
    {s?.account?.earned===0n&&<p className="tiny">{t("Şu anda talep edilebilir ödülün 0 PRIO.","Your currently claimable reward is 0 PRIO.")}</p>}
    <TransactionNotice action={action}/>{claimed!==undefined&&<div className="confirmed-prize" role="status">{t("Makbuzla doğrulanan ödül","Receipt-confirmed reward")}: {fmt(claimed,8)}{" PRIO. "}</div>}
    <details className="rules"><summary>{t("Rezerv ve çekim ayrıntıları","Reserve and withdrawal details")}</summary><p>{t("rewardsOwed geçmişte kazanılmış ve hâlâ ayrılmış akış yükümlülüklerini içerir. Süresi bitmiş akış yeni ödül üretmez. Çekim ve ödül talebi A/B ayarlarına veya operatöre bağlı değildir.","rewardsOwed includes accrued rewards and remaining reserved stream liabilities. An expired stream creates no new rewards. Withdrawal and reward claims do not depend on Phase A/B or the operator.")}</p><p>{t("Dağıtılmış kasanın rewardRate değeri, wei/s üzerine 10¹⁸ hassasiyet ekler. Burada 36 basamak tek formatlama adımında çevrilir; token bakiyeleri 18 basamaktır.","The deployed vault's rewardRate adds 10¹⁸ precision to wei/s. It is formatted once at 36 decimals here; token balances use 18 decimals.")}</p><ExplorerLink address={ADDRESSES.vault} label={t("Mevcut kasayı incele","Inspect the existing vault")}/></details><SnapshotNote {...p}/>
  </div>;
}
export function EconomyPanel(p: PanelProps) {
  const s = p.snapshot;
  const [events, setEvents] = useState<ActivityEvent[]>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const action = useAction(p.refresh);
  useEffect(() => {
    if (s && !to) {
      setTo(s.blockNumber.toString());
      setFrom(
        (s.blockNumber > 26154915n
          ? s.blockNumber - 26154915n > 50000n
            ? s.blockNumber - 50000n
            : 26154915n
          : 26154915n
        ).toString(),
      );
    }
  }, [s, to]);
  return (
    <div className="panel">
      <p className="panel-intro">{tx("Follow the fee-funded economy directly from deployed state and events. Figures are on-chain balances and allocations, not projected earnings.")}</p>
      <div className="panel-grid">
        <div className="sub-panel">
          <h3>{tx("Where swap fees go")}</h3>
          <p>{tx("The immutable hook collects 0.5% of the ETH leg. Treasury allocation first fills the gas reserve, capped at 10% of income and the owner-set reserve target (maximum 2 ETH). Remaining funds split:")}</p>
          <dl className="metric-list">
            <div>
              <dt>{tx("IMD for oracle work")}</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>{tx("PRIO purchases")}</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>{tx("Owner allocation")}</dt>
              <dd>40%</dd>
            </div>
          </dl>
          <p>{tx("Purchased PRIO splits equally between staking and games. Until purchases and funding happen, rewards remain unfunded.")}</p>
        </div>
        <div className="sub-panel">
          <h3>{tx("Live treasury")}</h3>
          <dl className="metric-list">
            <div>
              <dt>{tx("Total fee income")}</dt>
              <dd>{fmt(s?.treasury.totalIncome, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Unallocated income")}</dt>
              <dd>{fmt(s?.treasury.unallocated, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Gas reserve")}</dt>
              <dd>{fmt(s?.treasury.reserve, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("IMD purchase budget")}</dt>
              <dd>{fmt(s?.treasury.imdBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("PRIO purchase budget")}</dt>
              <dd>{fmt(s?.treasury.prioBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Owner budget")}</dt>
              <dd>{fmt(s?.treasury.ownerBudget, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Hook ETH awaiting delivery")}</dt>
              <dd>{fmt(s?.hook.pendingEth, 8)}{" ETH "}</dd>
            </div>
            <div>
              <dt>{tx("Hook ETH claims")}</dt>
              <dd>{fmt(s?.hook.pendingClaims, 8)}{" ETH "}</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="info-box">
        <strong>{tx("Agent activity requires a real operator feed.")}</strong>
        <p>{tx("This static website does not host the server operator or make paid IMD API calls. The project uses one public endpoint for fresh, executor-signed status reports, configured when the separate server is available. No activity is invented when that feed is absent.")}</p>
      </div>
      <h3>{tx("On-chain activity")}</h3>
      <p className="tiny" style={{ marginTop: 10 }}>{tx("Choose an Ethereum block window (maximum 50,000 blocks). Seasonal prize rankings are available in the lobby; these event records are not a profit ranking.")}</p>
      <div className="panel-grid">
        <label className="field">{tx("From block")}<input
            name="from-block"
            inputMode="numeric"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">{tx("Through block")}<input
            name="to-block"
            inputMode="numeric"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <button
        className="button secondary"
        disabled={action.busy || !s?.verified || p.stale}
        onClick={() =>
          void action.run(async () => {
            if (!/^\d+$/.test(from) || !/^\d+$/.test(to))
              throw new Error(tx("Enter whole block numbers."));
            setEvents(await readActivity(BigInt(from), BigInt(to)));
          })
        }
      >
        {action.busy ? tx("Reading event logs…") : tx("Load real activity")}
        <Radio size={16} />
      </button>
      <TransactionNotice action={action} />
      {events && (
        <>
          <h4>{tx("Contract events ·")}{events.length}</h4>
          {events.length ? (
            <ul className="event-list">
              {[...events]
                .reverse()
                .slice(0, 100)
                .map((e) => (
                  <li key={`${e.transactionHash}-${e.logIndex}`}>
                    <span>
                      <strong>{e.name}</strong> · {e.contract}{tx("· block")}{" "}
                      {e.blockNumber.toString()}
                    </span>
                    <ExplorerLink
                      address={e.transactionHash}
                      tx
                      label={tx("Receipt")}
                    />
                    <details>
                      <summary>{tx("Event data")}</summary>
                      <pre className="code">
                        {JSON.stringify(
                          e.args,
                          (_, v) => (typeof v === "bigint" ? v.toString() : v),
                          2,
                        )}
                      </pre>
                    </details>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="tiny">{tx("No events were returned in the selected window. Try a wider window within the 50,000-block limit.")}</p>
          )}
        </>
      )}
      <h4>{tx("Fee delivery · permissionless maintenance")}</h4>
      <p className="tiny">{tx("These calls move already-collected hook fees into the treasury and allocate received income. They do not create rewards by themselves.")}</p>
      <ConnectGate wallet={p.wallet} />
      <div className="action-row">
        <button
          className="button secondary"
          disabled={
            !ready(p) ||
            action.busy ||
            !s?.phaseAComplete ||
            !s?.hook.pendingEth
          }
          onClick={() =>
            void action.run((update) =>
              runContractAction(
                p.wallet.wallet!,
                p.wallet.account!,
                "hook",
                "flush",
                [],
                update,
              ),
            )
          }
        >{tx("Flush pending ETH")}</button>
        <button
          className="button secondary"
          disabled={
            !ready(p) ||
            action.busy ||
            !s?.phaseAComplete ||
            !s?.treasury.unallocated
          }
          onClick={() =>
            void action.run((update) =>
              runContractAction(
                p.wallet.wallet!,
                p.wallet.account!,
                "treasury",
                "allocate",
                [],
                update,
              ),
            )
          }
        >{tx("Allocate received fees")}</button>
      </div>
      <SnapshotNote {...p} />
    </div>
  );
}
