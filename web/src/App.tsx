import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  ExternalLink,
  Flame,
  Menu,
  Pause,
  Play,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Wallet,
  Zap,
} from "lucide-react";
import { type Snapshot, readSnapshot, ADDRESSES } from "./chain";
import { useWallet, message } from "./wallet";
import {
  art,
  Artwork,
  Badge,
  Dialog,
  ExplorerLink,
  fmt,
  playTone,
  useMotion,
} from "./ui";
import { GAMES, Practice, type GameId } from "./practice";
import {
  EconomyPanel,
  LiveGames,
  OwnerPanel,
  StakePanel,
  SwapPanel,
} from "./panels";
export const FACTIONS = [
  {
    id: "dragon",
    name: "Emberclaw",
    title: "Born from the blaze.",
    color: "#ff76b8",
    realm: "DRAGON CITADEL",
    desc: "Break the siege. Ignite the impossible. The citadel belongs to those who dare.",
  },
  {
    id: "frog",
    name: "Neon Tide",
    title: "Small. Strange. Unstoppable.",
    color: "#beef5d",
    realm: "BIOLUMINESCENT LAGOON",
    desc: "From the glowing deep comes a different kind of power. Never underestimate the underfrog.",
  },
  {
    id: "wolf",
    name: "Frostfang",
    title: "The pack never folds.",
    color: "#7ce7ff",
    realm: "ICE-WOLF DEN",
    desc: "Sharp instinct. Unshakable resolve. Stand together when the world freezes over.",
  },
  {
    id: "raven",
    name: "Stormveil",
    title: "See what others cannot.",
    color: "#c1a0ff",
    realm: "RAVEN STORM TOWER",
    desc: "Read the storm. Rewrite your fate. Every flash reveals another possibility.",
  },
] as const;
type Panel =
  | "wallet"
  | "swap"
  | "stake"
  | "economy"
  | "owner"
  | "live"
  | GameId;
