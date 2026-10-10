import { tx } from "./i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowUpRight, LoaderCircle } from "lucide-react";
export const art = (name: string) => `${import.meta.env.BASE_URL}art/${name}`;
export function Artwork({
  name,
  alt,
  loop = false,
  motion = true,
  className = "",
}: {
  name: string;
  alt: string;
  loop?: boolean;
  motion?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    document.visibilityState === "visible",
  );
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      rootMargin: "0px",
    });
    if (ref.current) io.observe(ref.current);
    const updateVisibility = () =>
      setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);
  const animated = loop && motion && visible && pageVisible;
  const portrait = ["dragon", "frog", "wolf", "raven"].includes(name);
  return (
    <img
      ref={ref}
      className={className}
      data-visible={visible && pageVisible}
      src={art(`${name}${animated ? "-loop" : ""}.webp`)}
      srcSet={
        animated
          ? undefined
          : `${art(`${name}-sm.webp`)} ${portrait ? 320 : 480}w, ${art(`${name}.webp`)} ${portrait ? 576 : 899}w`
      }
      sizes={
        portrait
          ? "(max-width: 640px) 45vw, 23vw"
          : "(max-width: 640px) 90vw, 30vw"
      }
      alt={alt}
      loading="lazy"
      decoding="async"
      width={portrait ? 576 : 899}
      height={portrait ? 576 : 506}
    />
  );
}
export function Dialog({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      old?.focus();
    };
  }, []);
  return (
    <dialog
      className={wide ? "modal wide" : "modal"}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={tx("Close dialog")}
        >
          <X size={22} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="badge-dot" />
      {children}
    </span>
  );
}
export function ExplorerLink({
  address,
  tx = false,
  label,
}: {
  address: string;
  tx?: boolean;
  label?: string;
}) {
  return (
    <a
      className="explorer"
      href={`https://etherscan.io/${tx ? "tx" : "address"}/${address}`}
      target="_blank"
      rel="noreferrer"
    >
      {label || `${address.slice(0, 6)}…${address.slice(-4)}`}
      <ArrowUpRight size={13} />
    </a>
  );
}
export function Busy({ text = "Loading live state…" }: { text?: string }) {
  return (
    <span className="busy">
      <LoaderCircle size={16} className="spin" />
      {text}
    </span>
  );
}
export function DownloadButton({
  data,
  filename,
  children,
}: {
  data: string;
  filename: string;
  children: ReactNode;
}) {
  return (
    <button
      className="button secondary"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
    >
      {children}
    </button>
  );
}
/** Integer formatting: never converts token balances through an imprecise Number. */
export function fmt(value: bigint | undefined, decimals = 4, scale = 18) {
  if (value === undefined) return "—";
  const negative = value < 0n;
  const raw = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = raw.slice(0, -scale) || "0";
  const fraction = raw.slice(-scale).slice(0, decimals).replace(/0+$/, "");
  if (value !== 0n && whole === "0" && !fraction) return `${negative ? "−" : ""}<0.${"0".repeat(Math.max(0, decimals - 1))}1`;
  return `${negative ? "−" : ""}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? "." + fraction : ""}`;
}
export function useMotion() {
  const [enabled, setEnabled] = useState(
    !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(!mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return [enabled, setEnabled] as const;
}
let audio: AudioContext | undefined;
export function playTone(enabled: boolean, celebrate = false) {
  if (!enabled) return;
  audio ??= new AudioContext();
  void audio.resume();
  [0, 1, 2].slice(0, celebrate ? 3 : 1).forEach((i) => {
    const o = audio!.createOscillator(),
      g = audio!.createGain();
    o.type = "sine";
    o.frequency.value = [440, 554, 660][i];
    g.gain.setValueAtTime(0.035, audio!.currentTime + i * 0.08);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      audio!.currentTime + i * 0.08 + 0.18,
    );
    o.connect(g);
    g.connect(audio!.destination);
    o.start(audio!.currentTime + i * 0.08);
    o.stop(audio!.currentTime + i * 0.08 + 0.2);
  });
}
