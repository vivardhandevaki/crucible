import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/** Global `g b` → board, `g q` → queue. Ignores typing in inputs. */
export function useGlobalNav(): void {
  const navigate = useNavigate();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (pending.current === "g") {
        pending.current = null;
        if (e.key === "b") navigate("/");
        else if (e.key === "q") navigate("/queue");
        return;
      }
      if (e.key === "g") { pending.current = "g"; setTimeout(() => (pending.current = null), 800); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

/** `j`/`k` move selection, `enter` opens. Returns the selected index. */
export function useListNav(length: number, onOpen: (i: number) => void): number {
  const [sel, setSel] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "j") setSel((s) => Math.min(length - 1, s + 1));
      else if (e.key === "k") setSel((s) => Math.max(0, s - 1));
      else if (e.key === "Enter") onOpen(sel);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [length, sel, onOpen]);
  return sel;
}
