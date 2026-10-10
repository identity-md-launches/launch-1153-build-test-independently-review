import { useEffect, useRef, useState } from "react";
import { Crosshair, Shield, RotateCcw, ArrowRight, LockKeyhole, Swords } from "lucide-react";
import { art, Badge, playTone } from "./ui";
import { t } from "./i18n";
export const GAMES = [
  {id:"raid",name:"Vault Raid",boss:"The Gilded Maw",icon:LockKeyhole},
  {id:"duel",name:"Faction Duel",boss:"The Mirror Jackal",icon:Swords},
  {id:"boss",name:"Prism Colossus",boss:"The Null Crown",icon:Crosshair},
] as const;
export type GameId=(typeof GAMES)[number]["id"];
export const PRACTICE_KEY="prism-local-practice-v1";
export function localPractice(): string[] {
  try { const data=JSON.parse(localStorage.getItem(PRACTICE_KEY)||"[]"); return Array.isArray(data)?data.filter(x=>GAMES.some(g=>g.id===x)):[]; } catch {return [];}
}
export function Practice({id,sound,motion}:{id:GameId;sound:boolean;motion:boolean}) {
  const game=GAMES.find(g=>g.id===id)!;
  const [choice,setChoice]=useState<number>();
  const [result,setResult]=useState<number>();
  const [phase,setPhase]=useState<"choose"|"attack"|"reveal"|"result">("choose");
  const [error,setError]=useState("");
  const [turn,setTurn]=useState(1);
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const count=id==="duel"?2:3;
  const won=phase==="result"&&result===choice;
  const commit=()=>{
    if (!choice) {setError(t("Önce bir seçenek seç. Tab ile ilerle, Enter veya Boşluk ile seç.","Select a choice first. Use Tab to move, Enter or Space to select."));return;}
    setError("");setPhase("attack");playTone(sound);
    timer.current=setTimeout(()=>setPhase("reveal"),motion?650:0);
  };
  const reveal=()=>{
    try {
      const random=new Uint32Array(1); const limit=Math.floor(4294967296/count)*count;
      do { crypto.getRandomValues(random); } while(random[0]>=limit);
      const answer=random[0]%count+1;
      setResult(answer);setPhase("result");playTone(sound,answer===choice);
      try {localStorage.setItem(PRACTICE_KEY,JSON.stringify([...new Set([...localPractice(),id])]));window.dispatchEvent(new Event("prism-practice"));}catch {setError(t("Sonuç hazır; tarayıcı depolaması kapalı olduğu için yerel rozet kaydedilemedi.","Result ready; local badge could not be saved because browser storage is unavailable."));}
    } catch {setError(t("Tarayıcı rastgele sonuç üretemedi. Sayfayı yenileyip yeniden dene.","Browser randomness failed. Reload and try again."));setPhase("choose");}
  };
  return <div className={`practice ${phase} ${won?"practice-win":""}`}>
    <div className="practice-scene"><img src={art(`${id}.webp`)} alt={`${game.boss} · ${game.name}`}/><div className="boss-label"><Badge tone="yellow">{t("Ücretsiz pratik","Free practice")}</Badge><strong>{game.boss}</strong><span>{t("0 PRIO maliyet · 0 PRIO ödül","0 PRIO cost · 0 PRIO reward")}</span></div>{phase==="attack"&&<div className="attack-flash" aria-hidden="true"/>}</div>
    <div className="practice-body"><p className="eyebrow">{t("CÜZDANSIZ ANTRENMAN","WALLET-FREE TRAINING")}</p><h3>{phase==="result"?(won?t("Pratikte eşleşti!","Practice match!"):t("Başka bir seçim çıktı.","A different choice came up.")):phase==="attack"?t("Seçim kilitlendi…","Choice locked…"):phase==="reveal"?t("Sonucu açıklamaya hazırsın.","Ready to reveal the result."):t("Seç, kilitle, açıkla.","Choose, commit, reveal.")}</h3>
      <p className="practice-instructions">{t("Bir seçenek seç → Kilitle → Sonucu açıkla. Fare veya dokunma kullan; klavyede Tab ile ilerle, Enter / Boşluk ile onayla. Esc pencereyi kapatır.","Choose an option → Lock choice → Reveal result. Use a mouse or touch; on a keyboard, Tab moves and Enter / Space activates. Esc closes the dialog.")}</p>
      <p>{t("Sonuç cihazında rastgele üretilir. Bu bir beceri testi değildir; hiçbir token harcanmaz veya kazanılmaz. Fraksiyon seçimi sonucu etkilemez.","The result is random on your device. This is not a skill test; no tokens are spent or earned. Faction choice does not affect the result.")}</p>
      {id==="boss"&&<p>{t("Bu pratik yalnızca tek seçimi gösterir; gerçek Boss turunda ödül için turdaki ortak doğru oyuncu eşiği de gerekir.","This practice covers one choice only; a real Boss round also requires its group threshold of correct players for a prize.")}</p>}
      <div className="choices" role="group" aria-label={t("Pratik seçimi","Practice choice")} aria-describedby="practice-error">{Array.from({length:count},(_,i)=>i+1).map(n=><button key={n} disabled={phase!=="choose"} aria-pressed={choice===n} className={`choice ${choice===n?"selected":""} ${phase==="result"&&result===n?"correct":""}`} onClick={()=>{setChoice(n);setError("");playTone(sound);}}>{id==="boss"?<Crosshair/>:id==="duel"?<Shield/>:<LockKeyhole/>}<span>{t("Seçenek","Choice")} {n}</span>{phase==="result"&&result===n&&<small>{t("Pratik yanıtı","Practice answer")}</small>}</button>)}</div>
      <p id="practice-error" className="inline-error" role="alert">{error}</p>
      <div className="practice-result" role="status">{phase==="result"?t(`Seçimin: ${choice}. Rastgele yanıt: ${result}. ${won?"Doğru eşleşme.":"Eşleşmedi."} Bu pratik kutlaması PRIO ödülü değildir.`,`Your choice: ${choice}. Random answer: ${result}. ${won?"Correct match.":"No match."} This practice celebration is not a PRIO payout.`):t(`Pratik #${turn} · Seçimin yalnızca bu cihazda.`,`Practice #${turn} · Your choice stays on this device.`)}</div>
      {phase==="result"?<button className="button primary" onClick={()=>{setPhase("choose");setChoice(undefined);setResult(undefined);setError("");setTurn(v=>v+1);}}><RotateCcw size={18}/>{t("Tekrar dene","Try again")}</button>:phase==="reveal"?<button className="button primary" onClick={reveal}>{t("Sonucu açıkla","Reveal result")}<ArrowRight size={18}/></button>:<button className="button primary" disabled={phase==="attack"} onClick={commit}>{phase==="attack"?t("Seçim kilitleniyor…","Locking choice…"):t("Seçimi kilitle","Lock choice")}<ArrowRight size={18}/></button>}
      <details className="rules"><summary>{t("Gerçek Arena puanlaması","Real Arena scoring")}</summary><p>{t("Kazanan seçenek = (oracle yanıtı mod seçenek sayısı) + 1. Doğru: 100 PRIO + fonlanmış ödülden eşit pay; yanlış: 90; açıklamayı kaçırma: 80. Giriş 102 PRIO, en fazla kayıp 22 PRIO + gas. İptal: 102 PRIO iade.","Winning choice = (oracle answer mod choice count) + 1. Correct: 100 PRIO + an equal funded prize share; wrong: 90; missed reveal: 80. Entry is 102 PRIO, maximum loss 22 PRIO + gas. Cancellation: 102 PRIO refund.")}</p></details>
    </div>
  </div>;
}
