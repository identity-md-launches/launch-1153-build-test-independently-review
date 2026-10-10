import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ExternalLink, Menu, Pause, Play, Shield, Volume2, VolumeX, Wallet } from "lucide-react";
import { type Snapshot, type RoundSnapshot, readSnapshot, readRound, ADDRESSES, sameAddress } from "./chain";
import { useWallet, message } from "./wallet";
import { art, Artwork, Badge, Busy, Dialog, ExplorerLink, fmt, playTone, useMotion } from "./ui";
import { GAMES, Practice, type GameId } from "./practice";
const SwapPanel = lazy(() => import("./panels").then(m => ({ default: m.SwapPanel })));
const StakePanel = lazy(() => import("./panels").then(m => ({ default: m.StakePanel })));
const EconomyPanel = lazy(() => import("./panels").then(m => ({ default: m.EconomyPanel })));
const OwnerPanel = lazy(() => import("./setup").then(m => ({ default: m.OwnerPanel })));
const LiveGames = lazy(() => import("./rounds").then(m => ({ default: m.LiveGames })));
const RoundManager = lazy(() => import("./round-manager").then(m => ({ default: m.RoundManager })));
import { Readiness, entryBlocker } from "./readiness";
import { useClock, useProjectOperator, timeLeft } from "./project-state";
import { SeasonBoard } from "./season-board";
import { WalletChoices } from "./panel-common";
export const FACTIONS = [
    { id: "dragon", name: "Emberclaw", color: "#ff76b8", realm: "DRAGON CITADEL", reaction: "Dragon flame" },
    { id: "frog", name: "Neon Tide", color: "#beef5d", realm: "BIOLUMINESCENT LAGOON", reaction: "Bioluminescence" },
    { id: "wolf", name: "Frostfang", color: "#7ce7ff", realm: "ICE-WOLF DEN", reaction: "Wolf frost" },
    { id: "raven", name: "Stormveil", color: "#c1a0ff", realm: "RAVEN STORM TOWER", reaction: "Raven lightning" },
] as const;
type Panel = "wallet" | "swap" | "stake" | "economy" | "owner" | "manage" | "live" | GameId;
export default function App() {
    const w = useWallet();
    const [snapshot, setSnapshot] = useState<Snapshot>();
    const [rpcError, setRpcError] = useState("");
    const [loading, setLoading] = useState(true);
    const [rounds, setRounds] = useState<RoundSnapshot[]>([]);
    const [roundError, setRoundError] = useState("");
    const [roundLoading, setRoundLoading] = useState(true);
    const [panel, setPanel] = useState<Panel>();
    const [liveMode, setLiveMode] = useState<number>();
    const [faction, setFaction] = useState(0);
    const [motion, setMotion] = useMotion();
    const [sound, setSound] = useState(false);
    const [menu, setMenu] = useState(false);
    const hero = useRef<HTMLElement>(null);
    const requestId = useRef(0);
    const walletKey = `${w.account}:${w.chainId}:${w.revision}`;
    const activeWalletKey = useRef(walletKey);
    activeWalletKey.current = walletKey;
    const now = useClock();
    const operator = useProjectOperator(snapshot, !!rpcError);
    const isOwner = !!w.account && !!w.wallet && w.chainId === 1 && !!snapshot?.verified && !rpcError && sameAddress(w.account, ADDRESSES.owner) && Object.values(snapshot.owners).every(owner => sameAddress(owner, ADDRESSES.owner));
    const refresh = useCallback(async () => {
        if (walletKey !== activeWalletKey.current) return;
        const id = ++requestId.current;
        setLoading(true);
        try {
            const s = await readSnapshot(w.account);
            if (id === requestId.current && walletKey === activeWalletKey.current) {
                setSnapshot(s);
                setRpcError("");
            }
        }
        catch (e) {
            if (id === requestId.current && walletKey === activeWalletKey.current)
                setRpcError(message(e));
        }
        finally {
            if (id === requestId.current && walletKey === activeWalletKey.current)
                setLoading(false);
        }
    }, [w.account, w.chainId, w.revision, walletKey]);
    useEffect(() => { setSnapshot(undefined); void refresh(); const timer = setInterval(() => { if (document.visibilityState === "visible")
        void refresh(); }, 45000); return () => { clearInterval(timer); requestId.current++; }; }, [refresh]);
    useEffect(() => {
        let disposed = false;
        if (!snapshot || rpcError)
            return;
        if (!snapshot.arena.roundCount) {
            setRounds([]);
            setRoundError("");
            setRoundLoading(false);
            return;
        }
        setRoundLoading(true);
        void Promise.all(Array.from({ length: Number(snapshot.arena.roundCount > 24n ? 24n : snapshot.arena.roundCount) }, (_, i) => readRound(snapshot.arena.roundCount - BigInt(i))))
            .then(r => { if (!disposed) {
            setRounds(r);
            setRoundError("");
            setRoundLoading(false);
        } }).catch(e => { if (!disposed) {
            setRounds([]);
            setRoundError(message(e));
            setRoundLoading(false);
        } });
        return () => { disposed = true; };
    }, [snapshot?.blockNumber, rpcError]);
    useEffect(() => { document.documentElement.dataset.motion = motion ? "on" : "off"; }, [motion]);
    useEffect(() => {
        const target = hero.current;
        let inView = true;
        const update = () => { if (target)
            target.dataset.visible = String(inView && document.visibilityState === "visible"); };
        const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); });
        if (target)
            io.observe(target);
        document.addEventListener("visibilitychange", update);
        return () => { io.disconnect(); document.removeEventListener("visibilitychange", update); };
    }, []);
    const open = (p: Panel) => { if (p === "swap") { setMenu(false); document.getElementById("buy")?.scrollIntoView({ behavior: motion ? "smooth" : "instant" }); return; } if (p === "live")
        setLiveMode(undefined); setPanel(p); setMenu(false); playTone(sound); };
    const showReadiness = () => { setPanel(undefined); setTimeout(() => document.getElementById("readiness")?.scrollIntoView({ behavior: motion ? "smooth" : "instant" }), 0); };
    const common = { snapshot, refresh, wallet: w, stale: !!rpcError, onReadiness: showReadiness };
    const title = panel === "wallet" ? "Your wallet" : panel === "swap" ? "Swap ETH / PRIO" : panel === "stake" ? "Staking vault" : panel === "economy" ? "PRIO economy" : panel === "owner" ? "Owner setup" : panel === "manage" ? "Round management" : panel === "live" ? "PRIO Games" : `${GAMES.find(g => g.id === panel)?.name} · ${"free practice"}`;
    const hasStream = !!snapshot && snapshot.vault.rewardReserve > 0n && snapshot.vault.rewardRate > 0n && Number(snapshot.vault.periodFinish) > now;
    return <div style={{ "--faction": FACTIONS[faction].color } as React.CSSProperties}>
    <a className="skip-link" href="#main">{"Skip to content"}</a>
    <header className="site-header">
      <a className="brand" href="#" aria-label="PRISM RIOT"><img src={art("logo.jpg")} alt="" width="44" height="44"/><span>PRISM<span>RIOT</span></span></a>
      <nav className={menu ? "main-nav expanded" : "main-nav"} aria-label={"Main navigation"}>
        <a href="#buy" className="nav-buy" onClick={() => setMenu(false)}>Buy PRIO</a>
        <a href="#arcade" onClick={() => setMenu(false)}>Games</a>
        <button onClick={() => open("stake")}>Staking</button>

      </nav>
      <div className="header-actions"><a className="social-x" href="https://x.com/PrismRiotIMD" target="_blank" rel="noreferrer" aria-label="PRISM RIOT on X">𝕏</a><button className="wallet-button" onClick={() => open("wallet")} aria-label={"Open wallet"}><Wallet size={17}/><span>{w.account ? `${w.account.slice(0, 6)}…${w.account.slice(-4)}` : "Connect wallet"}</span></button><button className="icon-button mobile-menu" aria-expanded={menu} aria-label={"Toggle navigation"} onClick={() => setMenu(!menu)}><Menu /></button></div>
    </header>
    <main id="main">
      <div className="hero-stage">
      <section className="hero" ref={hero} onPointerMove={e => { if (!motion || e.pointerType === "touch")
        return; const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty("--px", `${(e.clientX - r.left - r.width / 2) / 85}px`); e.currentTarget.style.setProperty("--py", `${(e.clientY - r.top - r.height / 2) / 90}px`); }} onPointerLeave={e => { e.currentTarget.style.setProperty("--px", "0px"); e.currentTarget.style.setProperty("--py", "0px"); }}>
        <div className="hero-art" aria-hidden="true"><img src={art("hero.webp")} srcSet={`${art("hero-sm.webp")} 720w, ${art("hero.webp")} 1440w`} sizes="(max-width: 640px) 140vw, 100vw" alt="" width="1440" height="810" fetchPriority="high"/><div className="hero-art-shade"/><div className="prism-particles">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ "--i": i } as React.CSSProperties}/>)}</div></div>
        <div className="hero-content"><div className="season"><span className="mini-prism"/>{"FOUR FACTIONS. THREE ARENAS. YOUR CHOICE."}</div>
          <h1>{"PICK A SIDE."}<br /><em>{"IGNITE THE PRISM."}</em></h1>
          <p>{"Practice for free. In ready, funded rounds, commit PRIO, reveal your choice on time and claim your eligible payout."}</p>
          <div className="hero-paths">
            <div><a className="button primary" href="#buy">Buy PRIO<ArrowRight size={18}/></a><p>Swap ETH for PRIO. Review every trade in your wallet.</p></div>
            <div><a className="button secondary" href="#arcade">Try free games</a><p>No wallet. No tokens spent or earned.</p></div>
            <div><button className="button secondary" onClick={() => open("stake")}>{"Stake PRIO"}</button><p>{"Deposit PRIO; rewards stream only when funded."}</p></div>
          </div>

        </div>
        <div className="media-controls"><button onClick={() => { setSound(!sound); playTone(!sound); }} aria-pressed={sound}>{sound ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{"Sound"} {sound ? "on" : "off"}</span></button><button onClick={() => setMotion(!motion)} aria-pressed={motion}>{motion ? <Pause size={15}/> : <Play size={15}/>}<span>{motion ? "Pause motion" : "Enable motion"}</span></button></div>
      </section>
      <section id="buy" className="buy-section" aria-label="Buy and sell PRIO"><Suspense fallback={<div className="panel"><Busy text="Loading swap…"/></div>}><SwapPanel {...common} compact/></Suspense></section>
      </div>
      <div className="world-strip"><span>{"FREE PRACTICE"}</span><span>✦</span><span>{"REAL RULES"}</span><span>✦</span><span>{"TRANSPARENT PRIZES"}</span></div>
      <div className="page-body">

        <section id="arcade" className="section arcade-section"><div className="section-heading"><div><p className="eyebrow">01 / ARCADE</p><h2>{"PRACTICE FIRST."} <em>{"THEN CHOOSE."}</em></h2></div><Badge tone="cyan">{"Free practice open"}</Badge></div>
          <div className="player-game-status"><strong>Real PRIO games: </strong>{snapshot?.corePaidReady && operator.proof?.serviceReady ? "Check the funded round and deadline before entering." : "Entry is unavailable until configuration, operator, fee-funded budgets, prizes and rounds are verified."} <button className="text-button" onClick={() => open("live")}>View real games and recovery</button></div>
          <div className="how-to"><h3>{"How to play"}</h3><ol><li><strong>{"Choose"}</strong><span>{"Open a game. Choose with a click or Tab + Enter."}</span></li><li><strong>{"Commit and reveal"}</strong><span>{"Reveal in practice. In real rounds, save your secret, enter and reveal before the deadline."}</span></li><li><strong>{"View the result"}</strong><span>{"Practice is random, not proof of skill or a PRIO reward. Real payouts require confirmed receipts."}</span></li></ol></div>
          <div className="game-grid">{GAMES.map((game, i) => {
            const round = rounds.find(r => r.round.mode === i && r.round.state === 1 && r.round.commitDeadline > BigInt(now));
            const blocker = roundLoading && !!snapshot?.operationsReady ? "Reading round state; entry is not verified yet." : roundError ? "Round data unavailable; retry." : entryBlocker(snapshot, rpcError, operator, round);
            const detail = rpcError || !snapshot ? "readiness" : !snapshot.verified || !snapshot.phaseAComplete ? "readiness-bindings" : !snapshot.operationsReady ? "readiness-operations" : !operator.proof?.serviceReady ? "readiness-operator" : !round && snapshot.arena.unallocatedPrizePool === 0n ? "readiness-prizes" : "readiness-rounds";
            return <article key={game.id} className={`game-card ${game.id}`}><div className="game-image"><Artwork name={game.id} alt={`${game.boss} · ${game.name}`} motion={motion}/><div className="game-number">0{i + 1}</div><span className="game-genre">{i === 2 ? "GROUP THRESHOLD" : "CHOICE + ORACLE RESULT"}</span></div><div className="game-content"><div className="game-title"><h3>{game.name}</h3><game.icon size={22}/></div><p className="game-objective">{i === 2 ? "Choose correctly. The round's required number of correct players must be reached for prizes." : "Find the winning choice: (oracle answer mod choice count) + 1."}</p>
              <div className="game-status"><Badge tone="cyan">{"Practice: free"}</Badge><Badge tone={blocker ? "yellow" : "cyan"}>{blocker ? "PRIO: unavailable" : "PRIO: entry open"}</Badge></div>
              <dl className="game-costs"><div><dt>{"Real entry"}</dt><dd>100 + 2 PRIO <small>{"escrow + fee"}</small></dd></div><div><dt>{"Maximum loss"}</dt><dd>22 PRIO + gas</dd></div><div><dt>{"Round prize"}</dt><dd>{round && !rpcError ? `${fmt(round.round.prize)} PRIO` : (rpcError || roundError || !snapshot || roundLoading ? "— Data unverified" : "— No open round")}</dd></div><div><dt>{"Entry / reveal"}</dt><dd>{round && !rpcError ? `${timeLeft(round.round.commitDeadline, now)} / ${timeLeft(round.round.revealDeadline, now)}` : (rpcError || roundError || !snapshot || roundLoading ? "— Data unverified" : "— Set when a round opens")}</dd></div></dl>
              <div className="game-actions"><button className="button primary" onClick={() => open(game.id)} aria-label={`${game.name} · ${"Free practice"}`}>{"Free practice"}<Play size={16}/></button><button className="button secondary" onClick={() => { open("live"); setLiveMode(i); }} aria-label={`${game.name} · ${"Play with real PRIO"}`}>{"Play with real PRIO"}<ArrowUpRight size={16}/></button></div>
              {blocker && <p className="game-blocker">{blocker} <a href={`#${detail}`} onClick={() => { const target = document.getElementById(detail); if (target?.tagName === "DETAILS")
                (target as HTMLDetailsElement).open = true; }}>{"Readiness details →"}</a></p>}
              <details className="rules"><summary>{"Rules and payouts"}</summary><PaidRules /><p>{"Practice: 0 PRIO cost, 0 PRIO reward. Factions are cosmetic."}</p></details>
            </div></article>;
        })}</div>
        </section>
        <section id="factions" className="section"><div className="section-heading"><div><p className="eyebrow">02 / {"FACTIONS"}</p><h2>{"FIRE. GLOW."} <em>{"FROST. STORM."}</em></h2></div><p className="section-description">{"Selection only changes the look. It creates no transaction, advantage or reward."}</p></div><div className="faction-grid">{FACTIONS.map((f, i) => <button key={f.id} className={`faction-card ${f.id} ${faction === i ? "selected" : ""}`} aria-pressed={faction === i} onClick={() => { setFaction(i); playTone(sound); }} style={{ "--card-color": f.color } as React.CSSProperties}><Artwork name={f.id} alt={`${f.name} · ${f.reaction}`} loop motion={motion}/><span className={`faction-reaction ${f.id}`} aria-hidden="true"/><div className="faction-gradient"/><span className="faction-mark">{faction === i ? <Check size={17}/> : <ArrowUpRight size={17}/>}</span><div className="faction-copy"><span>{f.realm}</span><h3>{f.name}</h3><p>{faction === i ? "SELECTED · COSMETIC" : "SELECT FACTION"}</p></div></button>)}</div><div className="faction-detail" role="status"><span className="faction-diamond"/><strong>{FACTIONS[faction].name}</strong><p>{FACTIONS[faction].reaction} · {"Selected. Free and cosmetic only."}</p></div></section>
        <SeasonBoard snapshot={snapshot} stale={!!rpcError} rounds={rounds} onLive={() => open("live")}/>
        <section id="economy" className="section economy-section"><div className="economy-intro"><p className="eyebrow">04 / PRIO</p><h2>{"THE GAME'S"}<br /><em>{"ECONOMY."}</em></h2><p>{"Fixed supply. Transparent treasury. Swap fees provide budgets for staking, games and oracle work."}</p><button className="button primary" onClick={() => open("swap")}>{"Swap PRIO"}<ArrowRight size={18}/></button><button className="text-button" onClick={() => open("economy")}>{"Explore the funds"}<ArrowUpRight size={16}/></button></div><div className="economy-console"><div className="console-head">ETHEREUM MAINNET · {snapshot?.blockNumber.toString() || "…"}</div><div className="stats-grid"><div><span>{"Immutable treasury fee"}</span><strong>0.5<small>%</small></strong><p>{"On the ETH leg of pool swaps"}</p></div><div><span>{"Treasury income"}</span><strong>{fmt(rpcError ? undefined : snapshot?.treasury.totalIncome)}<small>ETH</small></strong><p>{"Total read from chain"}</p></div><div><span>{"Staking reward reserve"}</span><strong>{fmt(rpcError ? undefined : snapshot?.vault.rewardReserve)}<small>PRIO</small></strong><p>{"A reserve does not imply an active stream"}</p></div><div><span>{"Available game prizes"}</span><strong>{fmt(rpcError ? undefined : snapshot?.arena.unallocatedPrizePool)}<small>PRIO</small></strong><p>{"Excludes player escrow"}</p></div></div></div></section>
        <section id="staking" className="stake-banner"><div className="stake-symbol" aria-hidden="true"><Shield size={64}/><span>PRIO</span></div><div><p className="eyebrow">STAKING</p><h2>{"DEPOSITS."} <em>{"FUNDED REWARDS."}</em></h2><p>{snapshot?.verified && !rpcError && !hasStream ? "No reward stream is currently active. Open staking to check your balance and next step." : "Check the reserve, active stream and claimable rewards before depositing."}</p></div><button className="button secondary" onClick={() => open("stake")}>{"Stake PRIO"}<ArrowUpRight size={18}/></button></section>
        <Readiness s={snapshot} rpcError={rpcError} loading={loading} operator={operator} rounds={rounds} roundError={roundError} roundLoading={roundLoading} refresh={refresh} onOwner={() => open("owner")} isOwner={false}/>
        {isOwner && <details className="founder-section"><summary>Founder / Admin</summary><p>Verified owner controls. Review settings and sign each transaction separately. Existing correct bindings are skipped.</p><div className="action-row"><button className="button secondary" onClick={() => open("owner")}>Owner setup · Phase A / B</button><button className="button secondary" onClick={() => open("manage")}>Manage rounds</button></div></details>}
        <section className="transparency"><ExplorerLink address={ADDRESSES.token} label="PRIO"/><ExplorerLink address={ADDRESSES.arena} label="Arena"/><ExplorerLink address={ADDRESSES.treasury} label="FeeTreasury"/><button className="text-button" onClick={showReadiness}>{"Live readiness"}</button></section>
      </div>
    </main>
    <footer><div className="footer-top"><a className="brand" href="#"><img src={art("logo.jpg")} alt="" width="40" height="40"/><span>PRISM<span>RIOT</span></span></a><p>{"The prism has shattered. The choice is yours."}</p><a className="button secondary" href="https://x.com/PrismRiotIMD" target="_blank" rel="noreferrer">@PrismRiotIMD <ArrowUpRight size={17}/></a></div><div className="footer-bottom"><span>PRISM RIOT · ETHEREUM MAINNET</span><span>{"Practice is always free. Real transactions carry token and gas risk."}</span><a href="https://github.com/identity-md-launches/launch-1153-build-test-independently-review" target="_blank" rel="noreferrer">{"Source"}<ExternalLink size={12}/></a></div></footer>
    {panel && <Dialog title={title} onClose={() => setPanel(undefined)} wide={["live", "owner", "manage", "economy", "raid", "duel", "boss"].includes(panel)}>
      <Suspense fallback={<div className="panel"><Busy text={"Loading panel…"}/></div>}>{panel === "wallet" ? <div className="wallet-panel"><div className="wallet-orb"><Wallet size={34}/></div><h3>{w.account ? "Wallet connected." : "Connect your wallet for real transactions."}</h3><p>{"Free practice needs no wallet. Connecting does not authorize payments; each transaction is reviewed separately."}</p><WalletChoices wallet={w}/>{w.account ? <><ExplorerLink address={w.account}/><div className="balance-row"><span>ETH <strong>{fmt(snapshot?.account?.eth)}</strong></span><span>PRIO <strong>{fmt(snapshot?.account?.prio)}</strong></span></div>{w.chainId !== 1 && <button className="button primary" onClick={() => void w.switchNetwork()}>{"Switch to Ethereum"}</button>}<button className="button secondary" onClick={w.disconnect}>{"Disconnect"}</button></> : <button className="button primary" disabled={w.connecting} onClick={() => void w.connect()}>{w.connecting ? "Waiting for wallet…" : "Connect wallet"}</button>}{w.error && <p className="inline-error" role="alert">{w.error}</p>}</div> : panel === "swap" ? <SwapPanel {...common}/> : panel === "stake" ? <StakePanel {...common}/> : panel === "economy" ? <EconomyPanel {...common}/> : panel === "owner" ? (isOwner ? <OwnerPanel {...common}/> : <p className="panel">Connect the verified project owner on Ethereum and refresh to use founder controls.</p>) : panel === "manage" ? (isOwner ? <RoundManager {...common} operator={operator}/> : <p className="panel">Connect the verified project owner on Ethereum and refresh to manage rounds.</p>) : panel === "live" ? <LiveGames {...common} sound={sound} motion={motion} projectOperator={operator} mode={liveMode}/> : <Practice key={panel} id={panel} sound={sound} motion={motion}/>}</Suspense>
    </Dialog>}
  </div>;
}
export function PaidRules() { return <><p>{"Entry: 100 PRIO escrow + 2 PRIO fee. Correct: 100 PRIO + a funded prize share. Wrong: 90 PRIO returned. Missed reveal: 80 PRIO returned. Maximum loss: 22 PRIO + gas."}</p><p>{"Without a valid result, cancellation is available after the result deadline + 3 days; a cancelled round refunds 102 PRIO. If the boss threshold is missed, a correct choice returns only 100 PRIO."}</p></>; }
