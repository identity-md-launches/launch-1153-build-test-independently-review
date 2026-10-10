/** One-time migration: old language choices must never change English rendering. */
export function clearLegacyLanguage() {
  try { localStorage.removeItem("prism-language"); } catch { /* Storage may be unavailable. */ }
  if (typeof document !== "undefined") document.documentElement.lang = "en";
}
clearLegacyLanguage();