export default function App() {
  const w = useWallet();
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [rpcError, setRpcError] = useState("");
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>();
  const [faction, setFaction] = useState(0);
  const [motion, setMotion] = useMotion();
  const [sound, setSound] = useState(false);
  const [menu, setMenu] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const liveRequest = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++liveRequest.current;
    setLoading(true);
    try {
      const s = await readSnapshot(w.account);
      if (request === liveRequest.current) {
        setSnapshot(s);
        setRpcError("");
      }
    } catch (e) {
      if (request === liveRequest.current) setRpcError(message(e));
    } finally {
      if (request === liveRequest.current) setLoading(false);
    }
  }, [w.account]);
  useEffect(() => {
    setSnapshot(undefined);
    void refresh();
    const i = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 45000);
    return () => {
      clearInterval(i);
      liveRequest.current++;
    };
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.motion = motion ? "on" : "off";
  }, [motion]);
  useEffect(() => {
    const target = hero.current;
    let inView = true;
    const update = () => {
      if (target)
        target.dataset.visible = String(
          inView && document.visibilityState === "visible",
        );
    };
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      update();
    });
    if (target) observer.observe(target);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const open = (p: Panel) => {
    setPanel(p);
    setMenu(false);
    playTone(sound);
  };
  const status = rpcError
    ? "Live reads unavailable"
    : loading && !snapshot
      ? "Connecting to Ethereum"
      : snapshot?.phaseAComplete
        ? "Bindings configured"
        : "Owner setup pending";
  const common = { snapshot, refresh, wallet: w, stale: !!rpcError };
  const title =
    panel === "wallet"
      ? "Your wallet"
      : panel === "swap"
        ? "Swap ETH / PRIO"
        : panel === "stake"
          ? "The staking vault"
          : panel === "economy"
            ? "Inside the economy"
            : panel === "owner"
              ? "Owner setup"
              : panel === "live"
                ? "On-chain rounds"
                : `${GAMES.find((x) => x.id === panel)?.name} · practice`;
  return (
    <div
      style={{ "--faction": FACTIONS[faction].color } as React.CSSProperties}
    >
      <a className="skip-link" href="#main">
        Skip to arcade
      </a>
      <header className="site-header">
        <a className="brand" href="#" aria-label="PRISM RIOT home">
          <img src={art("logo.jpg")} alt="" width="44" height="44" />
          <span>
            PRISM<span>RIOT</span>
          </span>
        </a>
        <nav
          className={menu ? "main-nav expanded" : "main-nav"}
          aria-label="Main navigation"
        >
          <a href="#arcade" onClick={() => setMenu(false)}>
            Arcade
          </a>
          <a href="#factions" onClick={() => setMenu(false)}>
            Factions
          </a>
          <button onClick={() => open("stake")}>Stake</button>
          <button onClick={() => open("economy")}>
            Economy
            <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-actions">
          <a
            className="social-x"
            href="https://x.com/PrismRiotIMD"
            target="_blank"
            rel="noreferrer"
            aria-label="PRISM RIOT on X"
          >
            𝕏
          </a>
          <button
            className="wallet-button"
            aria-label={
              w.account
                ? `Open wallet ${w.account.slice(0, 6)}…${w.account.slice(-4)}`
                : "Connect wallet"
            }
            onClick={() => open("wallet")}
          >
            <Wallet size={17} />
            <span>
              {w.account
                ? `${w.account.slice(0, 6)}…${w.account.slice(-4)}`
                : "Connect wallet"}
            </span>
          </button>
          <button
            className="icon-button mobile-menu"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <main id="main">
        <section
          className="hero"
          ref={hero}
          onPointerMove={(e) => {
            if (!motion || e.pointerType === "touch") return;
            const r = e.currentTarget.getBoundingClientRect();
            e.currentTarget.style.setProperty(
              "--px",
              `${(e.clientX - r.left - r.width / 2) / 85}px`,
            );
            e.currentTarget.style.setProperty(
              "--py",
              `${(e.clientY - r.top - r.height / 2) / 90}px`,
            );
          }}
          onPointerLeave={(e) => {
            e.currentTarget.style.setProperty("--px", "0px");
            e.currentTarget.style.setProperty("--py", "0px");
          }}
        >
          <div className="hero-art" aria-hidden="true">
            <img
              src={art("hero.webp")}
              srcSet={`${art("hero-sm.webp")} 720w, ${art("hero.webp")} 1440w`}
              sizes="(max-width: 640px) 140vw, 100vw"
              alt=""
              width="1440"
              height="810"
              fetchPriority="high"
            />
            <div className="hero-art-shade" />
            <div className="prism-particles">
              {Array.from({ length: 16 }, (_, i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </div>
          </div>
          <div className="hero-content">
            <div className="season">
              <span className="mini-prism" />A NEW WORLD. A NEW WAY TO PLAY.
            </div>
            <h1>
              PICK A SIDE.
              <br />
              BREAK THE
              <br />
              <em>GAME.</em>
            </h1>
            <p>
              Four factions. Three arenas. One fractured world.
              <br className="desktop-break" /> Bring your instinct. Start a
              riot.
            </p>
            <div className="hero-ctas">
              <a className="button primary" href="#arcade">
                Enter the arcade
                <ArrowRight size={20} />
              </a>
              <button className="text-button" onClick={() => open("economy")}>
                Explore the economy
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="hero-proof">
              <span>
                <ShieldCheck size={14} />
                On Ethereum
              </span>
              <span>
                <Zap size={14} />
                Free practice
              </span>
              <span>
                <Sparkles size={14} />
                Original worlds
              </span>
            </div>
          </div>
          <div className="hero-caption">
            <img src={art("logo.jpg")} alt="PRISM RIOT official emblem" />
            <div>
              <span>THE PRISM HAS SHATTERED</span>
              <strong>Your story starts here.</strong>
            </div>
            <ArrowDown size={24} />
          </div>
          <div className="media-controls">
            <button
              onClick={() => {
                setSound(!sound);
                playTone(!sound);
              }}
              aria-pressed={sound}
              aria-label={sound ? "Mute sound" : "Enable sound"}
            >
              {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
              <span>Sound {sound ? "on" : "off"}</span>
            </button>
            <button
              onClick={() => setMotion(!motion)}
              aria-pressed={motion}
              aria-label={motion ? "Pause animations" : "Play animations"}
            >
              {motion ? <Pause size={15} /> : <Play size={15} />}
              <span>Motion {motion ? "on" : "off"}</span>
            </button>
          </div>
        </section>
        <div className="world-strip">
          <span>STRATEGY MEETS INSTINCT</span>
          <span className="strip-star">✦</span>
          <span>CHOOSE YOUR FACTION</span>
          <span className="strip-star">✦</span>
          <span>ENTER THE UNKNOWN</span>
          <span className="strip-star">✦</span>
          <span>MAKE YOUR MOVE</span>
        </div>
        <div className="page-body">
          <section id="arcade" className="section arcade-section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  <span className="section-no">01 /</span>THE ARCADE
                </p>
                <h2>
                  THREE WAYS TO <em>RIOT.</em>
                </h2>
              </div>
              <div className="section-side">
                <Badge tone="cyan">Practice is open</Badge>
                <button className="text-button" onClick={() => open("live")}>
                  View on-chain rounds
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
            <div className="game-grid">
              {GAMES.map((game, i) => (
                <article key={game.id} className={`game-card ${game.id}`}>
                  <div className="game-image">
                    <Artwork
                      name={game.id}
                      alt={`${game.boss}, an original boss in the ${game.name} arena`}
                      motion={motion}
                    />
                    <div className="game-number">0{i + 1}</div>
                    <span className="game-genre">{game.genre}</span>
                  </div>
                  <div className="game-content">
                    <div className="game-title">
                      <h3>{game.name}</h3>
                      <game.icon size={24} />
                    </div>
                    <p>{game.tag}</p>
                    <div className="game-bottom">
                      <span>NO WALLET NEEDED</span>
                      <button
                        className="game-play"
                        onClick={() => open(game.id)}
                        aria-label={`Play ${game.name} practice`}
                      >
                        Play practice
                        <ArrowUpRight size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="live-notice">
              <div className="notice-icon">
                <Radio size={20} />
              </div>
              <div>
                <strong>
                  Practice now. Paid rounds when the world is ready.
                </strong>
                <p>
                  {snapshot
                    ? `${snapshot.arena.roundCount} rounds recorded · ${fmt(snapshot.arena.lockedPrizes)} PRIO in locked prizes.`
                    : "Live round and prize data loads directly from Ethereum."}{" "}
                  {status}. Entry checks include configuration, funding and the
                  separate operator.
                </p>
              </div>
              <button className="text-button" onClick={() => open("live")}>
                View status
                <ChevronRight size={18} />
              </button>
            </div>
          </section>
          <section id="factions" className="section">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  <span className="section-no">02 /</span>FIND YOUR PEOPLE
                </p>
                <h2>
                  FOUR FACTIONS.
                  <br className="mobile-only" /> <em>ZERO LIMITS.</em>
                </h2>
              </div>
              <p className="section-description">
                Fire. Tide. Frost. Storm.
                <br />
                Different instincts. The same desire to win.
              </p>
            </div>
            <div className="faction-grid">
              {FACTIONS.map((f, i) => (
                <button
                  key={f.id}
                  className={`faction-card ${faction === i ? "selected" : ""}`}
                  aria-pressed={faction === i}
                  onClick={() => {
                    setFaction(i);
                    playTone(sound);
                  }}
                  style={{ "--card-color": f.color } as React.CSSProperties}
                >
                  <Artwork
                    name={f.id}
                    alt={`${f.name} ${f.id} in the ${f.realm.toLowerCase()}`}
                    loop
                    motion={motion}
                  />
                  <div className="faction-gradient" />
                  <span className="faction-mark">
                    {faction === i ? (
                      <Check size={17} />
                    ) : (
                      <ArrowUpRight size={17} />
                    )}
                  </span>
                  <div className="faction-copy">
                    <span>{f.realm}</span>
                    <h3>{f.name}</h3>
                    <p>
                      {faction === i
                        ? "YOUR FACTION"
                        : `SELECT ${f.name.toUpperCase()}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <div className="faction-detail" aria-live="polite">
              <span className="faction-diamond" />
              <strong>{FACTIONS[faction].title}</strong>
              <p>{FACTIONS[faction].desc}</p>
              <span className="tiny">Cosmetic allegiance · no transaction</span>
            </div>
          </section>
          <section id="economy" className="section economy-section">
            <div className="economy-intro">
              <p className="eyebrow">
                <span className="section-no">03 /</span>POWERED BY PRIO
              </p>
              <h2>
                THE RIOT
                <br />
                HAS AN <em>ECONOMY.</em>
              </h2>
              <p>
                A fixed-supply token. A transparent treasury.
                <br />
                Swap fees help fund staking, games and oracle work.
              </p>
              <button className="button primary" onClick={() => open("swap")}>
                Get PRIO
                <ArrowRight size={19} />
              </button>
              <button className="text-button" onClick={() => open("economy")}>
                Follow the funds
                <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="economy-console">
              <div className="console-head">
                <span>
                  <span className="live-dot" />
                  ETHEREUM MAINNET
                </span>
                <button
                  className="text-button"
                  onClick={() => void refresh()}
                  disabled={loading}
                >
                  {loading ? "Reading…" : "Refresh"}
                  <Radio size={13} />
                </button>
              </div>
              <div className="stats-grid">
                <div>
                  <span>Immutable treasury fee</span>
                  <strong>
                    0.5<small>%</small>
                  </strong>
                  <p>On the ETH leg of each pool swap</p>
                </div>
                <div>
                  <span>Total treasury income</span>
                  <strong>
                    {fmt(snapshot?.treasury.totalIncome)}
                    <small>ETH</small>
                  </strong>
                  <p>
                    {snapshot
                      ? "Read from FeeTreasury"
                      : "Waiting for chain data"}
                  </p>
                </div>
                <div>
                  <span>Funded staking reserve</span>
                  <strong>
                    {fmt(snapshot?.vault.rewardReserve, 2)}
                    <small>PRIO</small>
                  </strong>
                  <p>Rewards depend on actual funding</p>
                </div>
                <div>
                  <span>Available game prizes</span>
                  <strong>
                    {fmt(snapshot?.arena.unallocatedPrizePool, 2)}
                    <small>PRIO</small>
                  </strong>
                  <p>Only funded prizes can be allocated</p>
                </div>
              </div>
              <div className="console-foot">
                <Badge tone={rpcError ? "yellow" : "muted"}>{status}</Badge>
                <span>
                  {snapshot
                    ? `BLOCK ${snapshot.blockNumber}`
                    : "LIVE READS · CHAIN 1"}
                </span>
              </div>
              {rpcError && (
                <p className="inline-error" role="alert">
                  {rpcError} Refresh to retry. Displayed values, if any, are
                  stale.
                </p>
              )}
            </div>
          </section>
          <section className="stake-banner">
            <div className="stake-symbol" aria-hidden="true">
              <Shield size={76} />
              <span>PRIO</span>
            </div>
            <div>
              <p className="eyebrow">YOUR PLACE IN THE ECONOMY</p>
              <h2>
                STAKE. STAY. <em>BUILD THE RIOT.</em>
              </h2>
              <p>
                Stake PRIO to share in funded rewards. No fixed APY. No promised
                returns.
              </p>
            </div>
            <button className="button secondary" onClick={() => open("stake")}>
              Open staking vault
              <ArrowUpRight size={19} />
            </button>
          </section>
          <section className="transparency">
            <div>
              <ShieldCheck size={20} />
              <span>
                Real contracts.
                <br />
                <strong>Verifiable by you.</strong>
              </span>
            </div>
            <ExplorerLink address={ADDRESSES.token} label="PRIO token" />
            <ExplorerLink address={ADDRESSES.arena} label="Arena contract" />
            <ExplorerLink address={ADDRESSES.treasury} label="Fee treasury" />
            <button className="text-button" onClick={() => open("owner")}>
              Setup & readiness
              <ArrowUpRight size={15} />
            </button>
          </section>
        </div>
      </main>
      <footer>
        <div className="footer-top">
          <a className="brand" href="#">
            <img src={art("logo.jpg")} alt="" width="40" height="40" />
            <span>
              PRISM<span>RIOT</span>
            </span>
          </a>
          <p>
            A fractured world. A shared future.
            <br />
            Find your faction. Make your move.
          </p>
          <a
            className="button secondary"
            href="https://x.com/PrismRiotIMD"
            target="_blank"
            rel="noreferrer"
          >
            Join the riot on 𝕏
            <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="footer-bottom">
          <span>PRISM RIOT · ETHEREUM MAINNET</span>
          <span>Tokens and paid play carry risk. Practice is always free.</span>
          <a
            href="https://github.com/identity-md-launches/launch-1158-complete-missing-application-deployment"
            target="_blank"
            rel="noreferrer"
          >
            Source
            <ExternalLink size={12} />
          </a>
        </div>
      </footer>
      {panel && (
        <Dialog
          title={title}
          onClose={() => setPanel(undefined)}
          wide={
            panel === "live" ||
            panel === "owner" ||
            panel === "economy" ||
            GAMES.some((g) => g.id === panel)
          }
        >
          {panel === "wallet" ? (
            <div className="wallet-panel">
              <div className="wallet-orb">
                <Wallet size={34} />
              </div>
              <h3>
                {w.account
                  ? "You’re connected."
                  : "Bring your wallet to the riot."}
              </h3>
              <p>
                Connect an Ethereum wallet to view balances, swap PRIO, stake
                and manage your on-chain rounds. Practice does not need a
                wallet.
              </p>
              {w.account ? (
                <>
                  <ExplorerLink address={w.account} />
                  <div className="balance-row">
                    <span>
                      ETH <strong>{fmt(snapshot?.account?.eth)}</strong>
                    </span>
                    <span>
                      PRIO <strong>{fmt(snapshot?.account?.prio)}</strong>
                    </span>
                  </div>
                  {w.chainId !== 1 && (
                    <button
                      className="button primary"
                      onClick={() => void w.switchNetwork()}
                    >
                      Switch to Ethereum
                    </button>
                  )}
                  <button className="button secondary" onClick={w.disconnect}>
                    Disconnect from site
                  </button>
                </>
              ) : (
                <button
                  className="button primary"
                  onClick={() => void w.connect()}
                  disabled={w.connecting}
                >
                  {w.connecting ? "Waiting for wallet…" : "Connect wallet"}
                  <Wallet size={18} />
                </button>
              )}
              {w.error && (
                <p className="inline-error" role="alert">
                  {w.error}
                </p>
              )}
              <p className="tiny">
                The site requests a signature only when you confirm a specific
                action. Keep enough ETH for gas.
              </p>
            </div>
          ) : panel === "swap" ? (
            <SwapPanel {...common} />
          ) : panel === "stake" ? (
            <StakePanel {...common} />
          ) : panel === "economy" ? (
            <EconomyPanel {...common} />
          ) : panel === "owner" ? (
            <OwnerPanel {...common} />
          ) : panel === "live" ? (
            <LiveGames {...common} sound={sound} motion={motion} />
          ) : (
            <Practice key={panel} id={panel} sound={sound} motion={motion} />
          )}
        </Dialog>
      )}
    </div>
  );
}
