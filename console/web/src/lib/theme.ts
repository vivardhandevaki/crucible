import { useCallback, useEffect, useState } from "react";

/** Theme is an explicit user choice, persisted. Dark is the default. */
export type Theme = "dark" | "light";
const KEY = "crucible-theme";

export function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage may be unavailable — fall through */
  }
  // Fall back to whatever the pre-paint boot script resolved, so the hook and
  // the inline script never disagree. Defaults to dark.
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

export function applyTheme(t: Theme): void {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
}

/** Reactive theme hook: returns the current theme and a toggler. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);
  return [theme, toggle];
}
