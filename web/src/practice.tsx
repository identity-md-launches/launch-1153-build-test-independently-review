import { useState } from "react";
import {
  Crosshair,
  Shield,
  Zap,
  RotateCcw,
  ArrowRight,
  LockKeyhole,
  Swords,
} from "lucide-react";
import { art, Badge, playTone } from "./ui";
export const GAMES = [
  {
    id: "raid",
    name: "Vault Raid",
    tag: "Read the signs. Pick your vault.",
    genre: "STRATEGY · SOLO",
    boss: "The Gilded Maw",
    desc: "Three sealed vaults. One hidden answer. Study the signal and commit your choice.",
    icon: LockKeyhole,
  },
  {
    id: "duel",
    name: "Faction Duel",
    tag: "Your instinct. Your allegiance.",
    genre: "PREDICTION · VERSUS",
    boss: "The Mirror Jackal",
    desc: "Two sides of a fractured world. Choose the faction you believe will take the round.",
    icon: Swords,
  },
  {
    id: "boss",
    name: "Prism Colossus",
    tag: "One boss. A collective strike.",
    genre: "CO-OP · BOSS RAID",
    boss: "The Null Crown",
    desc: "Find the weak point. In paid rounds, enough correct players must strike together.",
    icon: Crosshair,
  },
] as const;
export type GameId = (typeof GAMES)[number]["id"];
export function Practice({
  id,
  sound,
  motion,
}: {
  id: GameId;
  sound: boolean;
  motion: boolean;
}) {
  const game = GAMES.find((x) => x.id === id)!;
  const [choice, setChoice] = useState<number>();
  const [result, setResult] = useState<number>();
  const [phase, setPhase] = useState<"choose" | "attack" | "result">("choose");
  const [turn, setTurn] = useState(0);
  const count = id === "duel" ? 2 : 3;
  const answer = () => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return (n[0] % count) + 1;
  };
  const commit = () => {
    if (!choice) return;
    setPhase("attack");
    playTone(sound);
    setTimeout(
      () => {
        setResult(answer());
        setPhase("result");
      },
      motion ? 850 : 0,
    );
  };
  const won = phase === "result" && result === choice;
  return (
    <div className={`practice ${phase} ${won ? "practice-win" : ""}`}>
      <div className="practice-scene">
        <img
          src={art(`${id}.webp`)}
          alt={`${game.boss} in the ${game.name} arena`}
        />
        <div className="boss-label">
          <Badge tone="yellow">Free practice</Badge>
          <strong>{game.boss}</strong>
          <span>Training simulation · no tokens or prizes</span>
        </div>
        {phase === "attack" && (
          <div className="attack-flash" aria-hidden="true" />
        )}
      </div>
      <div className="practice-body">
        <p className="eyebrow">
          {id === "boss"
            ? "Locate the fracture"
            : id === "duel"
              ? "Choose your champion"
              : "Choose a sealed vault"}
        </p>
        <h3>
          {phase === "result"
            ? won
              ? "A perfect read."
              : "The prism had other plans."
            : phase === "attack"
              ? "Your choice is locked…"
              : "Trust your instinct."}
        </h3>
        <p>
          {id === "boss"
            ? "The Colossus changes its weak point every attempt. Practice picking the winning strike."
            : id === "duel"
              ? "Pick a side, lock it in, then discover the training result."
              : "A random vault holds the training shard. Make your choice before the reveal."}
        </p>
        <div className="choices">
          {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              disabled={phase !== "choose"}
              aria-pressed={choice === n}
              className={`choice ${choice === n ? "selected" : ""} ${phase === "result" && result === n ? "correct" : ""}`}
              onClick={() => {
                setChoice(n);
                playTone(sound);
              }}
            >
              {id === "boss" ? (
                <Crosshair />
              ) : id === "duel" ? (
                <Shield />
              ) : (
                <LockKeyhole />
              )}
              <span>
                {id === "boss"
                  ? ["Crown", "Core", "Claw"][n - 1]
                  : id === "duel"
                    ? ["Emberclaw", "Frostfang"][n - 1]
                    : `Vault 0${n}`}
              </span>
              {phase === "result" && result === n && (
                <small>Training answer</small>
              )}
            </button>
          ))}
        </div>
        <div className="practice-result" role="status">
          {phase === "result" ? (
            <>
              You chose {choice}. Training answer: {result}.{" "}
              <strong>{won ? "Correct choice" : "Incorrect choice"}</strong>.
              This simulation awards no PRIO.
            </>
          ) : (
            <>Practice #{turn + 1} · Your choice stays on this device.</>
          )}
        </div>
        {phase === "result" ? (
          <button
            className="button primary"
            onClick={() => {
              setPhase("choose");
              setChoice(undefined);
              setResult(undefined);
              setTurn((t) => t + 1);
            }}
          >
            <RotateCcw size={18} />
            Play again
          </button>
        ) : (
          <button
            className="button primary"
            disabled={!choice || phase === "attack"}
            onClick={commit}
          >
            {phase === "attack" ? "Revealing…" : "Lock choice & reveal"}
            <ArrowRight size={18} />
          </button>
        )}
        <details className="rules">
          <summary>How paid scoring works</summary>
          <p>
            Entry: 102 PRIO (100 escrow + 2 fee). Correct: 100 PRIO + a share of
            the funded prize. Wrong: 90 PRIO returned. Missed reveal: 80 PRIO
            returned. Maximum loss: 22 PRIO + Ethereum gas. A cancelled round
            refunds 102 PRIO.
          </p>
          <p>
            Winning choice = (oracle answer mod choice count) + 1. In boss
            rounds, the funded prize is shared only if the required number of
            players choose correctly. Practice uses local randomness and has no
            oracle.
          </p>
        </details>
      </div>
    </div>
  );
}
