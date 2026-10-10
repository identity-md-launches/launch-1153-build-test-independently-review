import { CheckCircle2, CircleAlert, RefreshCw, Server } from "lucide-react";
import { zeroAddress } from "viem";
import { type Snapshot, ADDRESSES, sameAddress, type RoundSnapshot } from "./chain";
import { t, tx } from "./i18n";
import { Badge, ExplorerLink, fmt } from "./ui";
import type { ProjectOperator } from "./project-state";

export function entryBlocker(s: Snapshot | undefined, rpcError: string, operator: ProjectOperator, round?: RoundSnapshot) {
  if (rpcError) return t("RPC verisi alınamadı. Bakiyeler ve tur durumu doğrulanamıyor; yeniden dene.", "RPC unavailable. Balances and rounds cannot be verified; retry.");
  if (!s) return t("Ethereum verileri okunuyor; ücretli giriş henüz doğrulanmadı.", "Reading Ethereum; paid entry is not verified yet.");
  if (!s.verified) return t("Sözleşme doğrulaması başarısız. Yeni giriş kapalı.", "Contract verification failed. New entry is blocked.");
  if (!s.phaseAComplete) return tx("Owner bindings are incomplete");
  if (!s.operationsReady) return tx(s.readinessReasons.find(r => !r.startsWith("Separate") && r !== "No funded active prizes") || "On-chain readiness is incomplete");
  if (!operator.configured) return t("Operatörün halka açık durum bağlantısı henüz yapılandırılmadı.", "The operator's public status endpoint is not configured.");
  if (operator.error) return t("Operatör durumu doğrulanamadı: ", "Operator status could not be verified: ") + tx(operator.error);
  if (!operator.proof?.serviceReady) return t("Güncel, imzalı operatör hazırlığı doğrulanamadı.", "Fresh signed operator readiness is unavailable.");
  if (!round) return t("Bu oyun için girişe açık, fonlanmış tur yok.", "No funded round is open for entry in this game.");
  if (!round.round.prize) return t("Bu turun ödülü fonlanmamış.", "This round's prize is not funded.");
  return "";
}
export function Readiness({ s, rpcError, loading, operator, rounds, roundError, roundLoading, refresh, onOwner, isOwner }: {
  s?: Snapshot; rpcError: string; loading: boolean; operator: ProjectOperator; rounds: RoundSnapshot[]; roundError: string; roundLoading: boolean;
  refresh: () => Promise<void>; onOwner: () => void; isOwner: boolean;
}) {
  const bindingRows = s ? [
    ["Treasury → Hook", s.treasury.hook, ADDRESSES.hook], ["Treasury → PRIO", s.treasury.prio, ADDRESSES.token],
    ["Treasury → StakingVault", s.treasury.stakingVault, ADDRESSES.vault], ["Treasury → Arena", s.treasury.arena, ADDRESSES.arena],
    ["Treasury → OracleAdapter", s.treasury.oracleAdapter, ADDRESSES.adapter], ["Hook → Treasury", s.hook.treasury, ADDRESSES.treasury],
    ["StakingVault → Funder", s.vault.rewardFunder, ADDRESSES.treasury], ["Arena → Oracle", s.arena.oracle, ADDRESSES.adapter], ["Adapter → Arena", s.adapter.arena, ADDRESSES.arena],
  ] : [];
  const known = !!s && !rpcError;
  const open = rounds.filter(r => r.round.state === 1 && r.round.commitDeadline > BigInt(Math.floor(Date.now()/1000)) && r.round.prize > 0n);
  const cards = [
    { id: "bindings", title: t("Sözleşme bağlantıları", "Contract bindings"), ok: known && s.verified && s.phaseAComplete, label: !known ? t("Doğrulanamadı", "Unverified") : s.phaseAComplete ? t("9 / 9 eşleşiyor", "9 / 9 match") : t("Eksik / çakışan bağlantı", "Missing / conflicting binding") },
    { id: "operations", title: t("İşletme ayarları", "Operating configuration"), ok: known && !!s.configurationReady, label: !known ? t("Doğrulanamadı", "Unverified") : s.configurationReady ? t("B aşaması ayarlı", "Phase B configured") : t("B aşaması eksik", "Phase B incomplete") },
    { id: "operator", title: t("Operatör bağlantısı", "Operator connection"), ok: known && !!operator.proof?.serviceReady, label: operator.error ? t("Çevrimdışı / doğrulanamadı", "Offline / unverified") : !operator.configured ? t("Bağlantı yapılandırılmadı", "Endpoint not configured") : operator.proof?.serviceReady ? t("İmzası doğrulandı", "Signed status verified") : t("Hazırlığı doğrulanmadı", "Readiness unverified") },
    { id: "prizes", title: t("Fonlanmış ödüller", "Funded prizes"), ok: known && (s.arena.lockedPrizes + s.arena.unallocatedPrizePool > 0n), label: known ? `${fmt(s.arena.lockedPrizes)} PRIO ${t("kilitli", "locked")}` : "—" },
    { id: "rounds", title: t("Girişe açık turlar", "Open rounds"), ok: known && !roundError && !roundLoading && open.length > 0, label: roundLoading && known ? t("Tur verisi okunuyor", "Reading rounds") : roundError ? t("Tur okuması başarısız", "Round read failed") : known ? `${open.length} ${t("girişe açık", "open for entry")}` : "—" },
  ];
  return <section id="readiness" className="readiness-section" aria-labelledby="readiness-title">
    <div className="section-heading"><div><p className="eyebrow">ETHEREUM · {t("CANLI KONTROL", "LIVE CHECK")}</p><h2 id="readiness-title">{t("Oynamaya hazır mı?", "Ready to play?")}</h2></div>
      <button className="button secondary" disabled={loading} onClick={() => { void refresh(); operator.refresh(); }}><RefreshCw size={16}/>{loading ? t("Okunuyor…", "Reading…") : t("Durumu yenile", "Refresh status")}</button></div>
    <p className="readiness-lead">{rpcError ? t("RPC bağlantısı başarısız. Bu bir kurulum sonucu değildir. Önceki değerler güncel sayılmaz.", "RPC connection failed. This is not a configuration result. Previous values are stale.") : s?.treasury.totalIncome === 0n ? t("Hazineye ücret geliri ulaşmadı; işletme bütçesi yok. Şu anda yalnızca ücretsiz pratik. Sahip ayarları ve fonlama gerekiyor.", "No fee income has reached the treasury; operating budgets are empty. Free practice only for now. Owner configuration and funding are required.") : t("Her kontrol ayrı doğrulanır. Bir cüzdan bağlamak veya fraksiyon seçmek ücretli oyunu açmaz.", "Each check is verified separately. Connecting a wallet or choosing a faction does not enable paid play.")}</p>
    <div className="readiness-grid">{cards.map(c => <a key={c.id} className={`readiness-tile ${c.ok ? "is-ready" : ""}`} href={`#readiness-${c.id}`} onClick={() => { const el = document.getElementById(`readiness-${c.id}`) as HTMLDetailsElement; if (el) el.open = true; }}>{c.ok ? <CheckCircle2 size={19}/> : <CircleAlert size={19}/>}<strong>{c.title}</strong><span>{c.label}</span></a>)}</div>
    <p className="tiny">{s ? `${t("Son okunan blok", "Last read block")} ${s.blockNumber} · ${new Date(s.timestamp*1000).toISOString().replace("T"," ").replace(".000Z"," UTC")}` : t("Ethereum bağlantısı bekleniyor.", "Waiting for Ethereum.")}{s && s.arena.roundCount > 24n ? t(" · Son 24 tur taranır; eski turlara numarasıyla ulaş.", " · Latest 24 rounds scanned; find older rounds by ID.") : ""}</p>
    {rpcError && <p role="alert" className="inline-error">{rpcError}</p>}
    <div className="readiness-details">
      <details id="readiness-bindings"><summary>{t("A aşaması · 9 bağlantının ayrıntısı", "Phase A · all 9 bindings")}</summary><p>{t("Doğru bağlantılar korunur ve atlanır. Çakışma varsa işlem durur.", "Correct bindings are preserved and skipped. Any conflict stops execution.")}</p>{bindingRows.map(([label,actual,expected]) => <div className="binding-row" key={label}><span>{label}</span><ExplorerLink address={actual}/><Badge tone={sameAddress(actual,expected) ? "cyan" : "yellow"}>{sameAddress(actual,expected) ? t("Eşleşiyor", "Matches") : actual === zeroAddress ? t("Ayarlanmamış", "Unset") : t("Çakışma", "Conflict")}</Badge></div>)}{s?.verificationErrors.map(e=><p className="inline-error" key={e}>{e}</p>)}</details>
      <details id="readiness-operations"><summary>{t("B aşaması · ayarlar ve bütçeler", "Phase B · settings and budgets")}</summary><ul>{s?.readinessReasons.filter(r=>r !== "No funded active prizes" && !r.startsWith("Separate")).map(r=><li key={r}>{tx(r)}</li>)}</ul><p>{t("Ayarlar cüzdan imzası ve ETH gas gerektirir; kendiliğinden tur veya ödül fonu oluşturmaz. Fiyat tabanları ve harcama limitleri sahip tarafından incelenmelidir.", "Settings require wallet signatures and ETH gas; they do not create a round or reward funding. The owner must review price floors and spend limits.")}</p>{isOwner && <button className="button secondary" onClick={onOwner}>{t("Sahip ayarlarını aç", "Open owner setup")}</button>}</details>
      <details id="readiness-operator"><summary>{t("Operatör · imzalı durum ve bağlantı", "Operator · signed status and connection")}</summary><OperatorDetails operator={operator}/></details>
      <details id="readiness-prizes"><summary>{t("Ödüller · gerçek fonlar", "Prizes · actual funding")}</summary><p>{t("Yeni turlara ayrılabilir", "Available for new rounds")}: {known ? fmt(s.arena.unallocatedPrizePool) : "—"} PRIO · {t("Mevcut turlarda kilitli", "Locked in existing rounds")}: {known ? fmt(s.arena.lockedPrizes) : "—"} PRIO.</p><p>{t("Oyuncu emanetleri ödül bütçesi değildir. Sadece zincirde fonlanmış ödüller kullanılabilir.", "Player deposits are not a prize budget. Only prizes funded on-chain can be used.")}</p></details>
      <details id="readiness-rounds"><summary>{t("Turlar · sonraki adım", "Rounds · next action")}</summary><p>{roundError || (s?.arena.roundCount === 0n ? t("Henüz tur oluşturulmadı. Sıradaki adım: B aşaması, operatör ve fonlama; ardından sahip pinQuestion → createRound işlemlerini onaylar.", "No rounds exist. Next: Phase B, operator readiness and funding; then the owner approves pinQuestion → createRound.") : t("Giriş süresi dolan turlar için açıklama, talep ve iade işlemleri PRIO Oyunları panelinde kalır.", "Reveal, claim and refund for closed entries remain available in PRIO Games."))}</p></details>
    </div>
  </section>;
}
export function OperatorDetails({operator:o}:{operator:ProjectOperator}) {
  return <><p><Server size={16}/> {t("Bu site statik olarak barındırılır. Operatör ayrı bir sunucuda çalışmalıdır.", "This site is statically hosted. The operator must run on a separate server.")}</p><p>{!o.configured ? t("Projenin halka açık operatör adresi henüz verilmedi. Oyuncuların URL girmesine gerek yok; sahip sunucu hazır olunca tek proje bağlantısını yayımlar.", "No public project operator endpoint has been supplied. Players never need to enter a URL; the owner publishes one project endpoint when the server is ready.") : o.endpoint}</p>{o.error && <p className="inline-error" role="alert">{t("Operatör doğrulanamadı: ","Operator unverified: ")}{tx(o.error)}</p>}{o.proof && <><p>{t("İmzalayan yürütücü", "Signing executor")}: <ExplorerLink address={o.proof.signer}/> · {t("Son geçerlilik", "Expires")}: {new Date(o.proof.signed.payload.expiresAt*1000).toISOString()}</p><ul>{o.proof.reasons.map(r=><li key={r}>{tx(r)}</li>)}</ul>{o.proof.signed.payload.activity.length ? <ul>{o.proof.signed.payload.activity.map(a=><li key={a.id}>{new Date(a.time*1000).toISOString()} · {a.summary} {a.transactionHash && <ExplorerLink tx address={a.transactionHash} label={t("Makbuz", "Receipt")}/>}</li>)}</ul> : <p>{t("Operatör raporunda faaliyet yok.", "No activity in the operator report.")}</p>}</> }<button className="button secondary" onClick={o.refresh} disabled={o.loading}>{t("Operatör durumunu yenile", "Refresh operator status")}</button></>;
}
