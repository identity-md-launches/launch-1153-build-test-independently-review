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
export { OwnerPanel } from "./setup";
export { LiveGames } from "./rounds";
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
      <p className="panel-intro">
        Trade in the original ETH/PRIO Uniswap v4 pool. Every quote simulates
        the deployed hook and pool. Review the minimum you will receive before
        signing.
      </p>
      <div className="segmented">
        <button
          disabled={action.busy}
          aria-pressed={direction === "buy"}
          onClick={() => setDirection("buy")}
        >
          Buy PRIO
        </button>
        <button
          disabled={action.busy}
          aria-pressed={direction === "sell"}
          onClick={() => setDirection("sell")}
        >
          Sell PRIO
        </button>
      </div>
      <label className="field">
        You pay
        <div className="input-row">
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
        <small>
          Wallet balance:{" "}
          {fmt(direction === "buy" ? s?.account?.eth : s?.account?.prio)}{" "}
          {inputToken}
        </small>
      </label>
      <label className="field">
        Slippage tolerance (%)
        <input
          name="slippage"
          disabled={action.busy}
          inputMode="decimal"
          value={slippage}
          onChange={(e) => setSlippage(e.target.value)}
        />
        <small>
          0.01%–5%. Ethereum gas is paid separately, including on a reverted
          transaction.
        </small>
      </label>
      <button
        className="button secondary full"
        onClick={() => void getQuote()}
        disabled={action.busy || !s?.verified || p.stale}
      >
        {action.busy ? "Checking transaction…" : "Simulate quote"}
        <ArrowDownUp size={16} />
      </button>
      {quote && (
        <div className="sub-panel" style={{ marginTop: 20 }}>
          <Badge tone={now < quote.expiresAt ? "cyan" : "yellow"}>
            {now < quote.expiresAt
              ? `Quote expires in ${Math.ceil((quote.expiresAt - now) / 1000)}s`
              : "Quote expired · refresh required"}
          </Badge>
          <dl className="metric-list">
            <div>
              <dt>Expected output</dt>
              <dd>
                {fmt(quote.amountOut, 8)} {outputToken}
              </dd>
            </div>
            <div>
              <dt>Minimum received</dt>
              <dd>
                <strong>
                  {fmt(quote.minimumOut, 8)} {outputToken}
                </strong>
              </dd>
            </div>
            <div>
              <dt>LP fee</dt>
              <dd>{quote.lpFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>Platform protocol fee</dt>
              <dd>{quote.protocolFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>Combined pool fee</dt>
              <dd>{quote.combinedPoolFeePpm / 10000}%</dd>
            </div>
            <div>
              <dt>Extra treasury hook fee</dt>
              <dd>0.5% of the ETH leg</dd>
            </div>
            <div>
              <dt>Estimated hook fee</dt>
              <dd>{fmt(quote.hookFeeEth, 9)} ETH</dd>
            </div>
            <div>
              <dt>Website fee</dt>
              <dd>0</dd>
            </div>
            <div>
              <dt>Quote block</dt>
              <dd>{quote.blockNumber.toString()}</dd>
            </div>
          </dl>
          <p className="tiny">
            Hook fee is rounded up to the next wei and already included in this
            simulated output. Its ETH estimate assumes a full fill; partial
            fills charge on the ETH actually exchanged. The router returns
            unused ETH. Pool fees use Uniswap’s combined fee formula.
          </p>
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
          >
            Approve exact sell amount
          </button>
          <p className="tiny" style={{ marginTop: 10 }}>
            Two possible wallet confirmations: exact PRIO approval to Permit2,
            then exact router allowance expiring within 20 minutes. Obtain a
            fresh quote after approval.
          </p>
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
            if (!quote) throw new Error("Simulate a fresh quote first.");
            await executeSwap(w.wallet!, w.account!, quote, update);
            setQuote(undefined);
          })
        }
      >
        Review swap in wallet
        <ArrowRight size={16} />
      </button>
      <TransactionNotice action={action} />
      <details className="rules">
        <summary>Pool, risks & allowances</summary>
        <p>
          Maximum swap input is the amount above, plus gas. Slippage limits the
          minimum output; it does not guarantee profit or a fill. Simulation can
          fail when the pool has no usable liquidity in the requested direction.
          A failed quote never creates a transaction.
        </p>
        <ExplorerLink address={ADDRESSES.router} label="Universal Router" />
        <p>
          Pool key: native ETH /{" "}
          <ExplorerLink address={ADDRESSES.token} label="PRIO" />, fee 12500,
          tick spacing 60,{" "}
          <ExplorerLink address={ADDRESSES.hook} label="TreasuryFeeHook" />.
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
          >
            Revoke PRIO approval to Permit2
          </button>
        )}
      </details>
      <SnapshotNote {...p} />
    </div>
  );
}
export function StakePanel(p: PanelProps) {
  const { wallet: w, snapshot: s } = p;
  const [tab, setTab] = useState<"stake" | "withdraw">("stake");
  const [amount, setAmount] = useState("");
  const action = useAction(p.refresh);
  const [claimed, setClaimed] = useState<bigint>();
  const funded = !!s && s.vault.rewardReserve > 0n;
  return (
    <div className="panel">
      <p className="panel-intro">
        Your PRIO stays in the deployed StakingVault. Rewards stream only when
        the treasury has supplied funds. You can withdraw whenever the contract
        permits.
      </p>
      <div className="balance-row">
        <span>
          Your staked PRIO<strong>{fmt(s?.account?.staked)}</strong>
        </span>
        <span>
          Claimable PRIO<strong>{fmt(s?.account?.earned, 6)}</strong>
        </span>
      </div>
      <div className="info-box">
        <strong>
          {s
            ? funded
              ? "Rewards have funding."
              : "Staking reward funding is zero."
            : "Checking reward funding…"}
        </strong>
        <p>
          {s
            ? `${fmt(s.vault.rewardReserve)} PRIO in the reward reserve. ${fmt(s.vault.totalStaked)} PRIO staked across all wallets.`
            : "Live funding will appear when the RPC responds."}{" "}
          No fixed APY or guaranteed yield.
        </p>
      </div>
      <div className="segmented">
        <button aria-pressed={tab === "stake"} onClick={() => setTab("stake")}>
          Stake PRIO
        </button>
        <button
          aria-pressed={tab === "withdraw"}
          onClick={() => setTab("withdraw")}
        >
          Withdraw PRIO
        </button>
      </div>
      <label className="field">
        {tab === "stake" ? "Amount to stake" : "Amount to withdraw"}
        <input
          name="staking-amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoComplete="off"
        />
        <small>
          Available:{" "}
          {fmt(tab === "stake" ? s?.account?.prio : s?.account?.staked)} PRIO
        </small>
      </label>
      <ConnectGate wallet={w} />
      <div className="action-row">
        {tab === "stake" && (
          <button
            className="button secondary"
            disabled={!ready(p) || action.busy}
            onClick={() =>
              void action.run((update) => {
                const value = parseEther(amount);
                if (value <= 0n)
                  throw new Error("Enter a positive PRIO amount.");
                return approveExact(
                  w.wallet!,
                  w.account!,
                  ADDRESSES.vault,
                  value,
                  update,
                );
              })
            }
          >
            Approve exact amount
          </button>
        )}
        <button
          className="button primary"
          disabled={
            !(tab === "withdraw" ? recoveryReady(p) : ready(p)) || action.busy
          }
          onClick={() =>
            void action.run((update) => {
              const value = parseEther(amount);
              if (value <= 0n) throw new Error("Enter a positive PRIO amount.");
              if (tab === "stake" && (s?.account?.vaultAllowance ?? 0n) < value)
                throw new Error("Approve the exact staking amount first.");
              return runContractAction(
                w.wallet!,
                w.account!,
                "vault",
                tab === "stake" ? "stake" : "withdraw",
                [value],
                update,
              );
            })
          }
        >
          {tab === "stake" ? "Stake PRIO" : "Withdraw PRIO"}
          <ArrowRight size={16} />
        </button>
      </div>
      <div className="action-row">
        <button
          className="button secondary"
          disabled={
            !recoveryReady(p) || action.busy || s?.account?.earned === 0n
          }
          onClick={() =>
            void action.run(async (update) => {
              setClaimed(undefined);
              const receipt = await runContractAction(
                w.wallet!,
                w.account!,
                "vault",
                "claim",
                [],
                update,
              );
              for (const log of receipt.logs) {
                try {
                  if (log.address.toLowerCase() !== ADDRESSES.vault) continue;
                  const e = decodeEventLog({
                    abi: ABIS.vault,
                    data: log.data,
                    topics: log.topics,
                  });
                  if (e.eventName === "Claimed") {
                    const args = e.args as unknown as Record<string, unknown>;
                    if (
                      String(args.user).toLowerCase() !==
                      w.account?.toLowerCase()
                    )
                      continue;
                    const value = args.amount;
                    if (typeof value === "bigint" && value > 0n)
                      setClaimed(value);
                  }
                } catch {}
              }
            })
          }
        >
          Claim funded rewards
        </button>
        <button
          className="text-button"
          disabled={!recoveryReady(p) || action.busy}
          onClick={() =>
            void action.run((update) =>
              approveExact(w.wallet!, w.account!, ADDRESSES.vault, 0n, update),
            )
          }
        >
          Revoke vault approval
        </button>
      </div>
      <TransactionNotice action={action} />
      {claimed !== undefined && (
        <div className="confirmed-prize" role="status">
          Confirmed reward claim: {fmt(claimed)} PRIO.
        </div>
      )}
      <details className="rules">
        <summary>Funding and withdrawal details</summary>
        <dl className="metric-list">
          <div>
            <dt>Reward rate</dt>
            <dd>
              {fmt(s ? s.vault.rewardRate / 10n ** 18n : undefined, 9)} PRIO /
              second
            </dd>
          </div>
          <div>
            <dt>Stream ends</dt>
            <dd>
              {s && s.vault.periodFinish > 0n
                ? new Date(Number(s.vault.periodFinish) * 1000).toLocaleString()
                : "No reward stream"}
            </dd>
          </div>
          <div>
            <dt>Rewards owed</dt>
            <dd>{fmt(s?.vault.rewardsOwed)} PRIO</dd>
          </div>
        </dl>
        <p>
          Approvals are limited to the amount you enter. Staking principal and
          Arena escrow are held in separate contracts. Contract and market risks
          remain. Withdrawal and reward claims do not require Phase A/B or a
          running server operator.
        </p>
        <ExplorerLink
          address={ADDRESSES.vault}
          label="Inspect the deployed vault"
        />
      </details>
      <SnapshotNote {...p} />
    </div>
  );
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
  const claims = (events || []).filter(
    (e) => e.contract === "arena" && e.name === "Claimed",
  );
  const leaderboard = Object.entries(
    claims.reduce<Record<string, bigint>>((acc, e) => {
      const player = String(e.args.player);
      acc[player] = (acc[player] || 0n) + BigInt(String(e.args.amount));
      return acc;
    }, {}),
  ).sort((a, b) => (a[1] > b[1] ? -1 : 1));
  return (
    <div className="panel">
      <p className="panel-intro">
        Follow the fee-funded economy directly from deployed state and events.
        Figures are on-chain balances and allocations, not projected earnings.
      </p>
      <div className="panel-grid">
        <div className="sub-panel">
          <h3>Where swap fees go</h3>
          <p>
            The immutable hook collects 0.5% of the ETH leg. Treasury allocation
            first fills the gas reserve, capped at 10% of income and the
            owner-set reserve target (maximum 2 ETH). Remaining funds split:
          </p>
          <dl className="metric-list">
            <div>
              <dt>IMD for oracle work</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>PRIO purchases</dt>
              <dd>30%</dd>
            </div>
            <div>
              <dt>Owner allocation</dt>
              <dd>40%</dd>
            </div>
          </dl>
          <p>
            Purchased PRIO splits equally between staking and games. Until
            purchases and funding happen, rewards remain unfunded.
          </p>
        </div>
        <div className="sub-panel">
          <h3>Live treasury</h3>
          <dl className="metric-list">
            <div>
              <dt>Total fee income</dt>
              <dd>{fmt(s?.treasury.totalIncome, 8)} ETH</dd>
            </div>
            <div>
              <dt>Unallocated income</dt>
              <dd>{fmt(s?.treasury.unallocated, 8)} ETH</dd>
            </div>
            <div>
              <dt>Gas reserve</dt>
              <dd>{fmt(s?.treasury.reserve, 8)} ETH</dd>
            </div>
            <div>
              <dt>IMD purchase budget</dt>
              <dd>{fmt(s?.treasury.imdBudget, 8)} ETH</dd>
            </div>
            <div>
              <dt>PRIO purchase budget</dt>
              <dd>{fmt(s?.treasury.prioBudget, 8)} ETH</dd>
            </div>
            <div>
              <dt>Owner budget</dt>
              <dd>{fmt(s?.treasury.ownerBudget, 8)} ETH</dd>
            </div>
            <div>
              <dt>Hook ETH awaiting delivery</dt>
              <dd>{fmt(s?.hook.pendingEth, 8)} ETH</dd>
            </div>
            <div>
              <dt>Hook ETH claims</dt>
              <dd>{fmt(s?.hook.pendingClaims, 8)} ETH</dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="info-box">
        <strong>Agent activity requires a real operator feed.</strong>
        <p>
          This static website does not host the server operator or make paid IMD
          API calls. The on-chain rounds panel accepts a fresh, executor-signed
          public status feed. No activity is invented when that feed is absent.
        </p>
      </div>
      <h3>On-chain activity & leaderboard</h3>
      <p className="tiny" style={{ marginTop: 10 }}>
        Choose an Ethereum block window (maximum 50,000 blocks). Leaderboard
        ranks confirmed Arena claim amounts in that window; these include
        returned escrow and are not profit.
      </p>
      <div className="panel-grid">
        <label className="field">
          From block
          <input
            name="from-block"
            inputMode="numeric"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="field">
          Through block
          <input
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
              throw new Error("Enter whole block numbers.");
            setEvents(await readActivity(BigInt(from), BigInt(to)));
          })
        }
      >
        {action.busy ? "Reading event logs…" : "Load real activity"}
        <Radio size={16} />
      </button>
      <TransactionNotice action={action} />
      {events && (
        <>
          <h4>Leaderboard · confirmed claims</h4>
          {leaderboard.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Player</th>
                    <th>Claimed PRIO</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map(([player, total], i) => (
                    <tr key={player}>
                      <td>{i + 1}</td>
                      <td>
                        <ExplorerLink address={player} />
                      </td>
                      <td>{fmt(total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <Trophy size={28} />
              <h3>No claims in this block window.</h3>
              <p>
                The leaderboard starts with real settled-round claims. Practice
                scores are never added here.
              </p>
            </div>
          )}
          <h4>Contract events · {events.length}</h4>
          {events.length ? (
            <ul className="event-list">
              {[...events]
                .reverse()
                .slice(0, 100)
                .map((e) => (
                  <li key={`${e.transactionHash}-${e.logIndex}`}>
                    <span>
                      <strong>{e.name}</strong> · {e.contract} · block{" "}
                      {e.blockNumber.toString()}
                    </span>
                    <ExplorerLink
                      address={e.transactionHash}
                      tx
                      label="Receipt"
                    />
                    <details>
                      <summary>Event data</summary>
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
            <p className="tiny">
              No events were returned in the selected window. Try a wider window
              within the 50,000-block limit.
            </p>
          )}
        </>
      )}
      <h4>Fee delivery · permissionless maintenance</h4>
      <p className="tiny">
        These calls move already-collected hook fees into the treasury and
        allocate received income. They do not create rewards by themselves.
      </p>
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
        >
          Flush pending ETH
        </button>
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
        >
          Allocate received fees
        </button>
      </div>
      <SnapshotNote {...p} />
    </div>
  );
}
