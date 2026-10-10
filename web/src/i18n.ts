import { useSyncExternalStore } from "react";
import { translations } from "./translations";
export type Language = "tr" | "en";
let language: Language = "tr";
try { if (localStorage.getItem("prism-language") === "en") language = "en"; } catch {}
const listeners = new Set<() => void>();
export function setLanguage(next: Language) {
  language = next;
  if (typeof document !== "undefined") document.documentElement.lang = next;
  try { localStorage.setItem("prism-language", next); } catch {}
  listeners.forEach(fn => fn());
}
export const t = (turkish: string, english: string) => language === "tr" ? turkish : english;
export const tx = (english: string) => language === "tr" ? translations[english] || english : english;
export function useLanguage() {
  const lang = useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => language);
  return { lang, toggleLanguage: () => setLanguage(lang === "tr" ? "en" : "tr") };
}
