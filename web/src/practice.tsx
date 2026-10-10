import { useEffect, useRef, useState } from "react";
import { Crosshair, Shield, RotateCcw, ArrowRight, LockKeyhole, Swords } from "lucide-react";
import { art, Badge, playTone } from "./ui";
export const GAMES = [
    { id: "raid", name: "Vault Raid", boss: "The Gilded Maw", icon: LockKeyhole },
    { id: "duel", name: "Faction Duel", boss: "The Mirror Jackal", icon: Swords },
    { id: "boss", name: "Prism Colossus", boss: "The Null Crown", icon: Crosshair },
] as const;
export type GameId = (typeof GAMES)[number]["id"];
export const PRACTICE_KEY = "prism-local-practice-v1";
export function localPractice(): string[] {
    try {
        const data = JSON.parse(localStorage.getItem(PRACTICE_KEY) || "[]");
        return Array.isArray(data) ? data.filter(x => GAMES.some(g => g.id === x)) : [];
    }
    catch {
        return [];
    }
}
export function Practice({ id, sound, motion }: {
    id: GameId;
    sound: boolean;
    motion: boolean;
}) {
    const game = GAMES.find(g => g.id === id)!;
    const [choice, setChoice] = useState<number>();
    const [result, setResult] = useState<number>();
    const [phase, setPhase] = useState<"choose" | "attack" | "reveal" | "result">("choose");
    const [error, setError] = useState("");
    const [turn, setTurn] = useState(1);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const count = id === "duel" ? 2 : 3;
    const won = phase === "result" && result === choice;
    const commit = () => {
        if (!choice) {
            setError("Select a choice first. Use Tab to move, Enter or Space to select.");
            return;
        }
        setError("");
        setPhase("attack");
        playTone(sound);
        timer.current = setTimeout(() => setPhase("reveal"), motion ? 650 : 0);
    };
    const reveal = () => {
        try {
            const random = new Uint32Array(1);
            const limit = Math.floor(4294967296 / count) * count;
            do {
                crypto.getRandomValues(random);
            } while (random[0] >= limit);
            const answer = random[0] % count + 1;
            setResult(answer);
            setPhase("result");
            playTone(sound, answer === choice);
            try {
                localStorage.setItem(PRACTICE_KEY, JSON.stringify([...new Set([...localPractice(), id])]));
                window.dispatchEvent(new Event("prism-practice"));
            }
            catch {
                setError("Result ready; local badge could not be saved because browser storage is unavailable.");
            }
        }
        catch {
            setError("Browser randomness failed. Reload and try again.");
            setPhase("choose");
        }
    };
    return <div className={`practice ${phase} ${won ? "practice-win" : ""}`}>
    <div className="practice-scene"><img src={art(`${id}.webp`)} alt={`${game.boss} · ${game.name}`}/><div className="boss-label"><Badge tone="yellow">{"Free practice"}</Badge><strong>{game.boss}</strong><span>{"0 PRIO cost · 0 PRIO reward"}</span></div>{phase === "attack" && <div className="attack-flash" aria-hidden="true"/>}</div>
    <div className="practice-body"><p className="eyebrow">{"WALLET-FREE TRAINING"}</p><h3>{phase === "result" ? (won ? "Practice match!" : "A different choice came up.") : phase === "attack" ? "Choice locked…" : phase === "reveal" ? "Ready to reveal the result." : "Choose, commit, reveal."}</h3>
      <p className="practice-instructions">{"Choose an option → Lock choice → Reveal result. Use a mouse or touch; on a keyboard, Tab moves and Enter / Space activates. Esc closes the dialog."}</p>
      <p>{"The result is random on your device. This is not a skill test; no tokens are spent or earned. Faction choice does not affect the result."}</p>
      {id === "boss" && <p>{"This practice covers one choice only; a real Boss round also requires its group threshold of correct players for a prize."}</p>}
      <div className="choices" role="group" aria-label={"Practice choice"} aria-describedby="practice-error">{Array.from({ length: count }, (_, i) => i + 1).map(n => <button key={n} disabled={phase !== "choose"} aria-pressed={choice === n} className={`choice ${choice === n ? "selected" : ""} ${phase === "result" && result === n ? "correct" : ""}`} onClick={() => { setChoice(n); setError(""); playTone(sound); }}>{id === "boss" ? <Crosshair /> : id === "duel" ? <Shield /> : <LockKeyhole />}<span>{"Choice"} {n}</span>{phase === "result" && result === n && <small>{"Practice answer"}</small>}</button>)}</div>
      <p id="practice-error" className="inline-error" role="alert">{error}</p>
      <div className="practice-result" role="status">{phase === "result" ? `Your choice: ${choice}. Random answer: ${result}. ${won ? "Correct match." : "No match."} This practice celebration is not a PRIO payout.` : `Practice #${turn} · Your choice stays on this device.`}</div>
      {phase === "result" ? <button className="button primary" onClick={() => { setPhase("choose"); setChoice(undefined); setResult(undefined); setError(""); setTurn(v => v + 1); }}><RotateCcw size={18}/>{"Try again"}</button> : phase === "reveal" ? <button className="button primary" onClick={reveal}>{"Reveal result"}<ArrowRight size={18}/></button> : <button className="button primary" disabled={phase === "attack"} onClick={commit}>{phase === "attack" ? "Locking choice…" : "Lock choice"}<ArrowRight size={18}/></button>}
      <details className="rules"><summary>{"Real Arena scoring"}</summary><p>{"Winning choice = (oracle answer mod choice count) + 1. Correct: 100 PRIO + an equal funded prize share; wrong: 90; missed reveal: 80. Entry is 102 PRIO, maximum loss 22 PRIO + gas. Cancellation: 102 PRIO refund."}</p></details>
    </div>
  </div>;
}
